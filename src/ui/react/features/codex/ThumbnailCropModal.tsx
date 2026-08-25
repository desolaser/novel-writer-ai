import { App, Modal } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React, { useEffect, useRef, useState } from 'react';
import { canvasToDataUrl, cropToCanvas } from '../../../../utils/image';

export type CropFormat = 'png' | 'jpeg';

export interface CropOptions {
	/** Width/height ratio of the selection. Default 1 (square). E.g. 3/4 for a book cover. */
	aspect?: number;
	/** Max output width in source pixels. Default 480. */
	maxOutputWidth?: number;
	/** Output format. Default png. */
	format?: CropFormat;
}

const MAX_DISPLAY = 480;
const MIN_WIDTH = 60;

export class ThumbnailCropModal extends Modal {
	private root: Root | null = null;
	private imageUrl: string;
	private onConfirm: (dataUrl: string) => void;
	private opts: CropOptions;
	constructor(app: App, imageUrl: string, onConfirm: (dataUrl: string) => void, opts: CropOptions = {}) {
		super(app);
		this.imageUrl = imageUrl;
		this.onConfirm = onConfirm;
		this.opts = opts;
		this.modalEl.addClass('nw-crop-modal-wrap');
	}
	async onOpen() {
		this.root = createRoot(this.contentEl);
		this.root.render(React.createElement(ThumbnailCropView, {
			imageUrl: this.imageUrl,
			aspect: this.opts.aspect ?? 1,
			maxOutputWidth: this.opts.maxOutputWidth ?? 480,
			format: this.opts.format ?? 'png',
			onConfirm: (d: string) => { this.onConfirm(d); this.close(); },
			onCancel: () => this.close(),
		}));
	}
	async onClose() { if (this.root) { this.root.unmount(); this.root = null; } }
}

type CropRect = { x: number; y: number; w: number };
type DragState = { type: 'move' | 'resize-br'; startX: number; startY: number; startCrop: CropRect } | null;

interface CropViewProps {
	imageUrl: string;
	aspect: number;
	maxOutputWidth: number;
	format: CropFormat;
	onConfirm: (dataUrl: string) => void;
	onCancel: () => void;
}

function ThumbnailCropView({ imageUrl, aspect, maxOutputWidth, format, onConfirm, onCancel }: CropViewProps) {
	const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
	const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
	const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0 });
	const dragRef = useRef<DragState>(null);

	const h = (w: number) => w / aspect;

	useEffect(() => {
		const img = new Image();
		img.onload = () => setImgNatural({ w: img.naturalWidth, h: img.naturalHeight });
		img.onerror = () => console.error('ThumbnailCropModal: no se pudo cargar la imagen', imageUrl);
		img.src = imageUrl;
	}, [imageUrl]);

	useEffect(() => {
		if (!imgNatural) return;
		const scale = Math.min(MAX_DISPLAY / imgNatural.w, MAX_DISPLAY / imgNatural.h, 1);
		const dw = Math.round(imgNatural.w * scale);
		const dh = Math.round(imgNatural.h * scale);
		setDisplaySize({ w: dw, h: dh });
		// Initial selection: as big as possible while preserving the aspect ratio.
		const w = Math.min(dw, dh * aspect);
		setCrop({ x: Math.round((dw - w) / 2), y: Math.round((dh - h(w)) / 2), w });
	}, [imgNatural, aspect]);

	const doConfirm = () => {
		if (!displaySize || !imgNatural) return;
		const scaleX = imgNatural.w / displaySize.w;
		const scaleY = imgNatural.h / displaySize.h;
		const scale = Math.min(scaleX, scaleY);
		const sx = Math.round(crop.x * scaleX);
		const sy = Math.round(crop.y * scaleY);
		const sw = Math.round(crop.w * scale);
		const sh = Math.round(h(crop.w) * scale);
		const img = new Image();
		img.onload = () => {
			const outW = Math.min(maxOutputWidth, sw);
			const outH = Math.max(1, Math.round(outW / aspect));
			const canvas = cropToCanvas(img, sx, sy, sw, sh, outW, outH);
			const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
			onConfirm(canvasToDataUrl(canvas, mime, 0.9));
		};
		img.onerror = () => console.error('ThumbnailCropModal: no se pudo cargar la imagen para exportar', imageUrl);
		img.src = imageUrl;
	};

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
			if (e.key === 'Enter') { e.preventDefault(); doConfirm(); }
		};
		document.addEventListener('keydown', onKey);
		return () => document.removeEventListener('keydown', onKey);
	}, [imgNatural, displaySize, crop]);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			const d = dragRef.current;
			if (!d || !displaySize) return;
			const dx = e.clientX - d.startX;
			const dy = e.clientY - d.startY;
			const s = d.startCrop;
			if (d.type === 'move') {
				const cw = s.w;
				const ch = h(cw);
				const nx = Math.max(0, Math.min(displaySize.w - cw, s.x + dx));
				const ny = Math.max(0, Math.min(displaySize.h - ch, s.y + dy));
				setCrop({ x: nx, y: ny, w: cw });
			} else if (d.type === 'resize-br') {
				const delta = Math.max(dx, dy * aspect);
				const maxW = Math.min(displaySize.w - s.x, (displaySize.h - s.y) * aspect);
				const newW = Math.max(MIN_WIDTH, Math.min(maxW, s.w + delta));
				setCrop({ x: s.x, y: s.y, w: newW });
			}
		};
		const onUp = () => { dragRef.current = null; };
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
	}, [displaySize, aspect]);

	const onMouseDown = (e: React.MouseEvent, type: 'move' | 'resize-br') => {
		e.preventDefault(); e.stopPropagation();
		dragRef.current = { type, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
	};

	const thumbRule = (pos: string) => (
		<div key={pos} className={`nw-crop-rule nw-crop-rule-${pos}`} />
	);

	const cw = crop.w;
	const ch = h(cw);

	return (
		<div className="nw-crop-modal">
			<div className="nw-crop-header">
				<h3>Crop Image</h3>
				<p className="nw-muted" style={{ margin: 0, fontSize: 11 }}>Drag to move. Drag the bottom-right corner to resize. Enter to confirm, Esc to cancel.</p>
			</div>
			<div className="nw-crop-stage" style={{ width: displaySize ? displaySize.w : MAX_DISPLAY, height: displaySize ? displaySize.h : MAX_DISPLAY }}>
				{displaySize && (
					<>
						<img
							src={imageUrl}
							alt=""
							draggable={false}
							style={{ width: displaySize.w, height: displaySize.h, display: 'block', userSelect: 'none' }}
						/>
						<div className="nw-crop-overlay" style={{ width: displaySize.w, height: displaySize.h }}>
							<div
								className="nw-crop-selection"
								style={{ left: crop.x, top: crop.y, width: cw, height: ch }}
								onMouseDown={(e) => onMouseDown(e, 'move')}
							>
								{thumbRule('top')}
								{thumbRule('bottom')}
								{thumbRule('left')}
								{thumbRule('right')}
								<div className="nw-crop-handle nw-crop-handle-br" onMouseDown={(e) => onMouseDown(e, 'resize-br')} />
							</div>
						</div>
					</>
				)}
			</div>
			<div className="nw-crop-actions">
				<button className="nw-btn" onClick={onCancel}>Cancel</button>
				<button className="nw-btn nw-btn-primary" onClick={doConfirm}>Confirm</button>
			</div>
		</div>
	);
}
