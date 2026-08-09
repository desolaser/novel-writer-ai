import { Modal, Notice, Setting } from "obsidian";
import type NovelWriterPlugin from "../../../main";
import type { Modelo } from "../../domain/entities/Modelo";
import { PROVIDERS, getProvider } from "../../constants/providers";
import { ApiFactory } from "../../factories/api-factory";
import type { Model as AvailableModel } from "../../types/Model";
import { ModelRepository } from "../../infrastructure/settings/model-repository";

type ModelInput = Omit<Modelo, "id_modelo" | "created_at" | "updated_at"> &
	Partial<Pick<Modelo, "id_modelo">>;

/** Create and edit modal shared by the saved-models manager. */
export class ModelModal extends Modal {
	private availableModels: AvailableModel[] = [];
	private readonly repository: ModelRepository;
	private form: ModelInput;
	private loadingModels = false;
	private modelsError = "";
	private apiKeyRetryTimer: number | undefined;
	private searchQuery = "";
	private sortMode: "alpha" | "price" | "context" = "alpha";

	constructor(
		private readonly plugin: NovelWriterPlugin,
		private readonly model: Modelo | undefined,
		private readonly onSaved: () => void
	) {
		super(plugin.app);
		this.repository = new ModelRepository(plugin.settings);
		const defaults = plugin.settings.data.aiOptions;
		this.form = model
			? { ...model }
			: {
					nombre_modelo: "",
					nombre_listado: "",
					id_proveedor: PROVIDERS[0].id_proveedor,
					max_context: defaults.maxContext,
					max_output: defaults.maxOutput,
					max_output_chat: defaults.maxOutputChat,
					stream: defaults.streaming,
					temperature: defaults.temperature,
					top_p: defaults.topP,
					top_k: defaults.topK,
					repetition_penalty: defaults.repetitionPenalty,
					repetition_penalty_range: defaults.repetitionPenaltyRange,
					frecuence_penalty: defaults.frequencyPenalty,
					presence_penalty: defaults.presencePenalty,
					supports_image_generation: false,
					supports_vision: false,
					};
	}

	onOpen(): void {
		void this.render().then(() => this.loadAvailableModels());
	}

	private async render(): Promise<void> {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", {
			text: this.model ? "Editar modelo" : "Crear modelo",
		});
		new Setting(contentEl)
			.setName("List Name")
			.setDesc("Nombre visible para identificar este modelo.")
			.addText((text) =>
				text.setValue(this.form.nombre_listado).onChange((value) => {
					this.form.nombre_listado = value;
				})
			);
		new Setting(contentEl).setName("Provider").addDropdown((dropdown) => {
			PROVIDERS.forEach((provider) =>
				dropdown.addOption(
					String(provider.id_proveedor),
					provider.nombre_display
				)
			);
			dropdown
				.setValue(String(this.form.id_proveedor))
				.onChange(async (value) => {
					this.form.id_proveedor = Number(value);
					this.availableModels = [];
					this.form.nombre_modelo = "";
					this.modelsError = "";
					await this.render();
					await this.loadAvailableModels();
				});
		});
		const provider = getProvider(this.form.id_proveedor)!;
		new Setting(contentEl)
			.setName("API Key")
			.setDesc(
				provider.nombre === "ollama"
					? "Ollama local no requiere una clave."
					: "Se guarda de forma segura en la configuración del plugin para este proveedor."
			)
			.addText((text) => {
				text.inputEl.type = "password";
				text.setValue(
					this.plugin.settings.data.apiToken[provider.nombre] ?? ""
				).onChange((value) => {
					this.plugin.settings.data.apiToken[provider.nombre] = value;
					window.clearTimeout(this.apiKeyRetryTimer);
					this.apiKeyRetryTimer = window.setTimeout(
						() => void this.loadAvailableModels(),
						500
					);
				});
			});
		const modelsHost = contentEl.createDiv();

		// --- Search bar (built once, outside re-render zone) ---
		const searchHost = modelsHost.createDiv();
		new Setting(searchHost)
			.setName("Buscar modelo")
			.setDesc("Filtra por nombre o ID del modelo.")
			.addText((text) => {
				text.setValue(this.searchQuery).onChange((value) => {
					this.searchQuery = value;
					this.renderModelDropdown();
				});
			});

		// --- Sort selector (built once, outside re-render zone) ---
		const sortHost = modelsHost.createDiv();
		new Setting(sortHost)
			.setName("Ordenar por")
			.addDropdown((dropdown) => {
				dropdown.addOption("alpha", "Alfabético");
				dropdown.addOption("price", "Precio (mejor rendimiento)");
				dropdown.addOption("context", "Contexto (mayor primero)");
				dropdown.setValue(this.sortMode).onChange((value) => {
					this.sortMode = value as "alpha" | "price" | "context";
					this.renderModelDropdown();
				});
			});

		// --- Model dropdown (rebuilt on search/sort changes) ---
		const modelDropdownHost = modelsHost.createDiv(
			"nw-model-dropdown-host"
		);
		this.renderModelDropdown(modelDropdownHost);
		contentEl.createEl("h3", { text: "Parameters" });
		this.numberSetting(contentEl, "Max Context", "max_context");
		this.numberSetting(contentEl, "Max Output (Generación)", "max_output");
		this.numberSetting(contentEl, "Max Output (Chat)", "max_output_chat");
		new Setting(contentEl).setName("Stream").addToggle((toggle) =>
			toggle.setValue(this.form.stream).onChange((value) => {
				this.form.stream = value;
			})
		);
		this.numberSetting(contentEl, "Temperature", "temperature");
		this.numberSetting(contentEl, "Top P", "top_p");
		this.numberSetting(contentEl, "Top K", "top_k");
		this.numberSetting(
			contentEl,
			"Repetition Penalty",
			"repetition_penalty"
		);
		this.numberSetting(
			contentEl,
			"Repetition Penalty Range",
			"repetition_penalty_range"
		);
		this.numberSetting(contentEl, "Frequence Penalty", "frecuence_penalty");
		this.numberSetting(contentEl, "Presence Penalty", "presence_penalty");
		const actions = contentEl.createDiv("modal-button-container");
		const test = actions.createEl("button", { text: "Test" });
		test.onclick = async () => {
			try {
				const api = new ApiFactory().createApi(
					provider.nombre,
					this.plugin.settings.data.apiToken[provider.nombre] ?? ""
				);
				const valid = await api.validateApiKey();
				new Notice(
					valid
						? "Conexión validada correctamente."
						: "No se pudo validar la conexión."
				);
			} catch (error) {
				new Notice(
					`Falló la prueba: ${
						error instanceof Error ? error.message : String(error)
					}`
				);
			}
		};
		const save = actions.createEl("button", {
			text: this.model ? "Save" : "Create",
			cls: "mod-cta",
		});
		save.onclick = async () => {
			if (!this.form.nombre_modelo) {
				new Notice("Selecciona un modelo.");
				return;
			}
			if (!this.form.nombre_listado.trim())
				this.form.nombre_listado = this.form.nombre_modelo;
			await this.repository.save(this.form);
			await this.plugin.settings.save();
			new Notice(this.model ? "Modelo actualizado." : "Modelo creado.");
			this.onSaved();
			this.close();
		};
	}

	private async loadAvailableModels(): Promise<void> {
		const provider = getProvider(this.form.id_proveedor)!;
		const apiKey =
			this.plugin.settings.data.apiToken[provider.nombre] ?? "";
		if (provider.nombre !== "ollama" && !apiKey.trim()) {
			this.availableModels = [];
			this.modelsError =
				"Ingresa una API Key válida para cargar los modelos.";
			await this.render();
			return;
		}
		this.loadingModels = true;
		this.modelsError = "";
		await this.render();
		try {
			const api = new ApiFactory().createApi(provider.nombre, apiKey);
			this.availableModels = await api.getAvailableModels();
			if (!this.availableModels.length)
				this.modelsError =
					"No se encontraron modelos para esta API Key.";
		} catch (_error) {
			this.availableModels = [];
			this.modelsError =
				"No se pudieron cargar los modelos. Verifica que la API Key sea válida.";
		} finally {
			this.loadingModels = false;
			await this.render();
		}
	}

	private formatTokensPerDollar(pricing: string | undefined | null): string {
		if (!pricing) return "";
		// Pricing format: "$0.00000014/1K prompt, $0.00000028/1K completion"
		// The /1K label is misleading — the value is the per-TOKEN price.
		// Real price per 1K tokens = price * 1_000.
		// K tokens per dollar = 1 / (price * 1_000)
		const match = pricing.match(/\$([\d.]+)\//);
		if (!match) return "";
		const price = parseFloat(match[1]);
		if (Number.isNaN(price) || price <= 0) return "";
		return `${Math.round(1 / (price * 1_000))}K/$`;
	}

	private formatModelOption(model: AvailableModel): string {
		const icons: string[] = [];
		if (model.supportsImageGeneration) {
			icons.push("🖌"); // generates images (output)
		}
		if (model.supportsVision) {
			icons.push("👁"); // accepts images as input (vision)
		}
		const parts: string[] = [];
		if (icons.length) parts.push(icons.join(" "));
		parts.push(model.name || model.id);
		parts.push(`${model.contextLength} ctx`);
		const tpd = this.formatTokensPerDollar(model.pricing);
		if (tpd) parts.push(tpd);
		return parts.join(" | ");
	}

	private renderModelDropdown(host?: HTMLElement): void {
		const target =
			host ??
			(this.contentEl.querySelector(
				".nw-model-dropdown-host"
			) as HTMLElement | null);
		if (!target) return;
		target.empty();

		const modelDescription = this.loadingModels
			? "Cargando modelos..."
			: this.modelsError ||
			  "Modelo disponible en el proveedor seleccionado.";

		const filtered = this.getFilteredAndSortedModels();
		new Setting(target)
			.setName("Model")
			.setDesc(modelDescription)
			.addDropdown((dropdown) => {
				if (!filtered.length)
					dropdown.addOption(
						"",
						this.loadingModels
							? "Cargando..."
							: this.searchQuery
								? "Sin coincidencias"
								: "No hay modelos disponibles"
					);
				filtered.forEach((model) =>
					dropdown.addOption(
						model.id,
						this.formatModelOption(model)
					)
				);
				dropdown.setValue(this.form.nombre_modelo).onChange((value) => {
					this.form.nombre_modelo = value;
					const selected = this.availableModels.find((model) => model.id === value);
					this.form.supports_image_generation =
						selected?.supportsImageGeneration ?? false;
					this.form.supports_vision =
						selected?.supportsVision ?? false;
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Reintentar")
					.setDisabled(this.loadingModels)
					.onClick(() => void this.loadAvailableModels())
			);
	}

	private getFilteredAndSortedModels(): AvailableModel[] {
		let models = [...this.availableModels];

		// Filter by search query
		if (this.searchQuery.trim()) {
			const q = this.searchQuery.trim().toLowerCase();
			models = models.filter(
				(m) =>
					(m.name || m.id).toLowerCase().includes(q) ||
					m.id.toLowerCase().includes(q)
			);
		}

		// Sort
		switch (this.sortMode) {
			case "price":
				models.sort((a, b) => {
					const aVal = this.parseTokensPerDollarRaw(a.pricing);
					const bVal = this.parseTokensPerDollarRaw(b.pricing);
					return bVal - aVal; // descending: best value first
				});
				break;
			case "context":
				models.sort((a, b) => {
					const aCtx = a.contextLength ?? 0;
					const bCtx = b.contextLength ?? 0;
					return bCtx - aCtx; // descending: largest context first
				});
				break;
			default:
				models.sort((a, b) =>
					(a.name || a.id).localeCompare(b.name || b.id)
				);
				break;
		}

		return models;
	}

	private parseTokensPerDollarRaw(
		pricing: string | undefined | null
	): number {
		if (!pricing) return 0;
		// Same logic as formatTokensPerDollar: values are per-token prices.
		const match = pricing.match(/\$([\d.]+)\//);
		if (!match) return 0;
		const price = parseFloat(match[1]);
		if (Number.isNaN(price) || price <= 0) return 0;
		return 1 / (price * 1_000);
	}

	onClose(): void {
		window.clearTimeout(this.apiKeyRetryTimer);
	}

	private numberSetting(
		host: HTMLElement,
		label: string,
		field: keyof Pick<
			Modelo,
			| "max_context"
			| "max_output"
			| "max_output_chat"
			| "temperature"
			| "top_p"
			| "top_k"
			| "repetition_penalty"
			| "repetition_penalty_range"
			| "frecuence_penalty"
			| "presence_penalty"
		>
	): void {
		new Setting(host).setName(label).addText((text) =>
			text.setValue(String(this.form[field] ?? "")).onChange((value) => {
				const number = Number(value);
				if (!Number.isNaN(number)) (this.form as any)[field] = number;
			})
		);
	}
}
