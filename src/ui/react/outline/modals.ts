import { App, FuzzySuggestModal, TFile, TFolder } from "obsidian";

/** Selector de archivo Markdown para vincular un capítulo a un manuscrito. */
export class ChapterFileModal extends FuzzySuggestModal<TFile> {
	constructor(app: App, private onPick: (file: TFile) => void) {
		super(app);
	}

	getItems(): TFile[] {
		return this.app.vault.getMarkdownFiles();
	}

	getItemText(file: TFile): string {
		return file.path;
	}

	onChooseItem(file: TFile): void {
		this.onPick(file);
	}
}

/** Selector de carpeta para crear todos los manuscritos en lote. */
export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	constructor(app: App, private onPick: (folder: TFolder) => void) {
		super(app);
	}

	getItems(): TFolder[] {
		return this.app.vault
			.getAllLoadedFiles()
			.filter((file): file is TFolder => file instanceof TFolder);
	}

	getItemText(folder: TFolder): string {
		return folder.path || "/";
	}

	onChooseItem(folder: TFolder): void {
		this.onPick(folder);
	}
}
