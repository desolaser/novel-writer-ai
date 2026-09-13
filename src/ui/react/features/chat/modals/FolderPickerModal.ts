import { FuzzySuggestModal, TFolder } from 'obsidian';

/** Modal to pick a vault folder. */
export class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	private onPick: (folder: TFolder) => void;
	private itemsCache: TFolder[];
	constructor(app: any, folders: TFolder[], onPick: (folder: TFolder) => void) {
		super(app);
		this.setPlaceholder('Select a folder...');
		this.itemsCache = folders;
		this.onPick = onPick;
	}
	getItems(): TFolder[] { return this.itemsCache; }
	getItemText(item: TFolder): string { return item.path; }
	onChooseItem(item: TFolder): void { this.onPick(item); }
}
