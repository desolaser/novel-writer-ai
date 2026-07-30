import { App, Modal } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React, { useEffect, useRef, useState } from 'react';

export class ThumbnailCropModal extends Modal {
	private root: Root | null = null;
	private imageUrl: string;
	private onConfirm: (dataUrl: string) => void;
	constructor(app: App, imageUrl: string, onConfirm: (dataUrl: string) => void) {
		super(app);
		this.imageUrl = imageUrl;
		this.onConfirm = onConfirm;
		this.modalEl.addClass('nw-crop-modal-wrap');
	}
	async onOpen() {
		this.root = createRoot(this.contentEl);
		this.root.render(React.createElement(ThumbnailCropView, {
			imageUrl: this.imageUrl,
			onConfirm: (d: string) => { this.onConfirm(d); this.close(); },
			onCancel: () => this.close(),
		}));
	}
	async onClose() { if (this.root) { this.root.unmount(); this.root = null; } }
}

type DragState = { type: 'move' | 'resize-br'; startX: number; startY: number; startCrop: { x: number; y: number; size: number } } | null;

const MAX_DISPLAY = 480;
const MIN_SIZE = 60;

function ThumbnailCropView({ imageUrl, onConfirm, onCancel }: { imageUrl: string; onConfirm: (dataUrl: string) => void; onCancel: () => void }) {
	const [imgNatural, setImgNatural] = useState<{ w: number; h: number } | null>(null);
	const [displaySize, setDisplaySize] = useState<{ w: number; h: number } | null>(null);
	const [crop, setCrop] = useState<{ x: number; y: number; size: number }>({ x: 0, y: 0, size: 0 });
	const dragRef = useRef<DragState>(null);

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
		const size = Math.min(dw, dh);
		setCrop({ x: Math.round((dw - size) / 2), y: Math.round((dh - size) / 2), size });
	}, [imgNatural]);

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
				const nx = Math.max(0, Math.min(displaySize.w - s.size, s.x + dx));
				const ny = Math.max(0, Math.min(displaySize.h - s.size, s.y + dy));
				setCrop({ x: nx, y: ny, size: s.size });
			} else if (d.type === 'resize-br') {
				const delta = Math.max(dx, dy);
				const newSize = Math.max(MIN_SIZE, Math.min(displaySize.w - s.x, displaySize.h - s.y, s.size + delta));
				setCrop({ x: s.x, y: s.y, size: newSize });
			}
		};
		const onUp = () => { dragRef.current = null; };
		document.addEventListener('mousemove', onMove);
		document.addEventListener('mouseup', onUp);
		return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
	}, [displaySize]);

	const onMouseDown = (e: React.MouseEvent, type: 'move' | 'resize-br') => {
		e.preventDefault(); e.stopPropagation();
		dragRef.current = { type, startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
	};

	const doConfirm = () => {
		if (!displaySize || !imgNatural) return;
		const scaleX = imgNatural.w / displaySize.w;
		const scaleY = imgNatural.h / displaySize.h;
		const scale = Math.min(scaleX, scaleY);
		const origX = Math.round(crop.x * scaleX);
		const origY = Math.round(crop.y * scaleY);
		const origSize = Math.round(crop.size * scale);
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = 256; canvas.height = 256;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(img, origX, origY, origSize, origSize, 0, 0, 256, 256);
			onConfirm(canvas.toDataURL('image/png'));
		};
		img.src = imageUrl;
	};

	const thumbRule = (pos: string) => (
		<div key={pos} className={`nw-crop-rule nw-crop-rule-${pos}`} />
	);

	return (
		<div className="nw-crop-modal">
			<div className="nw-crop-header">
				<h3>Crop Thumbnail</h3>
				<p className="nw-muted" style={{ margin: 0, fontSize: 11 }}>Arrastra para mover. Arrastra la esquina inferior derecha para redimensionar. Enter para confirmar, Esc para cancelar.</p>
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
								style={{ left: crop.x, top: crop.y, width: crop.size, height: crop.size }}
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
				<button className="nw-btn" onClick={onCancel}>Cancelar</button>
				<button className="nw-btn nw-btn-primary" onClick={doConfirm}>Confirmar</button>
			</div>
		</div>
	);
}