import { Modal, Setting } from 'obsidian';

/** Simple confirm modal. */
export class ConfirmModal extends Modal {
	private onConfirm: () => void;
	private message: string;
	constructor(app: any, message: string, onConfirm: () => void) {
		super(app);
		this.message = message;
		this.onConfirm = onConfirm;
	}
	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: this.message });
		new Setting(contentEl)
			.addButton(btn => btn.setButtonText('Yes').setCta().onClick(() => { this.onConfirm(); this.close(); }))
			.addButton(btn => btn.setButtonText('No').onClick(() => this.close()));
	}
	onClose() { this.contentEl.empty(); }
}
