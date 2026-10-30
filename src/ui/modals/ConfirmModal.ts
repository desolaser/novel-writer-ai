import { App, Modal, Setting } from 'obsidian';

/**
 * Yes/No dialog built on an Obsidian modal.
 *
 * Use it instead of `window.confirm()` / `window.alert()`: in Electron those
 * native dialogs can leave every text field unable to take keyboard input until
 * the window loses and regains focus, which looks like typing got blocked.
 */
export class ConfirmModal extends Modal {
	private confirmed = false;

	constructor(
		app: App,
		private readonly message: string,
		private readonly onResult: (confirmed: boolean) => void
	) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('p', { text: this.message });
		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('Yes')
				.setCta()
				.onClick(() => {
					this.confirmed = true;
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText('No')
				.onClick(() => this.close()));
	}

	onClose() {
		this.contentEl.empty();
		// Escape and clicking outside also land here, and count as "No".
		this.onResult(this.confirmed);
	}
}

/** Asks a yes/no question and resolves with the answer. */
export function confirmDialog(app: App, message: string): Promise<boolean> {
	return new Promise(resolve => {
		new ConfirmModal(app, message, resolve).open();
	});
}
