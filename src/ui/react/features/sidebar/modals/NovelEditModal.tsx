import React from "react";
import { App, Notice, TFile } from "obsidian";
import { createRoot } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../../main";
import { useNovelWriter } from "../../../store/novelWriterStore";
import { ThumbnailCropModal } from "../../codex/ThumbnailCropModal";
import {
  canvasToDataUrl,
  cropToCanvas,
  dataUrlToArrayBuffer,
  loadImage,
} from "../../../../../utils/image";
import { ReactNovelModal } from "./ReactNovelModal";

/** Modal independiente para editar una novela. */
export class NovelEditModal extends ReactNovelModal {
	constructor(
		app: App,
		private plugin: NovelWriterPlugin,
		private novelId: string
	) {
		super(app);
		this.modalEl.addClass("nw-novels-options-modal");
	}
	onOpen() {
		this.contentEl.empty();
		this.root = createRoot(this.contentEl);
		this.root.render(
			<NovelEditView
				plugin={this.plugin}
				novelId={this.novelId}
				close={() => this.close()}
			/>
		);
	}
}

export function openNovelEditModal(plugin: NovelWriterPlugin, id: string) {
	new NovelEditModal(plugin.app, plugin, id).open();
}

function NovelEditView({
	plugin,
	novelId,
	close,
}: {
	plugin: NovelWriterPlugin;
	novelId: string;
	close: () => void;
}) {
	const item = useNovelWriter(
		(s) => s.novels.find((n) => n.novela.id_novela === novelId) ?? null
	);
	const updateNovel = useNovelWriter((s) => s.updateNovel);
	const [name, setName] = React.useState(item?.novela.nombre ?? "");
	const [author, setAuthor] = React.useState(item?.novela.autor ?? "");
	const [thumbnail, setThumbnail] = React.useState<ArrayBuffer | null>(null);
	const [thumbnailPreview, setThumbnailPreview] = React.useState<string | null>(null);
	const [thumbnailName, setThumbnailName] = React.useState("");
	const [busy, setBusy] = React.useState(false);

	if (!item) return <p className="nw-muted">Novel not found.</p>;

	const current = item.novela.thumbnail
		? plugin.app.vault.getAbstractFileByPath(
				`${item.folderPath}/${item.novela.thumbnail}`
		  )
		: null;
	const currentUrl =
		current instanceof TFile
			? plugin.app.vault.getResourcePath(current)
			: null;

	const COVER_ASPECT = 3 / 4;
	const COVER_MAX_W = 480;
	const COVER_MIN_W = 240;
	const COVER_MIN_H = 320;

	const applyCover = (img: HTMLImageElement, url: string) => {
		const w = img.naturalWidth;
		const h = img.naturalHeight;
		if (w < COVER_MIN_W || h < COVER_MIN_H) {
			new Notice("Image is small, the cover may look pixelated.");
		}
		const isCoverRatio =
			Math.abs(w / h - COVER_ASPECT) / COVER_ASPECT <= 0.02;
		if (isCoverRatio) {
			const outW = Math.min(COVER_MAX_W, Math.max(1, w));
			const outH = Math.max(1, Math.round(outW / COVER_ASPECT));
			const canvas = cropToCanvas(img, 0, 0, w, h, outW, outH);
			const dataUrl = canvasToDataUrl(canvas, "image/jpeg", 0.9);
			URL.revokeObjectURL(url);
			acceptDataUrl(dataUrl);
		} else {
			new ThumbnailCropModal(
				plugin.app,
				url,
				(dataUrl) => {
					URL.revokeObjectURL(url);
					acceptDataUrl(dataUrl);
				},
				{ aspect: COVER_ASPECT, maxOutputWidth: COVER_MAX_W, format: "jpeg" }
			).open();
		}
	};

	const acceptDataUrl = (dataUrl: string) => {
		setThumbnail(dataUrlToArrayBuffer(dataUrl));
		setThumbnailPreview(dataUrl);
	};

	const onPickFile = async (file: File) => {
		const url = URL.createObjectURL(file);
		try {
			const img = await loadImage(url);
			applyCover(img, url);
		} catch (e: any) {
			URL.revokeObjectURL(url);
			new Notice(`Could not load image: ${e?.message ?? String(e)}`);
		}
	};

	const save = async () => {
		if (!name.trim()) return;
		setBusy(true);
		try {
			await updateNovel(
				novelId,
				{ nombre: name.trim(), autor: author.trim() },
				thumbnail
			);
			close();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="nw-direct-content">
            <div className="nw-modal-heading">
                <h3>Edit novel</h3>
            </div>
            <label>
                Name
                <input
                    className="nw-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </label>
            <label>
                Author
                <input
                    className="nw-input"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                />
            </label>
            <label>
                Thumbnail
                {(thumbnailPreview ?? currentUrl) && (
                    <img
                        className="nw-edit-thumbnail"
                        src={thumbnailPreview ?? currentUrl!}
                        alt="Thumbnail"
                    />
                )}
                <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setThumbnailName(file.name);
                            void onPickFile(file);
                        }
                    }}
                />
                {thumbnailName && (
                    <span className="nw-muted">{thumbnailName}</span>
                )}
            </label>
            <div className="nw-modal-actions">
                <button className="nw-btn" onClick={close}>
                    Cancel
                </button>
                <button
                    className="nw-btn nw-btn-primary"
                    disabled={!name.trim() || busy}
                    onClick={save}
                >
                    Save
                </button>
            </div>
		</div>
	);
}
