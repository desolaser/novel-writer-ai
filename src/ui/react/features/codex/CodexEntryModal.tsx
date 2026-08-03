import { App, Modal } from 'obsidian';
import { createRoot, Root } from 'react-dom/client';
import type NovelWriterPlugin from '../../../../../main';
import { CodexEntryEditor } from './CodexEntryEditor';
import { useNovelWriter } from '../../store/novelWriterStore';

export class CodexEntryModal extends Modal {
	private root: Root | null = null;
	constructor(app: App, private plugin: NovelWriterPlugin, private entryId: string) { super(app); }
	onOpen() { this.modalEl.addClass('nw-codex-modal'); const el = this.contentEl; el.empty(); useNovelWriter.getState().setEditingEntry(this.entryId); this.root = createRoot(el); this.root.render(<CodexEntryEditor plugin={this.plugin} onClose={() => this.close()} />); }
	onClose() { this.root?.unmount(); this.root = null; useNovelWriter.getState().setEditingEntry(null); this.contentEl.empty(); }
}
export function openEntryModal(plugin: NovelWriterPlugin, entryId: string) { new CodexEntryModal(plugin.app, plugin, entryId).open(); }
