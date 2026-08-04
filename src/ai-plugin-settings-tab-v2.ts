import { PluginSettingTab, Setting, App, Notice, Modal } from 'obsidian';
import type NovelWriterPlugin from '../main';
import { ModelRepository } from './infrastructure/settings/model-repository';
import { getProvider } from './constants/providers';
import { ModelModal } from './ui/modals/ModelModal';

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
		this.renderCodexOptions(containerEl);
		this.renderGlobalPrompts(containerEl);
	}

	private renderModels(host: HTMLElement): void {
		host.createEl('h3', { text: 'Modelos' });
		const saved = this.models.list();
		new Setting(host)
			.setName('Modelo activo')
			.setDesc('Este perfil se utiliza para las generaciones y los chats.')
			.addDropdown(dropdown => {
				dropdown.addOption('', saved.length ? 'Selecciona un modelo' : 'No hay modelos creados');
				saved.forEach(model => dropdown.addOption(model.id_modelo, model.nombre_listado));
				dropdown.setValue(this.plugin.settings.data.modeloPredeterminadoId).onChange(async id => {
					if (!id) return;
					await this.models.setDefault(id); this.display();
				});
			})
			.addButton(button => button.setIcon('settings').setTooltip('Gestionar modelos').onClick(() => this.openManager()));
		if (!saved.length) host.createEl('p', { text: 'Crea un modelo para comenzar a usar la IA.' });
	}

	private openManager(): void {
		const modal = new Modal(this.app);
		modal.onOpen = () => {
			const content = modal.contentEl;
			content.createEl('h2', { text: 'Gestionar modelos' });
			let pendingDeletion: string | undefined;
			const render = () => {
				const list = content.querySelector('.nw-model-manager-list') as HTMLElement | null;
				list?.remove();
				const listHost = content.createDiv('nw-model-manager-list');
				const models = this.models.list();
				const deletionTarget = models.find(model => model.id_modelo === pendingDeletion);
				if (deletionTarget) {
					const warning = listHost.createDiv('nw-model-delete-confirm');
					warning.createEl('strong', { text: `¿Borrar "${deletionTarget.nombre_listado}"?` });
					warning.createEl('p', { text: 'Esta acción no se puede deshacer.' });
					const cancel = warning.createEl('button', { text: 'Cancelar' });
					cancel.onclick = () => { pendingDeletion = undefined; render(); };
					const confirm = warning.createEl('button', { text: 'Borrar', cls: 'mod-warning' });
					confirm.onclick = async () => {
						await this.models.remove(deletionTarget.id_modelo); pendingDeletion = undefined;
						new Notice('Modelo eliminado.'); render(); this.display();
					};
				}
				if (!models.length) listHost.createEl('p', { text: 'No hay modelos guardados.' });
				models.forEach(model => {
					const provider = getProvider(model.id_proveedor);
					new Setting(listHost).setName(model.nombre_listado).setDesc(`${provider?.nombre_display ?? 'Proveedor desconocido'} · ${model.nombre_modelo}`)
						.addToggle(toggle => toggle.setTooltip('Modelo por defecto').setValue(this.plugin.settings.data.modeloPredeterminadoId === model.id_modelo).onChange(async value => {
							if (value) { await this.models.setDefault(model.id_modelo); render(); }
						}))
						.addButton(button => button.setIcon('pencil').setTooltip('Editar').onClick(() => {
							new ModelModal(this.plugin, model, () => { render(); this.display(); }).open();
						}))
						.addButton(button => button.setIcon('trash').setTooltip('Borrar').onClick(() => {
							pendingDeletion = model.id_modelo; render();
						}));
				});
			};
			const create = content.createEl('button', { text: 'Crear modelo', cls: 'mod-cta' });
			create.onclick = () => new ModelModal(this.plugin, undefined, () => { render(); this.display(); }).open();
			render();
		};
		modal.open();
	}

	private renderCodexOptions(host: HTMLElement): void {
		const settings = this.plugin.settings.data;
		host.createEl('h3', { text: 'Opciones de Codex' });
		new Setting(host).setName('Search Range').addText(text => text.setValue(String(settings.codexOptions.searchRange)).onChange(async value => {
			const parsed = Number(value); if (!Number.isNaN(parsed)) { settings.codexOptions.searchRange = parsed; await this.plugin.settings.save(); }
		}));
		new Setting(host).setName('Lorebook %').addText(text => text.setValue(String(settings.codexOptions.lorebookPercentage)).onChange(async value => {
			const parsed = Number(value); if (parsed >= 0 && parsed <= 100) { settings.codexOptions.lorebookPercentage = parsed; await this.plugin.settings.save(); }
		}));
		new Setting(host).setName('Numerar capitulos automaticamente').addToggle(toggle => toggle.setValue(settings.numerarCapitulosAuto).onChange(async value => {
			settings.numerarCapitulosAuto = value; await this.plugin.settings.save();
		}));
	}

	private renderGlobalPrompts(host: HTMLElement): void {
		const settings = this.plugin.settings.data;
		host.createEl('h3', { text: 'Prompt global' });
		(['prefix', 'memoryContent', 'authorNote'] as const).forEach(key => {
			const labels = { prefix: 'Prefix prompt', memoryContent: 'Global Memory Content', authorNote: "Global Author's Note" };
			const section = host.createDiv('options-section'); section.createEl('p', { text: labels[key] });
			const textarea = section.createEl('textarea'); textarea.rows = 4; textarea.style.width = '100%'; textarea.value = settings[key];
			textarea.onchange = async () => { settings[key] = textarea.value; await this.plugin.settings.save(); };
		});
	}
}
