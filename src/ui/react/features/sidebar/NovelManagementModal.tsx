import React from "react";
import { App, Modal, TFile } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../main";
import { useNovelWriter } from "../../store/novelWriterStore";
import { Icon } from "../../components/Icon";
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
				<h2>Ver novelas</h2>
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
					<p className="nw-muted">No hay novelas.</p>
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
				aria-label={`Seleccionar ${novela.nombre}`}
			>
				{image ? <img src={image} alt="" /> : <span>📖</span>}
			</button>
			<div className="nw-novel-card-info">
				<strong>{novela.nombre}</strong>
				<span className="nw-muted">
					{novela.autor || "Autor desconocido"}
				</span>
				<time>{novela.created_at.slice(0, 10)}</time>
			</div>
			<div className="nw-novel-card-actions">
				<button
					className="nw-icon-btn"
					onClick={onEdit}
					aria-label="Editar"
				>
					<Icon.Edit />
				</button>
				<button
					className="nw-icon-btn nw-danger-icon"
					onClick={onDelete}
					aria-label="Borrar"
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
	const [thumbnailName, setThumbnailName] = React.useState("");
	const [busy, setBusy] = React.useState(false);

	if (!item) return <p className="nw-muted">Novela no encontrada.</p>;

	const current = item.novela.thumbnail
		? plugin.app.vault.getAbstractFileByPath(
				`${item.folderPath}/${item.novela.thumbnail}`
		  )
		: null;
	const currentUrl =
		current instanceof TFile
			? plugin.app.vault.getResourcePath(current)
			: null;

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
                <h3>Editar novela</h3>
            </div>
            <label>
                Nombre
                <input
                    className="nw-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </label>
            <label>
                Autor
                <input
                    className="nw-input"
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                />
            </label>
            <label>
                Thumbnail
                {currentUrl && !thumbnail && (
                    <img
                        className="nw-edit-thumbnail"
                        src={currentUrl}
                        alt="Thumbnail actual"
                    />
                )}
                <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                            setThumbnail(await file.arrayBuffer());
                            setThumbnailName(file.name);
                        }
                    }}
                />
                {thumbnailName && (
                    <span className="nw-muted">{thumbnailName}</span>
                )}
            </label>
            <div className="nw-modal-actions">
                <button className="nw-btn" onClick={close}>
                    Cancelar
                </button>
                <button
                    className="nw-btn nw-btn-primary"
                    disabled={!name.trim() || busy}
                    onClick={save}
                >
                    Guardar
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
	if (!item) return <p className="nw-muted">Novela no encontrada.</p>;
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
            <h3>Borrar novela</h3>
            <p>
                ¿Estás seguro de borrar “{item.novela.nombre}”? Se eliminará
                todo su contenido del store.
            </p>
            <label className="nw-checkbox">
                <input
                    type="checkbox"
                    checked={deleteFolder}
                    onChange={(e) => setDeleteFolder(e.target.checked)}
                />{" "}
                Borrar también la carpeta del vault
            </label>
            <div className="nw-modal-actions">
                <button className="nw-btn" onClick={close}>
                    Cancelar
                </button>
                <button
                    className="nw-btn nw-btn-danger"
                    disabled={busy}
                    onClick={confirmDelete}
                >
                    <Icon.Trash /> Borrar
                </button>
            </div>
		</div>
	);
}
