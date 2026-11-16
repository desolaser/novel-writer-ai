import { ItemView, WorkspaceLeaf } from "obsidian";
import { Root, createRoot } from "react-dom/client";
import React from "react";
import { CompanionRoot } from "../react/companionRoot";
import { useNovelWriter } from "../react/store/novelWriterStore";
import { resolveStartupNovelId } from "../../utils/startupNovel";
import type NovelWriterPlugin from "../../../main";

export const VIEW_TYPE_COMPANION = "novel-writer-companion";
export class CompanionView extends ItemView {
	private root: Root | null = null;
	constructor(leaf: WorkspaceLeaf, private plugin: NovelWriterPlugin) {
		super(leaf);
	}

	getViewType() {
		return VIEW_TYPE_COMPANION;
	}

	getDisplayText() {
		return "Novel Writer Companion";
	}

	getIcon() {
		return "book";
	}

	async onOpen() {
		await initializeStore(this.plugin);
		const el = this.containerEl.children[1] as HTMLElement;
		el.empty();
		el.addClass("novel-writer-root");
		this.root = createRoot(el);
		this.root.render(
			React.createElement(CompanionRoot, { plugin: this.plugin })
		);
	}

	async onClose() {
		this.root?.unmount();
		this.root = null;
	}
}

/** Store bound by the last initialization, and the promise doing it. */
let initializedFor: NovelWriterPlugin["store"] | null = null;
let initializing: Promise<void> | null = null;

/**
 * Loads the store once per plugin instance. Every view (companion, outline,
 * codex entries) calls this when it opens; running it again used to reset the
 * active chat and reload everything while the author was working.
 */
export function initializeStore(plugin: NovelWriterPlugin): Promise<void> {
	if (initializedFor === plugin.store && initializing) return initializing;
	initializedFor = plugin.store;
	initializing = loadStore(plugin).catch((error) => {
		// Let the next view retry instead of reusing a failed load.
		initializing = null;
		throw error;
	});
	return initializing;
}

async function loadStore(plugin: NovelWriterPlugin) {
	const state = useNovelWriter.getState();
	state.bindStore(plugin.store);
	state.bindSettings(plugin.settings);
	await state.refreshNovels();
	const id = resolveStartupNovelId(
		plugin.settings.data.lastActiveNovelId,
		useNovelWriter.getState().novels,
	);
	if (id) await state.setActiveNovel(id);
	const p = plugin.settings.data.uiPrefs;
	useNovelWriter.setState({
		activeSidebarTab: (p.activeSidebarTab as any) ?? "codex",
	});
}
