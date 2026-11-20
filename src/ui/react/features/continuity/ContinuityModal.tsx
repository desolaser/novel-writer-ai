import { App } from "obsidian";
import { createRoot } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../main";
import { ReactNovelModal } from "../sidebar/modals/ReactNovelModal";
import { ContinuityView, findChapter } from "./ContinuityView";

/** "Check continuity": the last report of a chapter, or a new check. */
export class ContinuityModal extends ReactNovelModal {
	constructor(
		app: App,
		private readonly plugin: NovelWriterPlugin,
		private readonly chapterId: string,
	) {
		super(app);
		this.modalEl.addClass("nw-continuity-modal");
	}

	onOpen() {
		const chapter = findChapter(this.chapterId);
		this.titleEl.setText(`Continuity: ${chapter?.nombre ?? "chapter"}`);
		this.contentEl.empty();
		this.root = createRoot(this.contentEl);
		this.root.render(
			<ContinuityView
				plugin={this.plugin}
				chapterId={this.chapterId}
				close={() => this.close()}
			/>
		);
	}
}

export function openContinuityModal(plugin: NovelWriterPlugin, chapterId: string) {
	new ContinuityModal(plugin.app, plugin, chapterId).open();
}
