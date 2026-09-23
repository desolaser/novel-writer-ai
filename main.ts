import { Plugin, WorkspaceLeaf, Notice, App, Modal, Setting, Editor, Menu, MarkdownView, TFile, TFolder } from 'obsidian';
import { CompanionView, VIEW_TYPE_COMPANION } from './src/ui/views/CompanionView';
import { OutlineView, VIEW_TYPE_OUTLINE } from './src/ui/views/OutlineView';
import { NovelStore } from './src/infrastructure/storage/store';
import { SettingsService } from './src/infrastructure/settings/settings-service';
import { NovelWriterSettingsTab } from './src/ai-plugin-settings-tab-v2';
import { prepareImport, runImportGrouped, findExistingCategoria, listExistingCategorias } from './src/utils/lorebookImport';
import { LorebookImportReviewModal, type ImportReviewGroup } from './src/ui/react/features/codex/modals/LorebookImportReviewModal';
import { buildEditorPrompt } from './src/context/promptBuilder';
import { ApiFactory } from './src/factories/api-factory';
import { getActiveModelConfig } from './src/infrastructure/settings/active-model';
import { createCodexHighlighter, type CodexHighlighterControl } from './src/ui/editor/codexHighlighter';
import { openEntryModal } from './src/ui/react/features/codex/modals/CodexEntryModal';
import type { EditorAction } from './src/types/EditorAction';
import { validateEditorAction } from './src/infrastructure/settings/editor-action-repository';
import { resolveEditorActionContext } from './src/context/editorActionPrompt';
import { buildEditorActionPrompt } from './src/context/editorActionTemplate';

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
	private codexHighlighter: CodexHighlighterControl | null = null;
	private registeredEditorActions = new Map<string, string>();

	async onload() {
		this.settings = new SettingsService(this);
		await this.settings.load();

		this.store = new NovelStore(this.app);
		await this.store.refresh();

		if (this.settings.data.lastActiveNovelId) {
			await this.store.setActive(this.settings.data.lastActiveNovelId);
		}

		const { extension, control } = createCodexHighlighter({
			onOpenEntry: (entryId) => openEntryModal(this, entryId),
		});
		this.codexHighlighter = control;
		this.registerEditorExtension(extension);

		this.registerView(VIEW_TYPE_COMPANION, (leaf) => new CompanionView(leaf, this));
		this.registerView(VIEW_TYPE_OUTLINE, (leaf) => new OutlineView(leaf, this));
		this.registerEvent(this.app.vault.on('rename', (file) => {
			const folderPath = this.store.activeFolderPath;
			if (!(file instanceof TFile) || file.extension !== 'md' || !folderPath || !file.path.startsWith(`${folderPath}/`)) return;
			void import('./src/ui/react/store/novelWriterStore').then(({ useNovelWriter }) =>
				useNovelWriter.getState().reloadAll()
			);
		}));
		// Restore both working views automatically once Obsidian has finished restoring its layout.
		// Obsidian may restore persisted ItemViews just after layout-ready. Wait a
		// moment so we do not create a second Companion before that restoration is visible.
		this.app.workspace.onLayoutReady(() => { window.setTimeout(() => { void this.openWorkingViews(); }, 1000); });

		void import('./src/ui/react/store/novelWriterStore').then(({ useNovelWriter }) => {
			this.register(this.settings.subscribe(() => {
				useNovelWriter.setState((state) => ({
					settingsRevision: state.settingsRevision + 1,
				}));
			}));
			const initial = useNovelWriter.getState();
			let prevEntradas = initial.entradas;
			let prevCategorias = initial.categorias;
			if (prevEntradas.length) this.codexHighlighter?.update(prevEntradas, prevCategorias);
			const unsub = useNovelWriter.subscribe((s) => {
				if (s.entradas !== prevEntradas || s.categorias !== prevCategorias) {
					prevEntradas = s.entradas;
					prevCategorias = s.categorias;
					this.codexHighlighter?.update(s.entradas, s.categorias);
				}
			});
			this.register(() => unsub());
		});

		this.addRibbonIcon('book', 'Generate text', async () => { await this.generateEditorText(); });
		this.registerEvent(this.app.workspace.on('editor-menu', (menu: Menu, editor: Editor) => {
			this.addEditorMenuItems(menu, editor);
		}));

		this.addCommand({ id: 'open-novel-writer', name: 'Open Novel Writer Companion', callback: async () => { await this.activateCompanionView(); } });
		this.addCommand({ id: 'open-novel-writer-outline', name: 'Open Novel Writer Outline', callback: async () => { await this.activateOutlineView(); } });
		this.addCommand({ id: 'create-novel', name: 'Create new novel', callback: async () => { await this.createNovel(); } });
		this.addCommand({ id: 'import-legacy-lorebook', name: 'Import legacy lorebook', callback: async () => { await this.importLorebook(); } });
		this.addCommand({ id: 'generate-text', name: 'Generate text', editorCallback: async (_editor) => { await this.generateEditorText(_editor); } });
		this.syncEditorActionCommands();
		this.register(this.settings.subscribe(() => this.syncEditorActionCommands()));

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
		if (!result.nombre.trim()) { new Notice('The name is required.'); return; }
		await this.store.create(result.nombre.trim(), result.autor ?? '', '', result.thumbnail ?? null);
		this.settings.data.lastActiveNovelId = this.store.activeNovelId;
		await this.settings.save();
		new Notice(`Novel "${result.nombre}" created.`);
		const { useNovelWriter } = await import('./src/ui/react/store/novelWriterStore');
		await useNovelWriter.getState().refreshNovels();
		if (this.store.activeNovelId) await useNovelWriter.getState().setActiveNovel(this.store.activeNovelId);
	}

	async importLorebook() {
		new Notice('Starting lorebook import...');
		try {
			if (!this.store.activeNovelId) { new Notice('Import canceled: select or create a novel first.'); return; }
			const folderPath = this.store.activeFolderPath;
			if (!folderPath) { new Notice('Import canceled: no active novel.'); return; }
			new Notice('Select the lorebook folder you want to import.');
			const folder = await pickLorebookFolder(this.app);
			if (!folder) { new Notice('Import canceled: no folder was selected.'); return; }
			new Notice('Processing folder: ' + folder.path);
			const plan = await prepareImport(this.app, folder.path);
			if (plan.subfolders.length === 0 && plan.rootFiles.length === 0) { new Notice('No Markdown files found in ' + folder.path); return; }
			new Notice(`Found ${plan.rootFiles.length} entries in the root and ${plan.subfolders.length} subfolders.`);

			const existingCategorias = await listExistingCategorias(this.app, folderPath);
			const initialGroups: ImportReviewGroup[] = [];
			if (plan.rootFiles.length > 0) {
				const others = findExistingCategoria(existingCategorias, 'Others');
				initialGroups.push({ key: '__root__', nombre: 'Others', existingCategoriaId: others?.id_categoria ?? null, entries: plan.rootFiles.map(file => ({ file, nombre: file.basename })) });
			}
			for (const subfolder of plan.subfolders) {
				if (subfolder.files.length === 0) continue;
				const match = findExistingCategoria(existingCategorias, subfolder.name);
				initialGroups.push({ key: subfolder.path, nombre: subfolder.name, existingCategoriaId: match?.id_categoria ?? null, entries: subfolder.files.map(file => ({ file, nombre: file.basename })) });
			}
			if (initialGroups.length === 0) { new Notice('No Markdown files found in ' + folder.path); return; }

			const reviewModal = new LorebookImportReviewModal(this.app, initialGroups, existingCategorias);
			const resultPromise = reviewModal.waitForResult();
			reviewModal.open();
			const groups = await resultPromise;
			if (!groups) { new Notice('Import canceled.'); return; }

			new Notice('Importing lorebook...');
			const res = await runImportGrouped(this.app, folderPath, this.store.activeNovelId, groups);
			new Notice(`Imported ${res.entradas} entries and ${res.categoriasCreadas} categories from ${folder.path}.`);
			const { useNovelWriter } = await import('./src/ui/react/store/novelWriterStore');
			await useNovelWriter.getState().reloadAll();
		} catch (error: any) { new Notice('Error importing lorebook: ' + (error?.message ?? String(error))); }
	}

	private addEditorMenuItems(menu: Menu, editor: Editor) {
		menu.addItem(item => item.setTitle('Generate text').setIcon('sparkles').onClick(() => { void this.generateEditorText(editor); }));
		const actions = this.settings.data.editorActions.filter(action =>
			this.showsInMenu(action) && !validateEditorAction(action)
		);
		if (actions.length) menu.addSeparator();
		const groups = new Set<string>();
		for (const action of actions) {
			if (!action.menuGroup) {
				this.addActionMenuItem(menu, action, editor);
				continue;
			}
			if (groups.has(action.menuGroup)) continue;
			groups.add(action.menuGroup);
			const children = actions.filter(candidate =>
				candidate.menuGroup === action.menuGroup
			);
			menu.addItem(item => {
				const submenu = (item as MenuItemWithSubmenu).setSubmenu?.();
				item.setTitle(action.menuGroup);
				if (submenu) {
					for (const child of children) {
						this.addActionMenuItem(submenu, child, editor);
					}
				} else {
					item.setTitle(children[0].name).onClick(() => {
						void this.runEditorAction(children[0], editor);
					});
					for (const child of children.slice(1)) {
						this.addActionMenuItem(menu, child, editor);
					}
				}
			});
		}
	}

	private showsInMenu(action: EditorAction): boolean {
		return action.placement === 'context-menu' || action.placement === 'both';
	}

	private addActionMenuItem(menu: Menu, action: EditorAction, editor: Editor) {
		const title = action.menuGroup
			? action.name.replace(`${action.menuGroup} `, '')
			: action.name;
		menu.addItem(item => item.setTitle(title).onClick(() => {
			void this.runEditorAction(action, editor);
		}));
	}

	private syncEditorActionCommands(): void {
		const desired = new Map<string, EditorAction>();
		for (const action of this.settings.data.editorActions) {
			if (validateEditorAction(action)) continue;
			if (action.placement === 'command' || action.placement === 'both') {
				desired.set(action.id, action);
			}
		}
		for (const [id, previousName] of this.registeredEditorActions) {
			if (desired.get(id)?.name === previousName) continue;
			this.removeCommand(id);
			this.registeredEditorActions.delete(id);
		}
		for (const [id, action] of desired) {
			if (this.registeredEditorActions.has(id)) continue;
			this.addCommand({
				id,
				name: action.name,
				editorCallback: editor => {
					const current = this.settings.data.editorActions.find(
						item => item.id === id
					);
					if (current) void this.runEditorAction(current, editor);
				},
			});
			this.registeredEditorActions.set(id, action.name);
		}
	}

	private async runEditorAction(action: EditorAction, editor: Editor): Promise<void> {
		const note = editor.getValue();
		const selection = editor.getSelection();
		const from = editor.getCursor('from');
		const to = editor.getCursor('to');
		const cursor = editor.getCursor();
		const beforeCursor = editor.getRange({ line: 0, ch: 0 }, cursor);
		const input = action.input === 'before-cursor'
			? beforeCursor
			: action.input === 'selection-or-note' && !selection.trim()
				? note
				: selection;
		if (!input.trim()) {
			new Notice(action.input === 'selection'
				? 'Select text first.' : 'There is no text to process.');
			return;
		}
		try {
			let chapterOutline = '';
			const activeFile = this.app.workspace.getActiveFile();
			const folderPath = this.store.activeFolderPath
				?? activeFile?.parent?.path ?? '';
			if (activeFile && this.store.activeFolderPath
				&& /{{\s*chapter_outline\s*}}/.test(action.instruction)) {
				const chapters = await this.store.listCapitulos();
				const chapter = chapters.find(item => {
					if (!item.archivo) return false;
					const path = item.archivo.startsWith('escritura/')
						? `${this.store.activeFolderPath}/${item.archivo}`
						: item.archivo;
					return path === activeFile.path;
				});
				chapterOutline = chapter?.outline ?? '';
			}
			const storyBeforeCursor = beforeCursor.replace(
				/^---\s*[\s\S]*?---\s*/, ''
			);
			const extra = await resolveEditorActionContext(
				this.app, this.settings.data, folderPath, action,
				storyBeforeCursor, chapterOutline,
			);
			const prompt = buildEditorActionPrompt(action, {
				input, selection, note, before_cursor: beforeCursor, ...extra,
			});
			const result = await this.complete(prompt, action.name);
			if (!result) return;
			if (editor.getValue() !== note) {
				new Notice('The note changed during generation. No text was replaced.');
				return;
			}
			if (action.output === 'insert-at-cursor') {
				editor.replaceRange(result, cursor);
			} else if (action.input === 'selection-or-note' && !selection.trim()) {
				editor.setValue(result);
			} else if (action.input === 'before-cursor') {
				editor.replaceRange(result, { line: 0, ch: 0 }, cursor);
			} else {
				editor.replaceRange(result, from, to);
			}
		} catch (error: any) {
			new Notice('AI error: ' + (error?.message ?? String(error)));
		}
	}

	private async generateEditorText(editor?: Editor) {
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		const target = editor ?? activeView?.editor;
		if (!target) { new Notice('Open a note to generate text.'); return; }
		const cursor = target.getCursor();
		const beforeCursor = target.getRange({ line: 0, ch: 0 }, cursor);
		// Frontmatter is metadata, never story context. Keep it in the note but
		// exclude it from the prompt sent to the model and from Codex detection.
		const storyBeforeCursor = beforeCursor.replace(/^---\s*[\s\S]*?---\s*/, '');
		let insertionOffset = target.posToOffset(cursor);
		try {
			const settings = this.settings.data;
			let chapterOutline = '';
			if (settings.includeOutlineInContext && this.store.activeFolderPath) {
				const activeFile = this.app.workspace.getActiveFile();
				if (activeFile) {
					const chapters = await this.store.listCapitulos();
					const match = chapters.find(c => {
						if (!c.archivo) return false;
						const resolved = c.archivo.startsWith('escritura/')
							? `${this.store.activeFolderPath}/${c.archivo}`
							: c.archivo;
						return resolved === activeFile.path;
					});
					if (match?.outline?.trim()) chapterOutline = match.outline;
				}
			}
			const prompt = await buildEditorPrompt(
				this.app,
				this.store.activeFolderPath ??
					(this.app.workspace.getActiveFile()?.parent?.path ?? ''),
				settings, chapterOutline, storyBeforeCursor,
			);
			const result = await this.requestCompletion(prompt, 'Generating text');
			// Insert only new text. Replacing the document on every token resets
			// the editor's viewport; setting the cursor also forces it to scroll.
			const insertText = (text: string) => {
				const position = target.offsetToPos(insertionOffset);
				target.replaceRange(text, position);
				insertionOffset += text.length;
			};
			if (result.text) {
				insertText(result.text);
			} else if (result.stream) {
				for await (const chunk of this.readCompletionStream(result.stream)) {
					const piece = this.chunkText(chunk);
					if (!piece) continue;
					insertText(piece);
				}
			}
		} catch (error: any) { new Notice('AI error: ' + (error?.message ?? String(error))); }
		finally { this.operationStatusBarItem?.remove(); this.operationStatusBarItem = null; }
	}

	private async complete(prompt: string, action: string): Promise<string> {
		this.operationStatusBarItem?.remove();
		this.operationStatusBarItem = this.addStatusBarItem();
		this.operationStatusBarItem.setText(action + '…');
		new Notice(action + '…');
		const settings = this.settings.data;
		try {
			const active = getActiveModelConfig(settings, 'writing');
			if (!active.modelName) throw new Error('Configure a model in Settings.');
			const token = settings.apiToken[active.providerId] ?? '';
			const api = new ApiFactory().createApi(active.providerId, token);
			const result = await api.generateCompletion(prompt, active.modelName, active.options);
			if (result.stream && typeof result.stream[Symbol.asyncIterator] === 'function') {
				let text = '';
				for await (const chunk of result.stream as AsyncIterable<any>) {
					const piece = this.chunkText(chunk);
					if (piece) text += piece;
				}
				return text.trim();
			}
			const text = result.text?.trim() ?? '';
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
		const active = getActiveModelConfig(settings, 'writing');
		if (!active.modelName) throw new Error('Configure a model in Settings.');
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
		modal.titleEl.setText('Select lorebook folder');
		const folders = app.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder).sort((a, b) => a.path.localeCompare(b.path));
		const search = modal.contentEl.createEl('input', { type: 'search', placeholder: 'Search folder...' });
		search.style.width = '100%';
		const list = modal.contentEl.createDiv();
		list.style.maxHeight = '50vh'; list.style.overflowY = 'auto'; list.style.marginTop = '8px';
		const render = () => {
			list.empty();
			const query = search.value.trim().toLowerCase();
			const visible = folders.filter(folder => !query || folder.path.toLowerCase().includes(query));
			if (!visible.length) { list.createEl('p', { text: 'No folders found.' }); return; }
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
		modal.titleEl.setText('New novel');
		modal.modalEl.style.width = '480px';

		const wrap = modal.contentEl;
		wrap.style.display = 'flex';
		wrap.style.flexDirection = 'column';
		wrap.style.gap = '14px';

		let nombre = '';
		let autor = '';
		let thumb: ArrayBuffer | null = null;

		new Setting(wrap).setName('Name*').addText(t => t.onChange(v => nombre = v).setPlaceholder('Novel name'));
		new Setting(wrap).setName('Author').addText(t => t.onChange(v => autor = v).setPlaceholder('Author (optional)'));
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
		const cancel = btnRow.createEl('button', { text: 'Cancel' });
		const ok = btnRow.createEl('button', { text: 'Create' });
		ok.classList.add('mod-cta');

		let resolved = false;
		const done = (v: any) => { if (!resolved) { resolved = true; resolve(v); } };
		cancel.onclick = () => { done(null); modal.close(); };
		ok.onclick = () => { done({ nombre, autor, thumbnail: thumb }); modal.close(); };
		modal.onClose = () => done(null);
		modal.open();
	});
}
