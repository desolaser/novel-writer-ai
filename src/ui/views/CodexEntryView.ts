import { ItemView, ViewStateResult, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import { CodexEntryEditor } from "../react/features/codex/CodexEntryEditor";
import { useNovelWriter } from "../react/store/novelWriterStore";
import { initializeStore } from "./CompanionView";
import type NovelWriterPlugin from "../../../main";

export const VIEW_TYPE_CODEX_ENTRY = "novel-writer-codex-entry";

export interface CodexEntryViewState extends Record<string, unknown> {
	entryId: string | null;
}

/**
 * One codex entry open in the main area, like a note. Several can be open at
 * once in tabs or splits next to the manuscript, and Obsidian restores them
 * with the workspace because the entry id is part of the view state.
 */
export class CodexEntryView extends ItemView {
	private root: Root | null = null;
	private entryId: string | null = null;
	private unsubscribe: (() => void) | null = null;
	private lastTitle = "";

	constructor(leaf: WorkspaceLeaf, private plugin: NovelWriterPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_CODEX_ENTRY;
	}

	getIcon() {
		return "book-open";
	}

	getDisplayText() {
		return this.currentEntryName() || "Codex entry";
	}

	getEntryId(): string | null {
		return this.entryId;
	}

	getState(): Record<string, unknown> {
		return { ...super.getState(), entryId: this.entryId };
	}

	async setState(state: unknown, result: ViewStateResult): Promise<void> {
		const next = (state as Partial<CodexEntryViewState> | null)?.entryId;
		const entryId = typeof next === "string" ? next : null;
		// Replacing one entry with another goes into the tab history, so the
		// back and forward arrows return to the previous entry, as with notes.
		if (this.entryId && entryId !== this.entryId) result.history = true;
		this.entryId = entryId;
		this.render();
		this.refreshTitle();
		await super.setState(state, result);
	}

	async onOpen() {
		await initializeStore(this.plugin);
		// setState may already have rendered into the container.
		if (!this.root) this.contentEl.empty();
		this.contentEl.addClass("novel-writer-root", "nw-codex-entry-view");
		// The tab title follows renames made here, in the codex list or by the chat.
		this.unsubscribe = useNovelWriter.subscribe(() => this.refreshTitle());
		this.render();
		this.refreshTitle();
	}

	async onClose() {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.root?.unmount();
		this.root = null;
	}

	private render() {
		if (!this.root) this.root = createRoot(this.contentEl);
		this.root.render(
			React.createElement(CodexEntryEditor, {
				// A new entry in the same leaf starts a fresh editor and draft.
				key: this.entryId ?? "none",
				plugin: this.plugin,
				entryId: this.entryId,
				onClose: () => this.leaf.detach(),
			})
		);
	}

	private currentEntryName(): string {
		if (!this.entryId) return "";
		const entry = useNovelWriter
			.getState()
			.entradas.find((item) => item.id_entrada_codex === this.entryId);
		return entry?.nombre?.trim() ?? "";
	}

	private refreshTitle() {
		const title = this.getDisplayText();
		if (title === this.lastTitle) return;
		this.lastTitle = title;
		// Not in the public typings, but it is what redraws the tab header.
		(this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();
	}
}
