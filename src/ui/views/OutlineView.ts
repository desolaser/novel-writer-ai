import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import { OutlineRoot } from "../react/outlineRoot";
import { initializeStore } from "./CompanionView";
import type NovelWriterPlugin from "../../../main";
export const VIEW_TYPE_OUTLINE = "novel-writer-outline";
export class OutlineView extends ItemView {
	private root: Root | null = null;
	constructor(leaf: WorkspaceLeaf, private plugin: NovelWriterPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_OUTLINE;
	}

	getDisplayText() {
		return "Novel Writer Outline";
	}

	getIcon() {
		return "list";
	}
	
	async onOpen() {
		await initializeStore(this.plugin);
		const el = this.containerEl.children[1] as HTMLElement;
		el.empty();
		el.addClass("novel-writer-root");
		this.root = createRoot(el);
		this.root.render(
			React.createElement(OutlineRoot, { plugin: this.plugin })
		);
	}
	async onClose() {
		this.root?.unmount();
		this.root = null;
	}
}
