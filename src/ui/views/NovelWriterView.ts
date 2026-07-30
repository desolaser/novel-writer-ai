import { ItemView, WorkspaceLeaf } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React from 'react';
import { NovelWriterRoot } from '../react/root';
import { useNovelWriter } from '../react/store/novelWriterStore';
import type NovelWriterPlugin from '../../../main';

export const VIEW_TYPE_NOVELWRITER = 'novel-writer-view';

export class NovelWriterView extends ItemView {
	private root: Root | null = null;
	private plugin: NovelWriterPlugin;

	constructor(leaf: WorkspaceLeaf, plugin: NovelWriterPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType() { return VIEW_TYPE_NOVELWRITER; }
	getDisplayText() { return 'Novel Writer AI'; }
	getIcon() { return 'book'; }

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLElement;
		container.empty();
		container.addClass('novel-writer-root');

		useNovelWriter.getState().bindStore(this.plugin.store);
		await useNovelWriter.getState().refreshNovels();
		if (this.plugin.settings.data.lastActiveNovelId) {
			await useNovelWriter.getState().setActiveNovel(this.plugin.settings.data.lastActiveNovelId);
		}
		// sync UI prefs from settings
		const prefs = this.plugin.settings.data.uiPrefs;
		useNovelWriter.setState({
			sidebarWidth: prefs.sidebarWidth, sidebarCollapsed: prefs.sidebarCollapsed,
			activeWorkTab: prefs.activeWorkTab, activeSidebarTab: (prefs.activeSidebarTab as any) ?? 'codex',
		});

		this.root = createRoot(container);
		this.root.render(React.createElement(NovelWriterRoot, { plugin: this.plugin }));
	}

	async onClose() {
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
	}
}