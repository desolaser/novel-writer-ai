import { Modal, TFolder, TFile, Notice } from 'obsidian';
import { useNovelWriter } from '../../../store/novelWriterStore';
import NovelImportOptionsModal from './NovelImportOptionsModal';
import { ensureFolder, joinPath } from '../../../../../infrastructure/storage/fsHelpers';
import type NovelWriterPlugin from '../../../../../../main';

export default class NovelFolderPickerModal extends Modal {
	setImportBusy: (value: boolean) => void = null;
	plugin: NovelWriterPlugin = null;

	constructor(
		app: any, 
		plugin: NovelWriterPlugin,
		setImportBusy: (value: boolean) => void
	) { 
		super(app);
		this.plugin = plugin;
		this.setImportBusy = setImportBusy;
	}

	onOpen() {
		this.titleEl.setText('Import novel');
		this.contentEl.createEl('p', { text: "Select the folder that contains the novel's chapters." });

		const folders = this.app.vault.getAllLoadedFiles()
			.filter((file: any): file is TFolder => file instanceof TFolder)
			.sort((a: TFolder, b: TFolder) => a.path.localeCompare(b.path));

		const list = this.contentEl.createDiv({ cls: 'nw-import-folder-list' });

		if (folders.length === 0) list.createEl('p', { text: 'No folders available.' });

		for (const folder of folders) {
			const button = list.createEl('button', { text: folder.path || '/', cls: 'nw-btn nw-btn-block' });
			button.onclick = () => { this.close(); this.onPick(folder); };
		}
	}
	
	collectNovelMarkdown(app: any, folder: TFolder): TFile[] {
		const root = folder.path.replace(/^\/+|\/+$/g, '').toLowerCase();
		return app.vault.getAllLoadedFiles()
			.filter((file: any): file is TFile => {
				if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'md') return false;
				const path = file.path.replace(/^\/+|\/+$/g, '').toLowerCase();
				return !root || path.startsWith(`${root}/`);
			});
	}

	compareNovelFiles(a: TFile, b: TFile): number {
		const result = this.compareNovelNames(a.name, b.name);
		return result || a.path.localeCompare(b.path);
	}	

	compareNovelNames(leftName: string, rightName: string): number {
		const tokenize = (value: string) => value.toLocaleLowerCase().match(/\d+|\D+/g) ?? [];
		const left = tokenize(leftName);
		const right = tokenize(rightName);
		for (let i = 0; i < Math.max(left.length, right.length); i++) {
			const l = left[i] ?? '';
			const r = right[i] ?? '';
			if (l === r) continue;
			if (/^\d+$/.test(l) && /^\d+$/.test(r)) return Number(l) - Number(r);
			return l.localeCompare(r);
		}
		return 0;
	}

	async moveImportedFile(plugin: NovelWriterPlugin, file: TFile, targetFolder: string): Promise<string> {
		const basePath = joinPath(targetFolder, file.name);
		if (file.path === basePath) return file.path;
		let targetPath = basePath;
		let suffix = 2;
		while (plugin.app.vault.getAbstractFileByPath(targetPath)) {
			targetPath = joinPath(targetFolder, `${file.basename} ${suffix++}.${file.extension}`);
		}
		await plugin.app.vault.rename(file, targetPath);
		return targetPath;
	}

	onClose() { this.contentEl.empty(); }
	
	importNovel = async (sourceFolder: TFolder, useStructure: boolean) => {
		const currentStore = useNovelWriter.getState().store;
		const novelId = currentStore?.activeNovelId;

		if (!currentStore || !novelId || !currentStore.activeFolderPath) {
			new Notice('Select an active novel before importing.');
			return;
		}

		this.setImportBusy(true);
		try {
			const files = this.collectNovelMarkdown(this.app, sourceFolder)
				.filter(file => file.basename.toLowerCase() !== '__config')
				.sort(this.compareNovelFiles);

			if (files.length === 0) { 
				new Notice('No Markdown files found in the selected folder.');
				return; 
			}

			const actos = await currentStore.listActos();
			let acto = actos[actos.length - 1];
			if (!acto) acto = await currentStore.createActo('Act 1');
			const existingChapters = await currentStore.listCapitulosByActo(acto.id_acto);
			const existingByPath = new Map(
				existingChapters
					.filter(chapter => chapter.archivo)
					.map(chapter => [chapter.archivo!, chapter])
			);

			const targetFolder = joinPath(currentStore.activeFolderPath, 'manuscrito', 'capitulos');
			if (useStructure) await ensureFolder(this.app, targetFolder);

			for (let index = 0; index < files.length; index++) {
				const file = files[index];
				let linkedPath = file.path;
				if (useStructure) {
					linkedPath = await this.moveImportedFile(this.plugin, file, targetFolder);
				}
				const existing = existingByPath.get(linkedPath);
				if (existing) {
					await currentStore.updateCapitulo(existing.id_capitulo, { nombre: file.basename, orden: index });
				} else {
					const chapter = await currentStore.createCapitulo(acto.id_acto, file.basename, index);
					await currentStore.linkCapituloArchivo(chapter.id_capitulo, linkedPath);
				}
			}
			
			const importedChapters = (await currentStore.listCapitulosByActo(acto.id_acto))
				.sort((a, b) => this.compareNovelNames(a.nombre, b.nombre));
			for (let index = 0; index < importedChapters.length; index++) {
				if (importedChapters[index].orden !== index) {
					await currentStore.updateCapitulo(importedChapters[index].id_capitulo, { orden: index });
				}
			}
			await useNovelWriter.getState().reloadAll();
			new Notice(`Novel imported: ${files.length} chapters.`);
		} catch (error: any) {
			new Notice(`Could not import the novel: ${error?.message ?? String(error)}`);
		} finally {
			this.setImportBusy(false);
		}
	}

	onPick = (folder: TFolder) => {
		new NovelImportOptionsModal(this.app, folder, (useStructure) => {
			void this.importNovel(folder, useStructure);
		}).open();
	}
}