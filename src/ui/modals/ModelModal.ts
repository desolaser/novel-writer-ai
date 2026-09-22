import { Modal, Notice, Platform, Setting } from "obsidian";
import type NovelWriterPlugin from "../../../main";
import type { Modelo } from "../../domain/entities/Modelo";
import {
	PROVIDERS,
	getProvider,
	providerRequiresApiKey,
	providerIsDesktopOnly,
	providerIgnoresSamplingParams,
	getProviderCapabilities,
} from "../../constants/providers";
import { ApiFactory } from "../../factories/api-factory";
import type { Model as AvailableModel } from "../../types/Model";
import { ModelRepository } from "../../infrastructure/settings/model-repository";
import type { EffortLevel } from "../../utils/provider-options";
import { formatModelOption, getFilteredAndSortedModels } from "../../utils/modelSorting";

const EFFORT_LEVELS: EffortLevel[] = ["low", "medium", "high", "xhigh", "max"];
const ALTERNATE_API_KEY_NAMES = {
	"claudecode": "Claude CLI path",
	"codex": "Codex CLI path"
}

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
					min_p: defaults.minP,
					repetition_penalty: defaults.repetitionPenalty,
					repetition_penalty_range: defaults.repetitionPenaltyRange,
					frecuence_penalty: defaults.frequencyPenalty,
					presence_penalty: defaults.presencePenalty,
					effort: defaults.effort,
					thinking: defaults.thinking,
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
			text: this.model ? "Edit model" : "Create model",
		});
		new Setting(contentEl)
			.setName("List Name")
			.setDesc("Visible name to identify this model.")
			.addText((text) =>
				text.setValue(this.form.nombre_listado).onChange((value) => {
					this.form.nombre_listado = value;
				})
			);
		new Setting(contentEl).setName("Provider").addDropdown((dropdown) => {
			// CLI providers spawn local subprocesses: no point offering them on mobile.
			PROVIDERS.filter(
				(provider) =>
					!providerIsDesktopOnly(provider.nombre) || Platform.isDesktopApp
			).forEach((provider) =>
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
			.setName(ALTERNATE_API_KEY_NAMES[provider.nombre] ?? "API Key")
			.setDesc(apiKeyDescription(provider.nombre))
			.addText((text) => {
				if (providerRequiresApiKey(provider.nombre)) {
					text.inputEl.type = "password";
				}
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
			.setName("Search model")
			.setDesc("Filter by model name or ID.")
			.addText((text) => {
				text.setValue(this.searchQuery).onChange((value) => {
					this.searchQuery = value;
					this.renderModelDropdown();
				});
			});

		// --- Sort selector (built once, outside re-render zone) ---
		const sortHost = modelsHost.createDiv();
		new Setting(sortHost)
			.setName("Sort by")
			.addDropdown((dropdown) => {
				dropdown.addOption("alpha", "Alphabetical");
				dropdown.addOption("price", "Price (best value)");
				dropdown.addOption("context", "Context (largest first)");
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
		const capabilities = getProviderCapabilities(provider.nombre);
		if (providerIgnoresSamplingParams(provider.nombre)) {
			contentEl.createEl("p", {
				text:
					"This provider does not expose sampling parameters (temperature, top P/K, penalties). " +
					"Max Output and Stream still apply.",
				cls: "setting-item-description",
			});
		}
		if (capabilities.maxContext)
			this.numberSetting(contentEl, "Max Context", "max_context");
		const outputDescription = provider.nombre === "codex"
			? "Approximate local limit. Generation is cancelled when the streamed text reaches this budget."
			: undefined;
		this.numberSetting(
			contentEl, "Max Output (Generation)", "max_output",
			[outputDescription,
				'Default for editor actions and utility batch sizing. '
				+ 'Chapter drafts calculate output from the target word count; '
				+ 'other utilities use task-specific budgets.']
				.filter(Boolean).join(' ')
		);
		this.numberSetting(contentEl, "Max Output (Chat)", "max_output_chat", outputDescription);
		new Setting(contentEl).setName("Stream").addToggle((toggle) =>
			toggle.setValue(this.form.stream).onChange((value) => {
				this.form.stream = value;
			})
		);
		if (capabilities.temperature)
			this.numberSetting(contentEl, "Temperature", "temperature");
		if (capabilities.topP)
			this.numberSetting(contentEl, "Top P", "top_p");
		if (capabilities.topK)
			this.numberSetting(contentEl, "Top K", "top_k");
		if (capabilities.repetitionPenalty)
			this.numberSetting(contentEl, "Repetition Penalty", "repetition_penalty");
		if (capabilities.repetitionPenaltyRange)
			this.numberSetting(contentEl, "Repetition Penalty Range", "repetition_penalty_range");
		if (capabilities.frequencyPenalty)
			this.numberSetting(contentEl, "Frequence Penalty", "frecuence_penalty");
		if (capabilities.presencePenalty)
			this.numberSetting(contentEl, "Presence Penalty", "presence_penalty");
		if (capabilities.minP)
			this.numberSetting(contentEl, "Min P", "min_p");
		if (capabilities.effort) {
			const effortLevels = this.form.supported_reasoning_efforts?.length
				? this.form.supported_reasoning_efforts
				: EFFORT_LEVELS;
			new Setting(contentEl)
				.setName("Effort")
				.setDesc("Reasoning depth. Higher levels think more before answering, at the cost of latency and tokens.")
				.addDropdown((dropdown) => {
					effortLevels.forEach((level) => dropdown.addOption(level, level));
					dropdown
						.setValue(effortLevels.includes(this.form.effort as EffortLevel) ? this.form.effort as EffortLevel : effortLevels[0])
						.onChange((value) => {
							this.form.effort = value as EffortLevel;
						});
				});
		}
		if (capabilities.thinking)
			new Setting(contentEl)
				.setName("Thinking")
				.setDesc("Enable extended thinking / reasoning before the model answers.")
				.addToggle((toggle) =>
					toggle.setValue(this.form.thinking ?? true).onChange((value) => {
						this.form.thinking = value;
					})
				);
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
						? "Connection validated successfully."
						: "Could not validate the connection."
				);
			} catch (error) {
				new Notice(
					`Test failed: ${
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
				new Notice("Select a model.");
				return;
			}
			if (!this.form.nombre_listado.trim())
				this.form.nombre_listado = this.form.nombre_modelo;
			await this.repository.save(this.form);
			await this.plugin.settings.save();
			new Notice(this.model ? "Model updated." : "Model created.");
			this.onSaved();
			this.close();
		};
	}

	private async loadAvailableModels(): Promise<void> {
		const provider = getProvider(this.form.id_proveedor)!;
		const apiKey =
			this.plugin.settings.data.apiToken[provider.nombre] ?? "";
		if (providerRequiresApiKey(provider.nombre) && !apiKey.trim()) {
			this.availableModels = [];
			this.modelsError =
				"Enter a valid API Key to load the models.";
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
					"No models found for this API Key.";
		} catch (error) {
			this.availableModels = [];
			this.modelsError = error instanceof Error
				? error.message
				: "Could not load the models. Verify the provider configuration.";
		} finally {
			this.loadingModels = false;
			await this.render();
		}
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
			? "Loading models..."
			: this.modelsError ||
			  "Model available in the selected provider.";

		const filtered = getFilteredAndSortedModels(this.availableModels, this.searchQuery, this.sortMode);
		new Setting(target)
			.setName("Model")
			.setDesc(modelDescription)
			.addDropdown((dropdown) => {
				if (!filtered.length)
					dropdown.addOption(
						"",
						this.loadingModels
							? "Loading..."
							: this.searchQuery
								? "No matches"
								: "No models available"
					);
				filtered.forEach((model) =>
					dropdown.addOption(
						model.id,
						formatModelOption(model)
					)
				);
				dropdown.setValue(this.form.nombre_modelo).onChange(async (value) => {
					this.form.nombre_modelo = value;
					const selected = this.availableModels.find((model) => model.id === value);
					this.form.supports_image_generation =
						selected?.supportsImageGeneration ?? false;
					this.form.supports_vision =
						selected?.supportsVision ?? false;
					this.form.supported_reasoning_efforts = selected?.supportedReasoningEfforts
						?.filter((effort): effort is EffortLevel => EFFORT_LEVELS.includes(effort as EffortLevel));
					if (this.form.supported_reasoning_efforts?.length && !this.form.supported_reasoning_efforts.includes(this.form.effort as EffortLevel))
						this.form.effort = this.form.supported_reasoning_efforts[0];
					await this.render();
				});
			})
			.addButton((button) =>
				button
					.setButtonText("Retry")
					.setDisabled(this.loadingModels)
					.onClick(() => void this.loadAvailableModels())
			);
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
			| "min_p"
		>,
		description?: string
	): void {
		const setting = new Setting(host).setName(label);
		if (description) setting.setDesc(description);
		setting.addText((text) =>
			text.setValue(String(this.form[field] ?? "")).onChange((value) => {
				const number = Number(value);
				if (!Number.isNaN(number)) (this.form as any)[field] = number;
			})
		);
	}
}

/** CLI providers reuse the token field as an optional executable path. */
function apiKeyDescription(provider: string): string {
	switch (provider) {
		case "ollama":
			return "Local Ollama does not require a key.";
		case "llamacpp":
			return "Local llama.cpp server (llama-server) does not require a key. Default port: 8080.";
		case "claudecode":
			return (
				"Optional: full path to the Claude Code executable. Leave empty to use the one on " +
				"PATH. This provider uses your local Claude Code session (subscription), not an API Key."
			);
		case "codex":
			return (
				"Optional: full path to the Codex CLI executable. Leave empty to detect it on PATH. " +
				"Install Codex CLI and run `codex login` with ChatGPT first. API-key sessions are rejected " +
				"because this provider is intended to use your ChatGPT subscription."
			);
		case "anthropic":
			return (
				"API Key from console.anthropic.com. This is a separately billed account: your " +
				"Claude Pro/Max subscription does not work here (use the Claude Code provider for that)."
			);
		default:
			return "Stored securely in the plugin settings for this provider.";
	}
}
