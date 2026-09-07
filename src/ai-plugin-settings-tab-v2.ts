import { PluginSettingTab, Setting, App, Notice, Modal } from 'obsidian';
import type NovelWriterPlugin from '../main';
import { ModelRepository } from './infrastructure/settings/model-repository';
import { getProvider } from './constants/providers';
import { ModelModal } from './ui/modals/ModelModal';
import { CustomPromptsModal } from './ui/react/features/chat/CustomPromptsModal';

/** Plugin settings focused on selecting and managing reusable model profiles. */
export class NovelWriterSettingsTab extends PluginSettingTab {
	private readonly models: ModelRepository;

	constructor(app: App, private readonly plugin: NovelWriterPlugin) {
		super(app, plugin);
		this.models = new ModelRepository(plugin.settings);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl('h1', { text: 'Novel Writer AI' });
		this.renderModels(containerEl);
		this.renderGlobalPrompts(containerEl);
		this.renderChatOptions(containerEl);
		this.renderCodexOptions(containerEl);
	}

	private renderModels(host: HTMLElement): void {
		host.createEl('h3', { text: 'Models' });
		const saved = this.models.list();
		new Setting(host)
			.setName('Active Model')
			.setDesc('This profile is used for generations and chats. 🖌 = generates images. 👁 = accepts images (vision).')
			.addDropdown(dropdown => {
				dropdown.addOption('', saved.length ? 'Select a model' : 'No models created');
				saved.forEach(model => dropdown.addOption(model.id_modelo, `${model.supports_image_generation ? '🖌 ' : ''}${model.supports_vision ? '👁 ' : ''}${model.nombre_listado}`));
				dropdown.setValue(this.plugin.settings.data.modeloPredeterminadoId).onChange(async id => {
					if (!id) return;
					await this.models.setDefault(id); this.display();
				});
			})
			.addButton(button => button.setIcon('settings').setTooltip('Manage models').onClick(() => this.openManager()));
		if (!saved.length) host.createEl('p', { text: 'Create a model to start using the AI.' });
	}

	private openManager(): void {
		const modal = new Modal(this.app);
		modal.onOpen = () => {
			const content = modal.contentEl;
			content.createEl('h2', { text: 'Manage models' });
			let pendingDeletion: string | undefined;
			const render = () => {
				const list = content.querySelector('.nw-model-manager-list') as HTMLElement | null;
				list?.remove();
				const listHost = content.createDiv('nw-model-manager-list');
				const models = this.models.list();
				const deletionTarget = models.find(model => model.id_modelo === pendingDeletion);
				if (deletionTarget) {
					const warning = listHost.createDiv('nw-model-delete-confirm');
					warning.createEl('strong', { text: `Delete "${deletionTarget.nombre_listado}"?` });
					warning.createEl('p', { text: 'This action cannot be undone.' });
					const cancel = warning.createEl('button', { text: 'Cancel' });
					cancel.onclick = () => { pendingDeletion = undefined; render(); };
					const confirm = warning.createEl('button', { text: 'Delete', cls: 'mod-warning' });
					confirm.onclick = async () => {
						await this.models.remove(deletionTarget.id_modelo); pendingDeletion = undefined;
						new Notice('Model deleted.'); render(); this.display();
					};
				}
				if (!models.length) listHost.createEl('p', { text: 'No saved models.' });
				models.forEach(model => {
					const provider = getProvider(model.id_proveedor);
					new Setting(listHost).setName(`${model.supports_image_generation ? '🖌 ' : ''}${model.supports_vision ? '👁 ' : ''}${model.nombre_listado}`).setDesc(`${provider?.nombre_display ?? 'Unknown provider'} · ${model.nombre_modelo}`)
						.addToggle(toggle => toggle.setTooltip('Default model').setValue(this.plugin.settings.data.modeloPredeterminadoId === model.id_modelo).onChange(async value => {
							if (value) { await this.models.setDefault(model.id_modelo); render(); }
						}))
						.addButton(button => button.setIcon('pencil').setTooltip('Edit').onClick(() => {
							new ModelModal(this.plugin, model, () => { render(); this.display(); }).open();
						}))
						.addButton(button => button.setIcon('trash').setTooltip('Delete').onClick(() => {
							pendingDeletion = model.id_modelo; render();
						}));
				});
			};
			const create = content.createEl('button', { text: 'Create model', cls: 'mod-cta' });
			create.onclick = () => new ModelModal(this.plugin, undefined, () => { render(); this.display(); }).open();
			render();
		};
		modal.open();
	}

	private renderChatOptions(host: HTMLElement): void {
		const settings = this.plugin.settings.data;
		host.createEl('h3', { text: 'Chat Options' });
		new Setting(host)
			.setName('Chat name generation')
			.setDesc('How to generate a name for new chats after the first message.')
			.addDropdown(dropdown => {
				dropdown.addOption('local', 'Local heuristic');
				dropdown.addOption('active_model', 'Active model');
				dropdown.setValue(settings.chatNameGeneration ?? 'active_model');
				dropdown.onChange(async value => {
					settings.chatNameGeneration = value as 'local' | 'active_model';
					await this.plugin.settings.save();
				});
			});
	}

	private renderCodexOptions(host: HTMLElement): void {
		const settings = this.plugin.settings.data;
		host.createEl('h3', { text: 'Codex Options' });
		new Setting(host).setName('Search Range').addText(text => text.setValue(String(settings.codexOptions.searchRange)).onChange(async value => {
			const parsed = Number(value); if (!Number.isNaN(parsed)) { settings.codexOptions.searchRange = parsed; await this.plugin.settings.save(); }
		}));
		new Setting(host).setName('Lorebook %').addText(text => text.setValue(String(settings.codexOptions.lorebookPercentage)).onChange(async value => {
			const parsed = Number(value); if (parsed >= 0 && parsed <= 100) { settings.codexOptions.lorebookPercentage = parsed; await this.plugin.settings.save(); }
		}));
		new Setting(host).setName('Number chapters automatically').addToggle(toggle => toggle.setValue(settings.numerarCapitulosAuto).onChange(async value => {
			settings.numerarCapitulosAuto = value; await this.plugin.settings.save();
		}));
	}

	private renderGlobalPrompts(host: HTMLElement): void {
		const settings = this.plugin.settings.data;
		host.createEl('h3', { text: 'Global Prompt' });

		// Text prompt selector (reemplaza al prefix prompt deprecado)
		const textPrompts = settings.customPrompts.filter(p => p.tipo === 'text');
		const defaultTextId = settings.defaultTextPromptId;
		const selectedTextPrompt = textPrompts.find(p => p.id_prompt === defaultTextId);

		new Setting(host)
			.setName('Default Text Prompt')
			.setDesc('System prompt used for text generation. Replaces the old "Prompt Prefix".')
			.addDropdown(dropdown => {
				if (textPrompts.length === 0) {
					dropdown.addOption('', 'No text prompts');
					dropdown.setValue('');
				} else {
					textPrompts.forEach(p => dropdown.addOption(p.id_prompt, p.nombre));
					dropdown.setValue(defaultTextId || textPrompts[0]?.id_prompt || '');
				}
				dropdown.onChange(async id => {
					if (!id) return;
					await this.plugin.settings.setDefaultPrompt('text', id);
					this.display();
				});
			})
			.addButton(button => button.setIcon('settings').setTooltip('Manage prompts').onClick(() => {
				const modal = new CustomPromptsModal(this.app, this.plugin);
				modal.onClose = () => { modal.contentEl.empty(); this.display(); };
				modal.open();
			}));

		if (selectedTextPrompt) {
			const preview = host.createDiv('nw-prompt-preview');
			preview.createEl('p', { text: selectedTextPrompt.texto, cls: 'nw-muted' });
		}

		(['memoryContent', 'authorNote'] as const).forEach(key => {
			const labels = { memoryContent: 'Global Memory Content', authorNote: "Global Author's Note" };
			const section = host.createDiv('options-section'); section.createEl('p', { text: labels[key] });
			const textarea = section.createEl('textarea'); textarea.rows = 4; textarea.style.width = '100%'; textarea.value = settings[key];
			textarea.onchange = async () => { settings[key] = textarea.value; await this.plugin.settings.save(); };
		});
	}
}
