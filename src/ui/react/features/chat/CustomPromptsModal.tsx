import { Modal, App, Notice } from 'obsidian';
import type NovelWriterPlugin from '../../../../../main';
import type { CustomPrompt } from '../../../../domain/entities/CustomPrompt';
import { useNovelWriter } from '../../store/novelWriterStore';

/** Prevents Obsidian Modal from intercepting keystrokes inside inputs/textareas. */
function allowTyping(el: HTMLElement) {
	el.addEventListener('keydown', evt => evt.stopPropagation());
	el.addEventListener('keyup', evt => evt.stopPropagation());
	el.addEventListener('keypress', evt => evt.stopPropagation());
}

/**
 * Modal para gestionar los Prompts Custom del sistema.
 * Permite ver, crear, editar y borrar prompts de tipo 'chat' y 'text'.
 */
export class CustomPromptsModal extends Modal {
	private plugin: NovelWriterPlugin;

	constructor(app: App, plugin: NovelWriterPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('nw-custom-prompts-modal');

		contentEl.createEl('h2', { text: 'Custom Prompts' });

		const tabBar = contentEl.createDiv('nw-prompts-tabs');
		const chatTab = tabBar.createEl('button', { text: 'Chat Prompts', cls: 'nw-prompts-tab active' });
		const textTab = tabBar.createEl('button', { text: 'Text Prompts', cls: 'nw-prompts-tab' });

		const listContainer = contentEl.createDiv('nw-prompts-list');

		const settings = this.plugin.settings;
		const store = useNovelWriter.getState();

		function makeInput(parent: HTMLElement): HTMLInputElement {
			const el = parent.createEl('input', { type: 'text', cls: 'nw-input' });
			allowTyping(el);
			el.style.width = '100%';
			return el;
		}

		function makeTextarea(parent: HTMLElement): HTMLTextAreaElement {
			const el = parent.createEl('textarea', { cls: 'nw-input' });
			allowTyping(el);
			el.style.width = '100%';
			el.rows = 6;
			return el;
		}

		const renderList = (tipo: 'chat' | 'text') => {
			listContainer.empty();
			const prompts = settings.data.customPrompts.filter(p => p.tipo === tipo);
			const defaultId = tipo === 'chat' ? settings.data.defaultChatPromptId : settings.data.defaultTextPromptId;

			if (prompts.length === 0) {
				listContainer.createEl('p', { text: 'No prompts of this type.', cls: 'nw-muted' });
			}

			for (const prompt of prompts) {
				const item = listContainer.createDiv('nw-prompt-item');
				const isDefault = prompt.id_prompt === defaultId;

				const infoRow = item.createDiv('nw-prompt-item-info');
				const nameEl = infoRow.createEl('strong', { text: prompt.nombre });
				if (isDefault) {
					nameEl.createEl('span', { text: ' (default)', cls: 'nw-prompt-default-badge' });
				}
				infoRow.createEl('p', { text: prompt.texto, cls: 'nw-prompt-item-text' });

				const actions = item.createDiv('nw-prompt-item-actions');

				if (!isDefault) {
					const setDefaultBtn = actions.createEl('button', { text: 'Set Default', cls: 'nw-btn' });
					setDefaultBtn.onclick = async () => {
						await store.setDefaultPrompt(tipo, prompt.id_prompt);
						renderList(tipo);
					};
				}

				const editBtn = actions.createEl('button', { text: 'Edit', cls: 'nw-btn' });
				editBtn.onclick = () => showEditForm(prompt);

				const deleteBtn = actions.createEl('button', { text: 'Delete', cls: 'nw-btn nw-btn-danger' });
				const sameTypeCount = settings.data.customPrompts.filter(p => p.tipo === tipo).length;
				deleteBtn.disabled = sameTypeCount <= 1;
				deleteBtn.onclick = async () => {
					if (!confirm(`Delete the prompt "${prompt.nombre}"?`)) return;
					const success = await store.deleteCustomPrompt(prompt.id_prompt);
					if (!success) {
						new Notice('Cannot delete the last prompt of this type.');
					} else {
						new Notice('Prompt deleted.');
						renderList(tipo);
					}
				};
			}

			const addSection = listContainer.createDiv('nw-prompt-add-section');
			addSection.createEl('button', {
				text: `+ New ${tipo === 'chat' ? 'Chat' : 'Text'} Prompt`,
				cls: 'nw-btn nw-btn-primary',
			}).onclick = () => showCreateForm(tipo);
		};

		const showCreateForm = (tipo: 'chat' | 'text') => {
			listContainer.empty();
			const form = listContainer.createDiv('nw-prompt-form');

			form.createEl('h3', { text: `New ${tipo === 'chat' ? 'Chat' : 'Text'} Prompt` });

			form.createEl('label', { text: 'Name' });
			const nameInput = makeInput(form);
			nameInput.style.marginBottom = '8px';

			form.createEl('label', { text: 'Prompt text' });
			const textInput = makeTextarea(form);
			textInput.style.marginBottom = '12px';

			const btnRow = form.createDiv();
			btnRow.style.display = 'flex';
			btnRow.style.gap = '8px';

			const saveBtn = btnRow.createEl('button', { text: 'Save', cls: 'nw-btn nw-btn-primary' });
			saveBtn.onclick = async () => {
				const name = nameInput.value.trim();
				const text = textInput.value.trim();
				if (!name || !text) {
					new Notice('Name and text are required.');
					return;
				}
				await store.createCustomPrompt(tipo, name, text);
				new Notice('Prompt created.');
				renderList(tipo);
			};

			const cancelBtn = btnRow.createEl('button', { text: 'Cancel', cls: 'nw-btn' });
			cancelBtn.onclick = () => renderList(tipo);
		};

		const showEditForm = (prompt: CustomPrompt) => {
			listContainer.empty();
			const form = listContainer.createDiv('nw-prompt-form');

			form.createEl('h3', { text: 'Edit Prompt' });

			form.createEl('label', { text: 'Name' });
			const nameInput = makeInput(form);
			nameInput.value = prompt.nombre;
			nameInput.style.marginBottom = '8px';

			form.createEl('label', { text: 'Prompt text' });
			const textInput = makeTextarea(form);
			textInput.value = prompt.texto;
			textInput.style.marginBottom = '12px';

			const btnRow = form.createDiv();
			btnRow.style.display = 'flex';
			btnRow.style.gap = '8px';

			const saveBtn = btnRow.createEl('button', { text: 'Save', cls: 'nw-btn nw-btn-primary' });
			saveBtn.onclick = async () => {
				const name = nameInput.value.trim();
				const text = textInput.value.trim();
				if (!name || !text) {
					new Notice('Name and text are required.');
					return;
				}
				await store.updateCustomPrompt(prompt.id_prompt, { nombre: name, texto: text });
				new Notice('Prompt updated.');
				renderList(prompt.tipo);
			};

			const cancelBtn = btnRow.createEl('button', { text: 'Cancel', cls: 'nw-btn' });
			cancelBtn.onclick = () => renderList(prompt.tipo);
		};

		chatTab.onclick = () => {
			chatTab.classList.add('active');
			textTab.classList.remove('active');
			renderList('chat');
		};

		textTab.onclick = () => {
			textTab.classList.add('active');
			chatTab.classList.remove('active');
			renderList('text');
		};

		renderList('chat');
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
