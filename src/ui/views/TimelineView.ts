import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import { TimelineRoot } from "../react/features/timeline/TimelineRoot";
import { initializeStore } from "./CompanionView";
import type NovelWriterPlugin from "../../../main";

export const VIEW_TYPE_TIMELINE = "novel-writer-timeline";

/** The story timeline of the active novel, in the main area. */
export class TimelineView extends ItemView {
	private root: Root | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: NovelWriterPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_TIMELINE;
	}

	getDisplayText() {
		return "Story timeline";
	}

	getIcon() {
		return "calendar-range";
	}

	async onOpen() {
		await initializeStore(this.plugin);
		const el = this.containerEl.children[1] as HTMLElement;
		el.empty();
		el.addClass("novel-writer-root");
		this.root = createRoot(el);
		this.root.render(React.createElement(TimelineRoot, { plugin: this.plugin }));
	}

	async onClose() {
		this.root?.unmount();
		this.root = null;
	}
}
