import React from "react";
import { App } from "obsidian";
import { createRoot } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../../main";
import { useNovelWriter } from "../../../store/novelWriterStore";
import { Icon } from "../../../components/Icon";
import { ReactNovelModal } from "./ReactNovelModal";

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

export function openNovelDeleteModal(plugin: NovelWriterPlugin, id: string) {
	new NovelDeleteModal(plugin.app, plugin, id).open();
}

function NovelDeleteView({
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
