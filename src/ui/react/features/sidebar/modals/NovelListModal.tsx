import { App, TFile } from "obsidian";
import { createRoot } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../../main";
import { useNovelWriter } from "../../../store/novelWriterStore";
import { Icon } from "../../../components/Icon";
import type { NovelScanResult } from "../../../../../infrastructure/storage/repos/NovelRepo";
import { ReactNovelModal } from "./ReactNovelModal";
import { openNovelEditModal } from "./NovelEditModal";
import { openNovelDeleteModal } from "./NovelDeleteModal";

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

export function openNovelManagementModal(plugin: NovelWriterPlugin) {
	new NovelManagementModal(plugin.app, plugin).open();
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
