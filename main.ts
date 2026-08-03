import { Plugin, WorkspaceLeaf, Notice, App, Modal, Setting } from 'obsidian';
import { CompanionView, VIEW_TYPE_COMPANION } from './src/ui/views/CompanionView';
import { OutlineView, VIEW_TYPE_OUTLINE } from './src/ui/views/OutlineView';
import { NovelStore } from './src/infrastructure/storage/store';
import { SettingsService } from './src/infrastructure/settings/settings-service';
import { NovelWriterSettingsTab } from './src/ai-plugin-settings-tab-v2';
import { prepareImport, runImport } from './src/utils/lorebookImport';

// onLayoutReady callbacks from a hot-reloaded plugin instance can overlap with
// callbacks left by the previous instance. Keep the lock outside the class so
// those instances share the same reservation while creating the leaves.
const AUTO_OPEN_LOCK = '__novelWriterAutoOpenLock';

export default class NovelWriterPlugin extends Plugin {
	store!: NovelStore;
	settings!: SettingsService;
	private openingWorkingViews = false;

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

		this.addRibbonIcon('book', 'Novel Writer Companion', async () => { await this.activateCompanionView(); });

		this.addCommand({ id: 'open-novel-writer', name: 'Open Novel Writer Companion', callback: async () => { await this.activateCompanionView(); } });
		this.addCommand({ id: 'open-novel-writer-outline', name: 'Open Novel Writer Outline', callback: async () => { await this.activateOutlineView(); } });
		this.addCommand({ id: 'create-novel', name: 'Create new novel', callback: async () => { await this.createNovel(); } });
		this.addCommand({ id: 'import-legacy-lorebook', name: 'Import legacy lorebook', callback: async () => { await this.importLorebook(); } });

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
		const folder = window.prompt('Carpeta del lorebook legacy:', 'Lorebook');
		if (!folder) return;
		const plan = await prepareImport(this.app, folder);
		if (plan.subfolders.length === 0 && plan.rootFiles.length === 0) { new Notice('No se encontro contenido en ' + folder); return; }
		const selected = await pickSubfolders(this.app, plan);
		if (!selected) return;
		if (!this.store.activeNovelId) { new Notice('Selecciona o crea una novela primero.'); return; }
		const folderPath = this.store.activeFolderPath;
		if (!folderPath) { new Notice('No hay novela activa.'); return; }
		new Notice('Importando...');
		const res = await runImport(this.app, folderPath, this.store.activeNovelId, plan, selected);
		new Notice('Importadas ' + res.entradas + ' entradas, ' + res.categoriasCreadas + ' categorias.');
		const { useNovelWriter } = await import('./src/ui/react/store/novelWriterStore');
		await useNovelWriter.getState().reloadAll();
	}

	onunload() {}
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
