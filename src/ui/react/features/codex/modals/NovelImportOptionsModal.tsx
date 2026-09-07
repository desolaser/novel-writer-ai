
import { Modal, TFolder } from 'obsidian';

export default class NovelImportOptionsModal extends Modal {
	private useStructure = true;

	constructor(app: any, private folder: TFolder, private onConfirm: (useStructure: boolean) => void) { super(app); }

	onOpen() {
		this.titleEl.setText('Import options');
		this.contentEl.createEl('p', { text: `Selected folder: ${this.folder.path}` });
		const row = this.contentEl.createDiv({ cls: 'nw-import-option' });
		const label = row.createEl('label');
		const checkbox = label.createEl('input', { attr: { type: 'checkbox' } });
		checkbox.checked = this.useStructure;
		checkbox.onchange = () => { this.useStructure = checkbox.checked; };
		label.createSpan({ text: ' Import into the new structure (writing/chapters)' });
		const actions = this.contentEl.createDiv({ cls: 'nw-modal-actions' });
		const cancel = actions.createEl('button', { text: 'Cancel', cls: 'nw-btn' });
		cancel.onclick = () => this.close();
		const accept = actions.createEl('button', { text: 'Import novel', cls: 'nw-btn nw-btn-primary' });
		accept.onclick = () => { this.close(); this.onConfirm(this.useStructure); };
	}

	onClose() { this.contentEl.empty(); }
}
