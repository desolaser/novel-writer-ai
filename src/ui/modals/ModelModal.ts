import { Modal, Notice, Setting } from 'obsidian';
import type NovelWriterPlugin from '../../../main';
import type { Modelo } from '../../domain/entities/Modelo';
import { PROVIDERS, getProvider } from '../../constants/providers';
import { ApiFactory } from '../../factories/api-factory';
import type { Model as AvailableModel } from '../../types/Model';
import { ModelRepository } from '../../infrastructure/settings/model-repository';

type ModelInput = Omit<Modelo, 'id_modelo' | 'created_at' | 'updated_at'> & Partial<Pick<Modelo, 'id_modelo'>>;

/** Create and edit modal shared by the saved-models manager. */
export class ModelModal extends Modal {
	private availableModels: AvailableModel[] = [];
	private readonly repository: ModelRepository;
	private form: ModelInput;
	private loadingModels = false;
	private modelsError = '';
	private apiKeyRetryTimer: number | undefined;

	constructor(private readonly plugin: NovelWriterPlugin, private readonly model: Modelo | undefined, private readonly onSaved: () => void) {
		super(plugin.app);
		this.repository = new ModelRepository(plugin.settings);
		const defaults = plugin.settings.data.aiOptions;
		this.form = model ? { ...model } : {
			nombre_modelo: '', nombre_listado: '', id_proveedor: PROVIDERS[0].id_proveedor,
			max_context: defaults.maxContext, max_output: defaults.maxOutput, stream: defaults.streaming,
			temperature: defaults.temperature, top_p: defaults.topP, top_k: defaults.topK,
			repetition_penalty: defaults.repetitionPenalty, repetition_penalty_range: defaults.repetitionPenaltyRange,
			frecuence_penalty: defaults.frequencyPenalty, presence_penalty: defaults.presencePenalty, supports_image_generation: false,
		};
	}

	onOpen(): void { void this.render().then(() => this.loadAvailableModels()); }

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: this.model ? 'Editar modelo' : 'Crear modelo' });
		new Setting(contentEl).setName('List Name').setDesc('Nombre visible para identificar este modelo.').addText(text => text.setValue(this.form.nombre_listado).onChange(value => { this.form.nombre_listado = value; }));
		new Setting(contentEl).setName('Provider').addDropdown(dropdown => {
			PROVIDERS.forEach(provider => dropdown.addOption(String(provider.id_proveedor), provider.nombre_display));
			dropdown.setValue(String(this.form.id_proveedor)).onChange(async value => {
				this.form.id_proveedor = Number(value); this.availableModels = []; this.form.nombre_modelo = ''; this.modelsError = '';
				await this.render(); await this.loadAvailableModels();
			});
		});
		const provider = getProvider(this.form.id_proveedor)!;
		new Setting(contentEl).setName('API Key').setDesc(provider.nombre === 'ollama' ? 'Ollama local no requiere una clave.' : 'Se guarda de forma segura en la configuración del plugin para este proveedor.').addText(text => {
			text.inputEl.type = 'password';
			text.setValue(this.plugin.settings.data.apiToken[provider.nombre] ?? '').onChange(value => {
				this.plugin.settings.data.apiToken[provider.nombre] = value;
				window.clearTimeout(this.apiKeyRetryTimer);
				this.apiKeyRetryTimer = window.setTimeout(() => void this.loadAvailableModels(), 500);
			});
		});
		const modelsHost = contentEl.createDiv();
		const modelDescription = this.loadingModels ? 'Cargando modelos...' : this.modelsError || 'Modelo disponible en el proveedor seleccionado.';
		new Setting(modelsHost).setName('Model').setDesc(modelDescription).addDropdown(dropdown => {
			if (!this.availableModels.length) dropdown.addOption('', this.loadingModels ? 'Cargando...' : 'No hay modelos disponibles');
			this.availableModels.forEach(model => dropdown.addOption(model.id, `${model.supportsImageGeneration ? '🖌 ' : ''}${model.pricing ? `${model.name || model.id} — ${model.pricing}` : (model.name || model.id)}`));
			dropdown.setValue(this.form.nombre_modelo).onChange(value => { this.form.nombre_modelo = value; this.form.supports_image_generation = this.availableModels.find(model => model.id === value)?.supportsImageGeneration ?? false; });
		}).addButton(button => button.setButtonText('Reintentar').setDisabled(this.loadingModels).onClick(() => void this.loadAvailableModels()));
		contentEl.createEl('h3', { text: 'Parameters' });
		this.numberSetting(contentEl, 'Max Context', 'max_context');
		this.numberSetting(contentEl, 'Max Output', 'max_output');
		new Setting(contentEl).setName('Stream').addToggle(toggle => toggle.setValue(this.form.stream).onChange(value => { this.form.stream = value; }));
		this.numberSetting(contentEl, 'Temperature', 'temperature');
		this.numberSetting(contentEl, 'Top P', 'top_p');
		this.numberSetting(contentEl, 'Top K', 'top_k');
		this.numberSetting(contentEl, 'Repetition Penalty', 'repetition_penalty');
		this.numberSetting(contentEl, 'Repetition Penalty Range', 'repetition_penalty_range');
		this.numberSetting(contentEl, 'Frequence Penalty', 'frecuence_penalty');
		this.numberSetting(contentEl, 'Presence Penalty', 'presence_penalty');
		const actions = contentEl.createDiv('modal-button-container');
		const test = actions.createEl('button', { text: 'Test' });
		test.onclick = async () => {
			try {
				const api = new ApiFactory().createApi(provider.nombre, this.plugin.settings.data.apiToken[provider.nombre] ?? '');
				const valid = await api.validateApiKey();
				new Notice(valid ? 'Conexión validada correctamente.' : 'No se pudo validar la conexión.');
			} catch (error) { new Notice(`Falló la prueba: ${error instanceof Error ? error.message : String(error)}`); }
		};
		const save = actions.createEl('button', { text: this.model ? 'Save' : 'Create', cls: 'mod-cta' });
		save.onclick = async () => {
			if (!this.form.nombre_modelo) { new Notice('Selecciona un modelo.'); return; }
			if (!this.form.nombre_listado.trim()) this.form.nombre_listado = this.form.nombre_modelo;
			await this.repository.save(this.form);
			await this.plugin.settings.save();
			new Notice(this.model ? 'Modelo actualizado.' : 'Modelo creado.'); this.onSaved(); this.close();
		};
	}

	private async loadAvailableModels(): Promise<void> {
		const provider = getProvider(this.form.id_proveedor)!;
		const apiKey = this.plugin.settings.data.apiToken[provider.nombre] ?? '';
		if (provider.nombre !== 'ollama' && !apiKey.trim()) {
			this.availableModels = [];
			this.modelsError = 'Ingresa una API Key válida para cargar los modelos.';
			await this.render();
			return;
		}
		this.loadingModels = true;
		this.modelsError = '';
		await this.render();
		try {
			const api = new ApiFactory().createApi(provider.nombre, apiKey);
			this.availableModels = await api.getAvailableModels();
			if (!this.availableModels.length) this.modelsError = 'No se encontraron modelos para esta API Key.';
		} catch (_error) {
			this.availableModels = [];
			this.modelsError = 'No se pudieron cargar los modelos. Verifica que la API Key sea válida.';
		} finally {
			this.loadingModels = false;
			await this.render();
		}
	}

	onClose(): void { window.clearTimeout(this.apiKeyRetryTimer); }

	private numberSetting(host: HTMLElement, label: string, field: keyof Pick<Modelo, 'max_context' | 'max_output' | 'temperature' | 'top_p' | 'top_k' | 'repetition_penalty' | 'repetition_penalty_range' | 'frecuence_penalty' | 'presence_penalty'>): void {
		new Setting(host).setName(label).addText(text => text.setValue(String(this.form[field] ?? '')).onChange(value => {
			const number = Number(value); if (!Number.isNaN(number)) (this.form as any)[field] = number;
		}));
	}
}
