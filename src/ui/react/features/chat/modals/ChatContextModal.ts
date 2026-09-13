import { Modal } from 'obsidian';
import { estimateTokens } from '../../../../../context/promptBuilder';

/** Modal to display the full chat context/prompt being sent to the AI. */
export class ChatContextModal extends Modal {
	private prompt: string;
	private breakdown: Array<{ label: string; content: string }>;

	constructor(app: any, prompt: string, breakdown: Array<{ label: string; content: string }>) {
		super(app);
		this.prompt = prompt;
		this.breakdown = breakdown;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('options-view-container');
		this.modalEl.addClass('context-modal-large');
		contentEl.createEl('h4', { text: 'Chat Context' });

		const pre = contentEl.createEl('pre');
		pre.style.maxHeight = '40vh';
		pre.style.overflow = 'auto';
		pre.style.whiteSpace = 'pre-wrap';
		pre.style.wordBreak = 'break-word';
		pre.style.fontSize = '12px';
		pre.style.padding = '12px';
		pre.style.background = 'var(--background-secondary)';
		pre.style.borderRadius = '6px';
		pre.setText(this.prompt);

		const section = contentEl.createDiv('token-table-section');
		section.createEl('h5', { text: 'Token Breakdown' });
		const table = section.createEl('table', { cls: 'token-table' });
		const head = table.createEl('thead').createEl('tr');
		head.createEl('th', { text: 'Identifier' });
		head.createEl('th', { text: 'Tokens', cls: 'token-column' });
		const body = table.createEl('tbody');
		const rows = this.breakdown.map(({ label, content }) => [label, content] as [string, string]);
		rows.forEach(([label, value]) => {
			const row = body.createEl('tr');
			row.createEl('td', { text: label });
			row.createEl('td', { text: String(estimateTokens(value)), cls: 'token-column' });
		});
		const total = rows.reduce((sum, [, value]) => sum + estimateTokens(value), 0);
		const totalRow = body.createEl('tr', { cls: 'total-row' });
		totalRow.createEl('td', { text: 'Total' });
		totalRow.createEl('td', { text: String(total), cls: 'token-column' });

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
