import React from "react";
import { App, Modal, Notice, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../main";
import { useNovelWriter } from "../../store/novelWriterStore";
import { Icon } from "../../components/Icon";
import { ThumbnailCropModal } from "../codex/ThumbnailCropModal";
import {
  canvasToDataUrl,
  cropToCanvas,
  dataUrlToArrayBuffer,
  loadImage,
} from "../../../../utils/image";
import type { NovelScanResult } from "../../../../infrastructure/storage/repos/NovelRepo";

abstract class ReactNovelModal extends Modal {
	protected root: Root | null = null;
	onClose() {
		this.root?.unmount();
		this.root = null;
		this.contentEl.empty();
	}
}

/** Modal independiente que solo muestra y administra el listado de novelas. */
export class NovelManagementModal extends ReactNovelModal {
	constructor(app: App, private plugin: NovelWriterPlugin) {
		super(app);
		this.modalEl.addClass("nw-novels-modal");
	}
	onOpen() {
		this.contentEl.empty();
		this.root = createRoot(this.contentEl);
		this.root.render(
			<NovelListView plugin={this.plugin} close={() => this.close()} />
		);
	}
}

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

/** Modal independiente para confirmar el borrado de una novela. */
export class NovelDeleteModal extends ReactNovelModal {
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
			<NovelDeleteView
				plugin={this.plugin}
				novelId={this.novelId}
				close={() => this.close()}
			/>
		);
	}
}

export function openNovelManagementModal(plugin: NovelWriterPlugin) {
	new NovelManagementModal(plugin.app, plugin).open();
}
export function openNovelEditModal(plugin: NovelWriterPlugin, id: string) {
	new NovelEditModal(plugin.app, plugin, id).open();
}
export function openNovelDeleteModal(plugin: NovelWriterPlugin, id: string) {
	new NovelDeleteModal(plugin.app, plugin, id).open();
}

function NovelListView({
	plugin,
	close,
}: {
	plugin: NovelWriterPlugin;
	close: () => void;
}) {
	const { novels, activeNovelId, setActiveNovel } = useNovelWriter();
	const select = async (id: string) => {
		await setActiveNovel(id);
		close();
	};
	return (
		<div className="nw-novel-manager">
			<div className="nw-modal-heading">
				<h2>View novels</h2>
			</div>
			<div className="nw-novel-grid">
				{novels.map((item) => (
					<NovelCard
						key={item.novela.id_novela}
						item={item}
						plugin={plugin}
						active={item.novela.id_novela === activeNovelId}
						onSelect={() => select(item.novela.id_novela)}
						onEdit={() => {
							close();
							openNovelEditModal(plugin, item.novela.id_novela);
						}}
						onDelete={() => {
							close();
							openNovelDeleteModal(plugin, item.novela.id_novela);
						}}
					/>
				))}
				{novels.length === 0 && (
					<p className="nw-muted">No novels.</p>
				)}
			</div>
		</div>
	);
}

function NovelCard({
	item,
	plugin,
	active,
	onSelect,
	onEdit,
	onDelete,
}: {
	item: NovelScanResult;
	plugin: NovelWriterPlugin;
	active: boolean;
	onSelect: () => void;
	onEdit: () => void;
	onDelete: () => void;
}) {
	const { novela, folderPath } = item;
	const file = novela.thumbnail
		? plugin.app.vault.getAbstractFileByPath(
				`${folderPath}/${novela.thumbnail}`
		  )
		: null;
	const image =
		file instanceof TFile ? plugin.app.vault.getResourcePath(file) : null;
	return (
		<article className={`nw-novel-card ${active ? "active" : ""}`}>
			<button
				className="nw-novel-thumbnail"
				onClick={onSelect}
				aria-label={`Select ${novela.nombre}`}
			>
				{image ? <img src={image} alt="" /> : <span>📖</span>}
			</button>
			<div className="nw-novel-card-info">
				<strong>{novela.nombre}</strong>
				<span className="nw-muted">
					{novela.autor || "Unknown author"}
				</span>
				<time>{novela.created_at.slice(0, 10)}</time>
			</div>
			<div className="nw-novel-card-actions">
				<button
					className="nw-icon-btn"
					onClick={onEdit}
					aria-label="Edit"
				>
					<Icon.Edit />
				</button>
				<button
					className="nw-icon-btn nw-danger-icon"
					onClick={onDelete}
					aria-label="Delete"
				>
					<Icon.Trash />
				</button>
			</div>
		</article>
	);
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

function NovelDeleteView({
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
	const deleteNovel = useNovelWriter((s) => s.deleteNovel);
	const [deleteFolder, setDeleteFolder] = React.useState(false);
	const [busy, setBusy] = React.useState(false);
	if (!item) return <p className="nw-muted">Novel not found.</p>;
	const confirmDelete = async () => {
		setBusy(true);
		try {
			await deleteNovel(novelId, deleteFolder);
			close();
		} finally {
			setBusy(false);
		}
	};
	return (
		<div className="nw-direct-content">
            <h3>Delete novel</h3>
            <p>
                Are you sure you want to delete "{item.novela.nombre}"? All of
                its content will be removed from the store.
            </p>
            <label className="nw-checkbox">
                <input
                    type="checkbox"
                    checked={deleteFolder}
                    onChange={(e) => setDeleteFolder(e.target.checked)}
                />{" "}
                Also delete the vault folder
            </label>
            <div className="nw-modal-actions">
                <button className="nw-btn" onClick={close}>
                    Cancel
                </button>
                <button
                    className="nw-btn nw-btn-danger"
                    disabled={busy}
                    onClick={confirmDelete}
                >
                    <Icon.Trash /> Delete
                </button>
            </div>
		</div>
	);
}
