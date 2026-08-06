import { Plugin, WorkspaceLeaf, Notice, App, Modal, Setting, Editor, Menu, MarkdownView, TFile, TFolder } from 'obsidian';
import { CompanionView, VIEW_TYPE_COMPANION } from './src/ui/views/CompanionView';
import { OutlineView, VIEW_TYPE_OUTLINE } from './src/ui/views/OutlineView';
import { NovelStore } from './src/infrastructure/storage/store';
import { SettingsService } from './src/infrastructure/settings/settings-service';
import { NovelWriterSettingsTab } from './src/ai-plugin-settings-tab-v2';
import { prepareImport, runImport } from './src/utils/lorebookImport';
import { buildScenePrompt } from './src/context/promptBuilder';
import { ApiFactory } from './src/factories/api-factory';
import { getActiveModelConfig } from './src/infrastructure/settings/active-model';

// onLayoutReady callbacks from a hot-reloaded plugin instance can overlap with
// callbacks left by the previous instance. Keep the lock outside the class so
// those instances share the same reservation while creating the leaves.
const AUTO_OPEN_LOCK = '__novelWriterAutoOpenLock';
type MenuItemWithSubmenu = { setSubmenu?: () => Menu };

export default class NovelWriterPlugin extends Plugin {
	store!: NovelStore;
	settings!: SettingsService;
	private openingWorkingViews = false;
	private operationStatusBarItem: HTMLElement | null = null;

	async onload() {
		this.settings = new SettingsService(this);
		await this.settings.load();

		this.store = new NovelStore(this.app);
		await this.store.refresh();

		if (this.settings.data.lastActiveNovelId) {
			await this.store.setActive(this.settings.data.lastActiveNovelId);
		}

		this.registerView(VIEW_TYPE_COMPANION, (leaf) => new CompanionView(leaf, this));
		this.registerView(VIEW_TYPE_OUTLINE, (leaf) => new OutlineView(leaf, this));
		// Restore both working views automatically once Obsidian has finished restoring its layout.
		// Obsidian may restore persisted ItemViews just after layout-ready. Wait a
		// moment so we do not create a second Companion before that restoration is visible.
		this.app.workspace.onLayoutReady(() => { window.setTimeout(() => { void this.openWorkingViews(); }, 1000); });

		this.addRibbonIcon('book', 'Generate text', async () => { await this.generateEditorText(); });
		this.registerEvent(this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
			this.addEditorMenuItems(menu, editor);
		}));

		this.addCommand({ id: 'open-novel-writer', name: 'Open Novel Writer Companion', callback: async () => { await this.activateCompanionView(); } });
		this.addCommand({ id: 'open-novel-writer-outline', name: 'Open Novel Writer Outline', callback: async () => { await this.activateOutlineView(); } });
		this.addCommand({ id: 'create-novel', name: 'Create new novel', callback: async () => { await this.createNovel(); } });
		this.addCommand({ id: 'import-legacy-lorebook', name: 'Import legacy lorebook', callback: async () => { await this.importLorebook(); } });
		this.addCommand({ id: 'generate-text', name: 'Generate text', editorCallback: async (_editor) => { await this.generateEditorText(_editor); } });
		this.addCommand({ id: 'summarize-selection', name: 'Summarize', editorCallback: async (editor) => { await this.transformSelection(editor, 'Summarize the selected text. Return only the summary.'); } });
		this.addCommand({ id: 'expand-selection', name: 'Expand', editorCallback: async (editor) => { await this.transformSelection(editor, 'Expand the selected text with useful detail while preserving its meaning and style. Return only the expanded text.'); } });
		this.addCommand({ id: 'shorten-selection', name: 'Shorten', editorCallback: async (editor) => { await this.transformSelection(editor, 'Shorten the selected text without losing its essential meaning. Return only the shortened text.'); } });
		this.addCommand({ id: 'rephrase-selection', name: 'Rephrase', editorCallback: async (editor) => { await this.transformSelection(editor, 'Rephrase the selected text clearly and naturally. Return only the rephrased text.'); } });
		this.addCommand({ id: 'correct-selection', name: 'Correct', editorCallback: async (editor) => { await this.correctEditorText(editor); } });
		this.addCommand({ id: 'translate-selection-spanish', name: 'Translate to Spanish', editorCallback: async (editor) => { await this.transformSelection(editor, 'Translate the selected text to Spanish. Return only the translation.'); } });
		this.addCommand({ id: 'translate-selection-english', name: 'Translate to English', editorCallback: async (editor) => { await this.transformSelection(editor, 'Translate the selected text to English. Return only the translation.'); } });

		this.addSettingTab(new NovelWriterSettingsTab(this.app, this)); //
	}

	async activateCompanionView() {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_COMPANION);
		let leaf: WorkspaceLeaf | null = null;
		if (leaves.length > 0) leaf = leaves[0];
		else {
			leaf = this.app.workspace.getLeftLeaf(true);
			if (leaf) await leaf.setViewState({ type: VIEW_TYPE_COMPANION, active: true });
		}
		if (leaf) this.app.workspace.revealLeaf(leaf);
	}
	async activateOutlineView() { const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OUTLINE); let leaf = leaves[0]; if (!leaf) { leaf = this.app.workspace.getRightLeaf(true); if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OUTLINE, active: true }); } if (leaf) this.app.workspace.revealLeaf(leaf); }
	async openOutlineChapter(chapterId: string) {
		await this.activateOutlineView();
		// Let React mount (or reveal) the outline before asking it to expand and focus
		// the requested chapter.
		window.setTimeout(() => window.dispatchEvent(new CustomEvent('novel-writer:open-outline-chapter', { detail: chapterId })), 50);
	}

	/** Opens the Companion on the left and the Outline on the right on every plugin load. */
	async openWorkingViews() {
		const runtime = globalThis as typeof globalThis & { [AUTO_OPEN_LOCK]?: boolean };
		if (this.openingWorkingViews || runtime[AUTO_OPEN_LOCK]) return;
		this.openingWorkingViews = true;
		runtime[AUTO_OPEN_LOCK] = true;
		try {
			this.removeDuplicateViews(VIEW_TYPE_COMPANION);
			this.removeDuplicateViews(VIEW_TYPE_OUTLINE);
			await this.activateCompanionView();
			await this.activateOutlineView();
		} finally {
			this.openingWorkingViews = false;
			runtime[AUTO_OPEN_LOCK] = false;
		}
	}

	private removeDuplicateViews(viewType: string) {
		const leaves = this.app.workspace.getLeavesOfType(viewType);
		for (const duplicate of leaves.slice(1)) duplicate.detach();
	}

	async createNovel() {
		const result = await promptNovel(this.app);
		if (!result) return;
		if (!result.nombre.trim()) { new Notice('El nombre es obligatorio.'); return; }
		await this.store.create(result.nombre.trim(), result.autor ?? '', '', result.thumbnail ?? null);
		this.settings.data.lastActiveNovelId = this.store.activeNovelId;
		await this.settings.save();
		new Notice(`Novela "${result.nombre}" creada.`);
		const { useNovelWriter } = await import('./src/ui/react/store/novelWriterStore');
		await useNovelWriter.getState().refreshNovels();
		if (this.store.activeNovelId) await useNovelWriter.getState().setActiveNovel(this.store.activeNovelId);
	}

	async importLorebook() {
		new Notice('Iniciando importación del lorebook...');
		try {
			if (!this.store.activeNovelId) { new Notice('Importación cancelada: selecciona o crea una novela primero.'); return; }
			const folderPath = this.store.activeFolderPath;
			if (!folderPath) { new Notice('Importación cancelada: no hay novela activa.'); return; }
			new Notice('Selecciona la carpeta del lorebook que quieres importar.');
			const folder = await pickLorebookFolder(this.app);
			if (!folder) { new Notice('Importación cancelada: no se seleccionó ninguna carpeta.'); return; }
			new Notice('Procesando carpeta: ' + folder.path);
			const plan = await prepareImport(this.app, folder.path);
			if (plan.subfolders.length === 0 && plan.rootFiles.length === 0) { new Notice('No se encontraron archivos Markdown en ' + folder.path); return; }
			new Notice(`Encontradas ${plan.rootFiles.length} entradas en la raíz y ${plan.subfolders.length} subcarpetas.`);
			// Import the complete selected folder recursively. The old second modal
			// made it too easy to confirm an empty selection and import nothing.
			const selected = plan.subfolders.map(subfolder => subfolder.name);
			new Notice(`Importando ${plan.rootFiles.length + plan.subfolders.reduce((total, subfolder) => total + subfolder.count, 0)} archivos Markdown...`);
			new Notice('Importando lorebook...');
			const res = await runImport(this.app, folderPath, this.store.activeNovelId, plan, selected);
			new Notice(`Importadas ${res.entradas} entradas y ${res.categoriasCreadas} categorías desde ${folder.path}.`);
			const { useNovelWriter } = await import('./src/ui/react/store/novelWriterStore');
			await useNovelWriter.getState().reloadAll();
		} catch (error: any) { new Notice('Error importando lorebook: ' + (error?.message ?? String(error))); }
	}

	private addEditorMenuItems(menu: Menu, editor: Editor) {
		menu.addItem(item => item.setTitle('Generate text').setIcon('sparkles').onClick(() => { void this.generateEditorText(editor); }));
		menu.addSeparator();
		const actions: Array<[string, string]> = [
			['Summarize', 'summarize-selection'], ['Expand', 'expand-selection'], ['Shorten', 'shorten-selection'],
			['Rephrase', 'rephrase-selection'], ['Correct', 'correct-selection'],
		];
		for (const [title, id] of actions) menu.addItem(item => item.setTitle(title).onClick(() => { void this.runEditorCommand(id, editor); }));
		menu.addItem(item => {
			// setSubmenu is available in current Obsidian builds but is not present in
			// older versions of the bundled type declarations.
			const submenu = (item as unknown as MenuItemWithSubmenu).setSubmenu?.();
			if (!submenu) {
				item.setTitle('Translate to Spanish').onClick(() => { void this.transformSelection(editor, 'Translate the selected text to Spanish. Return only the translation.'); });
				menu.addItem(child => child.setTitle('Translate to English').onClick(() => { void this.transformSelection(editor, 'Translate the selected text to English. Return only the translation.'); }));
				return;
			}
			item.setTitle('Translate to');
			submenu.addItem(child => child.setTitle('Spanish').onClick(() => { void this.transformSelection(editor, 'Translate the selected text to Spanish. Return only the translation.'); }));
			submenu.addItem(child => child.setTitle('English').onClick(() => { void this.transformSelection(editor, 'Translate the selected text to English. Return only the translation.'); }));
		});
	}

	private async runEditorCommand(id: string, editor: Editor) {
		const action: Record<string, (e: Editor) => Promise<void>> = {
			'summarize-selection': e => this.transformSelection(e, 'Summarize the selected text. Return only the summary.'),
			'expand-selection': e => this.transformSelection(e, 'Expand the selected text with useful detail while preserving its meaning and style. Return only the expanded text.'),
			'shorten-selection': e => this.transformSelection(e, 'Shorten the selected text without losing its essential meaning. Return only the shortened text.'),
			'rephrase-selection': e => this.transformSelection(e, 'Rephrase the selected text clearly and naturally. Return only the rephrased text.'),
			'correct-selection': e => this.correctEditorText(e),
		};
		if (action[id]) await action[id](editor);
	}

	private async correctEditorText(editor: Editor) {
		const text = editor.getSelection() || editor.getValue();
		if (!text.trim()) { new Notice('No hay texto para corregir.'); return; }
		try {
			const result = await this.complete('Correct all spelling, grammar, punctuation, and orthographic errors in the following text. Preserve its meaning and return only the corrected text.\n\nText:\n' + text, 'Corrigiendo texto');
			if (result) editor.getSelection() ? editor.replaceSelection(result) : editor.setValue(result);
		} catch (error: any) { new Notice('Error IA: ' + (error?.message ?? String(error))); }
	}

	private async generateEditorText(editor?: Editor) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const target = editor ?? activeView?.editor;
		if (!target) { new Notice('Abre una nota para generar texto.'); return; }
		const cursor = target.getCursor();
		const beforeCursor = target.getRange({ line: 0, ch: 0 }, cursor);
		// Frontmatter is metadata, never story context. Keep it in the note but
		// exclude it from the prompt sent to the model and from Codex detection.
		const storyBeforeCursor = beforeCursor.replace(/^---\s*[\s\S]*?---\s*/, '');
		const fullText = target.getValue();
		const afterCursor = fullText.slice(beforeCursor.length);
		try {
			const settings = this.settings.data;
			const prompt = await buildScenePrompt(this.app, this.store.activeFolderPath ?? (this.app.workspace.getActiveFile()?.parent?.path ?? ''), settings, '', storyBeforeCursor);
			const result = await this.requestCompletion(prompt, 'Generando texto');
			let generated = '';
			if (result.text) {
				generated = result.text;
				target.setValue(beforeCursor + generated + afterCursor);
				target.setCursor(target.offsetToPos(beforeCursor.length + generated.length));
			} else if (result.stream) {
				for await (const chunk of this.readCompletionStream(result.stream)) {
					const piece = this.chunkText(chunk);
					if (!piece) continue;
					generated += piece;
					target.setValue(beforeCursor + generated + afterCursor);
					target.setCursor(target.offsetToPos(beforeCursor.length + generated.length));
				}
			}
		} catch (error: any) { new Notice('Error IA: ' + (error?.message ?? String(error))); }
		finally { this.operationStatusBarItem?.remove(); this.operationStatusBarItem = null; }
	}

	private async transformSelection(editor: Editor, instruction: string) {
		const selected = editor.getSelection();
		if (!selected.trim()) { new Notice('Selecciona texto primero.'); return; }
		try {
			let replaced = false;
			let insertionOffset = editor.posToOffset(editor.getCursor('from'));
			await this.complete(`${instruction}\n\nText:\n${selected}`, this.operationLabel(instruction), chunk => {
				if (!replaced) {
					editor.replaceSelection(chunk);
					replaced = true;
					insertionOffset += chunk.length;
				} else {
					const position = editor.offsetToPos(insertionOffset);
					editor.replaceRange(chunk, position);
					insertionOffset += chunk.length;
				}
			});
		} catch (error: any) { new Notice('Error IA: ' + (error?.message ?? String(error))); }
	}

	private operationLabel(instruction: string): string {
		if (/summarize/i.test(instruction)) return 'Resumiendo selección';
		if (/expand/i.test(instruction)) return 'Expandiendo selección';
		if (/shorten/i.test(instruction)) return 'Acortando selección';
		if (/rephrase/i.test(instruction)) return 'Reescribiendo selección';
		if (/Spanish/i.test(instruction)) return 'Traduciendo a español';
		if (/English/i.test(instruction)) return 'Traduciendo a inglés';
		return 'Procesando selección';
	}

	private async complete(prompt: string, action: string, onChunk?: (chunk: string) => void): Promise<string> {
		this.operationStatusBarItem?.remove();
		this.operationStatusBarItem = this.addStatusBarItem();
		this.operationStatusBarItem.setText(action + '…');
		new Notice(action + '…');
		const settings = this.settings.data;
		try {
			const active = getActiveModelConfig(settings, 'generate');
			if (!active.modelName) throw new Error('Configura un modelo en Settings.');
			const token = settings.apiToken[active.providerId] ?? '';
			const api = new ApiFactory().createApi(active.providerId, token);
			const result = await api.generateCompletion(prompt, active.modelName, active.options);
			if (result.stream && typeof result.stream[Symbol.asyncIterator] === 'function') {
				let text = '';
				for await (const chunk of result.stream as AsyncIterable<any>) {
					const piece = this.chunkText(chunk);
					if (piece) { text += piece; onChunk?.(piece); }
				}
				return text.trim();
			}
			const text = result.text?.trim() ?? '';
			if (text) onChunk?.(text);
			return text;
		} finally {
			this.operationStatusBarItem?.remove();
			this.operationStatusBarItem = null;
		}
	}

	private async requestCompletion(prompt: string, action: string): Promise<any> {
		this.operationStatusBarItem?.remove();
		this.operationStatusBarItem = this.addStatusBarItem();
		this.operationStatusBarItem.setText(action + '…');
		new Notice(action + '…');
		const settings = this.settings.data;
		const active = getActiveModelConfig(settings, 'generate');
		if (!active.modelName) throw new Error('Configura un modelo en Settings.');
		const api = new ApiFactory().createApi(active.providerId, settings.apiToken[active.providerId] ?? '');
		return api.generateCompletion(prompt, active.modelName, active.options);
	}

	private async *readCompletionStream(stream: any): AsyncIterable<any> {
		if (typeof stream[Symbol.asyncIterator] === 'function') {
			for await (const chunk of stream as AsyncIterable<any>) yield chunk;
			return;
		}
		if (typeof stream.getReader !== 'function') return;
		const reader = stream.getReader();
		while (true) {
			const { value, done } = await reader.read();
			if (done) return;
			yield value;
		}
	}

	private chunkText(chunk: any): string {
		return chunk?.choices?.[0]?.delta?.content ?? chunk?.choices?.[0]?.text ?? chunk?.token ?? chunk?.text ?? '';
	}

	onunload() {}
}

async function pickLorebookFolder(app: App): Promise<TFolder | null> {
	return new Promise(resolve => {
		let done = false;
		const modal = new Modal(app);
		modal.titleEl.setText('Seleccionar carpeta de lorebook');
		const folders = app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder).sort((a, b) => a.path.localeCompare(b.path));
		const search = modal.contentEl.createEl('input', { type: 'search', placeholder: 'Buscar carpeta...' });
		search.style.width = '100%';
		const list = modal.contentEl.createDiv();
		list.style.maxHeight = '50vh'; list.style.overflowY = 'auto'; list.style.marginTop = '8px';
		const render = () => {
			list.empty();
			const query = search.value.trim().toLowerCase();
			const visible = folders.filter(folder => !query || folder.path.toLowerCase().includes(query));
			if (!visible.length) { list.createEl('p', { text: 'No se encontraron carpetas.' }); return; }
			for (const folder of visible) {
				const button = list.createEl('button', { text: folder.path || '/', cls: 'mod-list-item' });
				button.style.display = 'block'; button.style.width = '100%'; button.style.textAlign = 'left'; button.style.marginTop = '4px';
				button.onclick = () => { done = true; resolve(folder); modal.close(); };
			}
		};
		search.addEventListener('input', render);
		render();
		modal.onClose = () => { if (!done) resolve(null); };
		modal.open();
	});
}

/** Modal con Nombre (obligatorio), Autor (opcional) y Thumbnail (opcional). */
async function promptNovel(app: App): Promise<{ nombre: string; autor: string; thumbnail: ArrayBuffer | null } | null> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText('Nueva novela');
		modal.modalEl.style.width = '480px';

		const wrap = modal.contentEl;
		wrap.style.display = 'flex';
		wrap.style.flexDirection = 'column';
		wrap.style.gap = '14px';

		let nombre = '';
		let autor = '';
		let thumb: ArrayBuffer | null = null;

		new Setting(wrap).setName('Nombre*').addText(t => t.onChange(v => nombre = v).setPlaceholder('Nombre de la novela'));
		new Setting(wrap).setName('Autor').addText(t => t.onChange(v => autor = v).setPlaceholder('Autor (opcional)'));
		const thumbSetting = new Setting(wrap).setName('Thumbnail');
		const preview = thumbSetting.controlEl.createEl('img');
		preview.style.maxWidth = '60px';
		preview.style.maxHeight = '60px';
		preview.style.display = 'none';
		const input = thumbSetting.controlEl.createEl('input', { type: 'file' });
		input.accept = 'image/*';
		input.onchange = async () => {
				const f = input.files?.[0];
				if (!f) return;
				// Cuadrado via canvas
				const img = new Image();
				const url = URL.createObjectURL(f);
				img.onload = async () => {
					const size = Math.min(img.width, img.height);
					const canvas = document.createElement('canvas');
					canvas.width = 256; canvas.height = 256;
					const ctx = canvas.getContext('2d')!;
					const sx = (img.width - size) / 2, sy = (img.height - size) / 2;
					ctx.drawImage(img, sx, sy, size, size, 0, 0, 256, 256);
					URL.revokeObjectURL(url);
					preview.src = canvas.toDataURL('image/png');
					preview.style.display = '';
					thumb = await new Promise<ArrayBuffer>((r) => canvas.toBlob(b => { if (b) b.arrayBuffer().then(r); }, 'image/png'));
				};
				img.src = url;
			};

		const btnRow = wrap.createDiv();
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.gap = '8px';
		const cancel = btnRow.createEl('button', { text: 'Cancelar' });
		const ok = btnRow.createEl('button', { text: 'Crear' });
		ok.classList.add('mod-cta');

		let resolved = false;
		const done = (v: any) => { if (!resolved) { resolved = true; resolve(v); } };
		cancel.onclick = () => { done(null); modal.close(); };
		ok.onclick = () => { done({ nombre, autor, thumbnail: thumb }); modal.close(); };
		modal.onClose = () => done(null);
		modal.open();
	});
}
/** Modal para escoger subcarpetas a importar. */
async function pickSubfolders(app: App, plan: { subfolders: { name: string; path: string; count: number }[]; rootFiles: any[] }): Promise<string[] | null> {
	return new Promise((resolve) => {
		const modal = new Modal(app);
		modal.titleEl.setText('Importar lorebook legacy');
		modal.modalEl.style.width = '420px';
		const wrap = modal.contentEl;
		const checked = new Set<string>();
		plan.subfolders.forEach((s, i) => {
			const row = wrap.createDiv({ cls: 'mod-setting' });
			row.style.display = 'flex'; row.style.alignItems = 'center'; row.style.padding = '4px 0';
			const cb = row.createEl('input', { type: 'checkbox' });
			cb.checked = true; cb.style.marginRight = '8px';
			cb.onchange = () => { if (cb.checked) checked.add(s.name); else checked.delete(s.name); };
			checked.add(s.name);
			row.createEl('span', { text: `${s.name} (${s.count} .md)` });
		});
		wrap.createEl('p', { text: `Ademas se importaran ${plan.rootFiles.length} archivos sueltos en la raiz como "Otros".`, cls: 'setting-item-description' });
		const btnRow = wrap.createDiv();
		btnRow.style.display = 'flex'; btnRow.style.justifyContent = 'flex-end'; btnRow.style.gap = '8px'; btnRow.style.marginTop = '8px';
		btnRow.createEl('button', { text: 'Cancelar' }).onclick = () => { resolve(null); modal.close(); };
		const ok = btnRow.createEl('button', { text: 'Importar', cls: 'mod-cta' });
		let done = false;
		ok.onclick = () => { done = true; resolve(Array.from(checked)); modal.close(); };
		modal.onClose = () => { if (!done) resolve(null); };
		modal.open();
	});
}
