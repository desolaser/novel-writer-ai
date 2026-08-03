import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React from 'react';
import { CompanionRoot } from '../react/companionRoot';
import { useNovelWriter } from '../react/store/novelWriterStore';
import type NovelWriterPlugin from '../../../main';

export const VIEW_TYPE_COMPANION = 'novel-writer-companion';
export class CompanionView extends ItemView {
	private root: Root | null = null;
	constructor(leaf: WorkspaceLeaf, private plugin: NovelWriterPlugin) { super(leaf); }
	getViewType() { return VIEW_TYPE_COMPANION; }
	getDisplayText() { return 'Novel Writer Companion'; }
	getIcon() { return 'book'; }
	async onOpen() { await initializeStore(this.plugin); const el = this.containerEl.children[1] as HTMLElement; el.empty(); el.addClass('novel-writer-root'); this.root = createRoot(el); this.root.render(React.createElement(CompanionRoot, { plugin: this.plugin })); }
	async onClose() { this.root?.unmount(); this.root = null; }
}
export async function initializeStore(plugin: NovelWriterPlugin) { const state = useNovelWriter.getState(); state.bindStore(plugin.store); await state.refreshNovels(); const id = plugin.settings.data.lastActiveNovelId; if (id) await state.setActiveNovel(id); const p = plugin.settings.data.uiPrefs; useNovelWriter.setState({ sidebarWidth: p.sidebarWidth, sidebarCollapsed: p.sidebarCollapsed, activeSidebarTab: (p.activeSidebarTab as any) ?? 'codex' }); }
