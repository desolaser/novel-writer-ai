import React from "react";
import { App, Modal } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../main";
import { useNovelWriter } from "../../store/novelWriterStore";
import { BlueprintAiBar } from "./BlueprintAiBar";
import { BlueprintForm } from "./BlueprintForm";
import { StructurePreview } from "./StructurePreview";
import { useBlueprint } from "./useBlueprint";
import { useBlueprintAi } from "./useBlueprintAi";
import { useBlueprintOutline } from "./useBlueprintOutline";

/** Modal where the author lays out the base of a novel before writing anything. */
export class NovelBlueprintModal extends Modal {
	private root: Root | null = null;

	constructor(app: App, private plugin: NovelWriterPlugin) {
		super(app);
		this.modalEl.addClass("nw-blueprint-modal");
	}

	onOpen() {
		this.contentEl.empty();
		this.root = createRoot(this.contentEl);
		this.root.render(<BlueprintView plugin={this.plugin} close={() => this.close()} />);
	}

	onClose() {
		this.root?.unmount();
		this.root = null;
		this.contentEl.empty();
	}
}

export function openNovelBlueprintModal(plugin: NovelWriterPlugin) {
	new NovelBlueprintModal(plugin.app, plugin).open();
}

function BlueprintView({ plugin, close }: { plugin: NovelWriterPlugin; close: () => void }) {
	const activeNovelId = useNovelWriter((state) => state.activeNovelId);
	const controller = useBlueprint(plugin, close);
	const { blueprint } = controller;
	const ai = useBlueprintAi(
		plugin,
		blueprint,
		controller.suggestion,
		controller.acceptDeductions
	);
	const outline = useBlueprintOutline(
		plugin,
		blueprint,
		controller.suggestion,
		ai.instructions,
		controller.setStructureMarkdown
	);

	if (!activeNovelId)
		return <p className="nw-muted nw-blueprint-empty">Select or create a novel first.</p>;
	if (!blueprint) return <p className="nw-muted nw-blueprint-empty">Loading blueprint...</p>;

	return (
		<div className="nw-blueprint">
			<div className="nw-modal-heading">
				<h2>Novel setup</h2>
			</div>
			<BlueprintAiBar ai={ai} />
			<div className="nw-blueprint-body">
				<BlueprintForm blueprint={blueprint} controller={controller} ai={ai} />
				<StructurePreview
					markdown={blueprint.structureMarkdown}
					chapters={controller.markdownChapters}
					expectedChapters={blueprint.chapterCount}
					edited={blueprint.structureEdited}
					onChange={controller.setStructureMarkdown}
					onRebuild={controller.rebuildStructure}
					outline={outline}
				/>
			</div>
			<div className="nw-modal-actions">
				<label
					className="nw-checkbox nw-blueprint-bible-toggle"
					title="Send the premise, style, tense and language with every draft and chat request"
				>
					<input
						type="checkbox"
						checked={blueprint.includeInPrompts}
						onChange={(event) => controller.setField("includeInPrompts", event.target.checked)}
					/>
					Use as story bible
				</label>
				<span className="nw-muted nw-blueprint-note">
					Applying only creates acts and chapters. No manuscripts are written.
				</span>
				<button className="nw-btn" onClick={close}>
					Close
				</button>
				<button
					className="nw-btn nw-btn-primary"
					disabled={controller.busy || outline.busy || controller.markdownChapters === 0}
					onClick={() => void controller.apply()}
				>
					{controller.busy ? "Applying..." : "Apply to outline"}
				</button>
			</div>
		</div>
	);
}
