import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { Modal, App, MarkdownView } from 'obsidian';
import { buildScenePrompt, buildCodexYaml, estimateTokens } from '../../../../context/promptBuilder';
import { getPromptMetaCascading, writePromptMeta } from '../../../../context/promptMeta';

export function ConfigPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const { store } = useNovelWriter();
	const [memory, setMemory] = useState('');
	const [authorNote, setAuthorNote] = useState('');
	const memoryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const authorTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [contextBusy, setContextBusy] = useState(false);

	// Cargar valores actuales de settings
	useEffect(() => {
		void getPromptMetaCascading(plugin.app, plugin.settings.data, 'memoryContent').then(setMemory);
		void getPromptMetaCascading(plugin.app, plugin.settings.data, 'authorNote').then(setAuthorNote);
		const refresh = () => {
			void getPromptMetaCascading(plugin.app, plugin.settings.data, 'memoryContent').then(setMemory);
			void getPromptMetaCascading(plugin.app, plugin.settings.data, 'authorNote').then(setAuthorNote);
		};
		plugin.app.workspace.on('active-leaf-change', refresh);
		return () => { plugin.app.workspace.off('active-leaf-change', refresh); };
	}, [plugin]);

	const saveMemory = useCallback((value: string) => {
		setMemory(value);
		if (memoryTimer.current) clearTimeout(memoryTimer.current);
		memoryTimer.current = setTimeout(async () => {
			await writePromptMeta(plugin.app, plugin.settings.data, 'memoryContent', value);
			await plugin.settings.save();
		}, 600);
	}, [plugin]);

	const saveAuthorNote = useCallback((value: string) => {
		setAuthorNote(value);
		if (authorTimer.current) clearTimeout(authorTimer.current);
		authorTimer.current = setTimeout(async () => {
			await writePromptMeta(plugin.app, plugin.settings.data, 'authorNote', value);
			await plugin.settings.save();
		}, 600);
	}, [plugin]);

	const openContextModal = useCallback(() => {
		if (!store?.activeFolderPath) return;
		setContextBusy(true);
		const settings = plugin.settings.data;
		const leaf = plugin.app.workspace.getMostRecentLeaf();
		const view = leaf?.view instanceof MarkdownView ? leaf.view : null;
		const currentText = view?.editor?.getValue() ?? '';
		const storyText = currentText.replace(/^---\s*[\s\S]*?---\s*/, '');
			Promise.all([buildScenePrompt(plugin.app, store.activeFolderPath, settings, '', storyText), buildCodexYaml(plugin.app, store.activeFolderPath, undefined, storyText, settings.codexOptions.searchRange), getPromptMetaCascading(plugin.app, settings, 'memoryContent'), getPromptMetaCascading(plugin.app, settings, 'authorNote')])
			.then(([prompt, codex, resolvedMemory, resolvedAuthor]) => {
				new ContextModal(plugin.app, prompt, storyText, codex, resolvedMemory, resolvedAuthor).open();
			})
			.catch(e => {
				new ContextModal(plugin.app, 'Error building context: ' + (e?.message ?? String(e))).open();
			})
			.finally(() => setContextBusy(false));
	}, [plugin, store?.activeFolderPath]);

	const openMemoryModal = useCallback(() => {
		new MemoryModal(plugin.app, plugin, setMemory).open();
	}, [plugin]);

	const openAuthorModal = useCallback(() => {
		new AuthorModal(plugin.app, plugin, setAuthorNote).open();
	}, [plugin]);

	return (
		<div className="options-view-container nw-config-legacy">
			<h4>Options</h4>
			<div className="options-section">
				<h5>Context</h5><p className="setting-item-description">Get a full view of what's sent to the AI</p>
				<div className="setting-item"><div className="setting-item-info"><div className="setting-item-name">View current context</div><div className="setting-item-description">Open a modal to see the full context sent to the AI</div></div><div className="setting-item-control"><button className="mod-cta nw-config-context-button" onClick={openContextModal} disabled={contextBusy || !store?.activeFolderPath}>{contextBusy ? 'Building...' : 'Current Context'}</button></div></div>
			</div>
			<div className="options-section">
				<h5>Memory</h5><p className="setting-item-description">The AI will better remember info placed here.</p>
				<div className="textarea-wrapper"><div className="textarea-label"><span>Memory content:</span><span className="token-count">{estimateTokens(memory)} tokens</span></div><textarea value={memory} onChange={e => saveMemory(e.target.value)} placeholder="Enter memory information..." rows={6} /></div>
				<div className="setting-item"><div className="setting-item-info"><div className="setting-item-name">Memory Modal</div><div className="setting-item-description">Open a modal to edit the memory</div></div><div className="setting-item-control"><button className="mod-cta" onClick={openMemoryModal}>[ ]</button></div></div>
			</div>
			<div className="options-section">
				<h5>Author's Note</h5><p className="setting-item-description">Info placed here will strongly influence AI output.</p>
				<div className="textarea-wrapper"><div className="textarea-label"><span>Author's note content:</span><span className="token-count">{estimateTokens(authorNote)} tokens</span></div><textarea value={authorNote} onChange={e => saveAuthorNote(e.target.value)} placeholder="Enter author's note..." rows={6} /></div>
				<div className="setting-item"><div className="setting-item-info"><div className="setting-item-name">Author's Note Modal</div><div className="setting-item-description">Open a modal to edit the author's note</div></div><div className="setting-item-control"><button className="mod-cta" onClick={openAuthorModal}>[ ]</button></div></div>
			</div>
		</div>
	);
}

/** Full-size editor used when the inline textarea is too small for the content. */
abstract class PromptMetaModal extends Modal {
	private readonly plugin: NovelWriterPlugin;
	private readonly key: 'memoryContent' | 'authorNote';
	private readonly title: string;
	private readonly description: string;
	private readonly onValueChange: (value: string) => void;

	protected constructor(app: App, plugin: NovelWriterPlugin, key: 'memoryContent' | 'authorNote', title: string, description: string, onValueChange: (value: string) => void) {
		super(app);
		this.plugin = plugin;
		this.key = key;
		this.title = title;
		this.description = description;
		this.onValueChange = onValueChange;
	}

	async onOpen() {
		const { contentEl, modalEl } = this;
		modalEl.addClass('context-modal-large');
		contentEl.empty();
		contentEl.createEl('h4', { text: this.title });
		contentEl.createEl('p', { text: this.description });
		const label = contentEl.createDiv('textarea-label');
		label.createSpan({ text: this.key === 'memoryContent' ? 'Memory content: ' : "Author's note content: " });
		const tokens = label.createSpan({ text: '0 tokens', cls: 'token-count' });
		const section = contentEl.createDiv('options-section');
		const wrapper = section.createDiv('textarea-wrapper');
		const textarea = wrapper.createEl('textarea', { attr: { rows: '38' } });
		textarea.placeholder = this.key === 'memoryContent' ? 'Enter memory information...' : "Enter author's note...";
		textarea.value = await getPromptMetaCascading(this.plugin.app, this.plugin.settings.data, this.key);
		tokens.setText(`${estimateTokens(textarea.value)} tokens`);
		textarea.addEventListener('input', () => {
			tokens.setText(`${estimateTokens(textarea.value)} tokens`);
			this.onValueChange(textarea.value);
			void this.save(textarea.value);
		});
	}

	private async save(value: string) {
		await writePromptMeta(this.plugin.app, this.plugin.settings.data, this.key, value);
		await this.plugin.settings.save();
	}

	onClose() {
		this.contentEl.empty();
	}
}

class MemoryModal extends PromptMetaModal {
	constructor(app: App, plugin: NovelWriterPlugin, onValueChange: (value: string) => void) {
		super(app, plugin, 'memoryContent', 'Memory', 'The AI will better remember info placed here.', onValueChange);
	}
}

class AuthorModal extends PromptMetaModal {
	constructor(app: App, plugin: NovelWriterPlugin, onValueChange: (value: string) => void) {
		super(app, plugin, 'authorNote', "Author's Note", 'Info placed here will strongly influence AI output.', onValueChange);
	}
}

/** Modal to display the full AI prompt context. */
class ContextModal extends Modal {
	private prompt: string;
	private story: string; private codex: string; private memory: string; private authorNote: string;

	constructor(app: App, prompt: string, story = '', codex = '', memory = '', authorNote = '') {
		super(app);
		this.prompt = prompt;
		this.story = story; this.codex = codex; this.memory = memory; this.authorNote = authorNote;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('options-view-container'); this.modalEl.addClass('context-modal-large');
		contentEl.createEl('h4', { text: 'Current Context' });

		const pre = contentEl.createEl('pre');
		pre.style.maxHeight = '70vh';
		pre.style.overflow = 'auto';
		pre.style.whiteSpace = 'pre-wrap';
		pre.style.wordBreak = 'break-word';
		pre.style.fontSize = '12px';
		pre.style.padding = '12px';
		pre.style.background = 'var(--background-secondary)';
		pre.style.borderRadius = '6px';
		pre.setText(this.prompt);
		const section = contentEl.createDiv('token-table-section'); section.createEl('h5', { text: 'Token Breakdown' });
		const table = section.createEl('table', { cls: 'token-table' }); const head = table.createEl('thead').createEl('tr'); head.createEl('th', { text: 'Identifier' }); head.createEl('th', { text: 'Tokens', cls: 'token-column' });
		const body = table.createEl('tbody'); const rows = [['Story', this.story], ['Memory', this.memory], ["Author's Note", this.authorNote], ['Lorebook', this.codex]];
		rows.forEach(([label, value]) => { const row = body.createEl('tr'); row.createEl('td', { text: label }); row.createEl('td', { text: String(estimateTokens(value)), cls: 'token-column' }); });
		const total = rows.reduce((sum, [, value]) => sum + estimateTokens(value), 0); const totalRow = body.createEl('tr', { cls: 'total-row' }); totalRow.createEl('td', { text: 'Total' }); totalRow.createEl('td', { text: String(total), cls: 'token-column' });

		const btnRow = contentEl.createDiv();
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.marginTop = '12px';
		btnRow.style.gap = '8px';

		const copyBtn = btnRow.createEl('button', { text: 'Copy to clipboard' });
		copyBtn.classList.add('mod-cta');
		copyBtn.onclick = () => {
			navigator.clipboard.writeText(this.prompt).then(() => {
				copyBtn.setText('Copied!');
				setTimeout(() => copyBtn.setText('Copy to clipboard'), 2000);
			});
		};

		const closeBtn = btnRow.createEl('button', { text: 'Close' });
		closeBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
