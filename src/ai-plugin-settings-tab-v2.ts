import { PluginSettingTab, Setting, App, Notice } from "obsidian";
import type NovelWriterPlugin from "../main";
import { AiProviderId } from "./infrastructure/settings/plugin-settings";
import { ApiFactory } from "./factories/api-factory";
import type { Model } from "./types/Model";

const PROVIDERS: { id: AiProviderId; label: string }[] = [
	{ id: "openrouter", label: "OpenRouter" },
	{ id: "deepseek", label: "Deepseek" },
	{ id: "ooba", label: "Text Generation WebUI" },
	{ id: "ollama", label: "Ollama" },
	{ id: "opencodezen", label: "OpenCodeZen" },
	{ id: "opencodego", label: "OpenCodeGo" },
	{ id: "novelai", label: "NovelAI" },
];

export class NovelWriterSettingsTab extends PluginSettingTab {
	plugin: NovelWriterPlugin;
	models: Model[] = [];

	constructor(app: App, plugin: NovelWriterPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	async display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h1", { text: "Novel Writer AI" });
		const s = this.plugin.settings.data;

		new Setting(containerEl)
			.setName("Proveedor de IA")
			.setDesc("Selecciona el proveedor.")
			.addDropdown((d) => {
				PROVIDERS.forEach((p) => d.addOption(p.id, p.label));
				d.setValue(s.proveedor.id).onChange(async (v: any) => {
					s.proveedor.id = v;
					s.proveedor.modelo = "";
					await this.plugin.settings.save();
					this.models = [];
					this.display();
				});
			});

		if (s.proveedor.id !== "ollama") {
			new Setting(containerEl).setName("API Token").addText((t) =>
				t
					.setValue(s.apiToken[s.proveedor.id] ?? "")
					.onChange(async (v) => {
						s.apiToken[s.proveedor.id] = v;
						await this.plugin.settings.save();
					})
			);
		}

		const modelContainer = containerEl.createDiv();
		modelContainer.createEl("h3", { text: "Modelos disponibles" });
		const token = s.apiToken[s.proveedor.id] ?? "";
		if (s.proveedor.id === "ollama" || s.proveedor.id === "ooba" || token) {
			if (this.models.length > 0) {
				this.renderModelDropdown(modelContainer);
			} else {
				const loading = modelContainer.createEl("p", {
					text: "Cargando modelos...",
				});
				try {
					const api = new ApiFactory().createApi(
						s.proveedor.id,
						token
					);
					this.models = await api.getAvailableModels();
					loading.remove();
					if (this.models.length > 0)
						this.renderModelDropdown(modelContainer);
					else
						modelContainer.createEl("p", {
							text: "No hay modelos disponibles.",
						});
				} catch (e: any) {
					loading.remove();
					modelContainer.createEl("p", {
						text: "Error: " + (e?.message ?? String(e)),
					}).style.color = "var(--text-error)";
				}
			}
		} else {
			modelContainer.createEl("p", {
				text: "Agrega un API token para ver los modelos disponibles.",
			});
		}

		new Setting(containerEl).setName("Streaming").addToggle((t) =>
			t.setValue(s.aiOptions.streaming).onChange(async (v) => {
				s.aiOptions.streaming = v;
				await this.plugin.settings.save();
			})
		);

		const num = (n: keyof typeof s.aiOptions, label: string, desc = "") =>
			new Setting(containerEl)
				.setName(label)
				.setDesc(desc)
				.addText((t) =>
					t
						.setValue(String(s.aiOptions[n] ?? 0))
						.onChange(async (v) => {
							const p = parseFloat(v);
							if (!isNaN(p)) {
								(s.aiOptions as any)[n] = p;
								await this.plugin.settings.save();
							}
						})
				);

		containerEl.createEl("h3", { text: "Opciones de IA" });
		num("maxContext", "Max Context Tokens");
		num("maxOutput", "Max Output Tokens");
		num("temperature", "Temperature");
		num("topP", "Top P");
		num("presencePenalty", "Presence Penalty");
		num("frequencyPenalty", "Frequency Penalty");

		containerEl.createEl("h3", { text: "Opciones de Codex" });
		new Setting(containerEl).setName("Search Range").addText((t) =>
			t
				.setValue(String(s.codexOptions.searchRange))
				.onChange(async (v) => {
					const p = parseInt(v);
					if (!isNaN(p)) {
						s.codexOptions.searchRange = p;
						await this.plugin.settings.save();
					}
				})
		);
		new Setting(containerEl).setName("Lorebook %").addText((t) =>
			t
				.setValue(String(s.codexOptions.lorebookPercentage))
				.onChange(async (v) => {
					const p = parseInt(v);
					if (!isNaN(p) && p >= 0 && p <= 100) {
						s.codexOptions.lorebookPercentage = p;
						await this.plugin.settings.save();
					}
				})
		);
		new Setting(containerEl)
			.setName("Numerar capitulos automaticamente")
			.addToggle((t) =>
				t.setValue(s.numerarCapitulosAuto).onChange(async (v) => {
					s.numerarCapitulosAuto = v;
					await this.plugin.settings.save();
				})
			);

		containerEl.createEl("h3", { text: "Prompt global" });
		const ta = (
			label: string,
			value: string,
			key: "prefix" | "memoryContent" | "authorNote"
		) => {
			const sec = containerEl.createDiv("options-section");
			sec.createEl("p", { text: label });
			const el = sec.createEl("textarea");
			el.rows = 4;
			el.style.width = "100%";
			el.value = value;
			el.onchange = async () => {
				(s as any)[key] = el.value;
				await this.plugin.settings.save();
			};
		};
		ta("Prefix prompt", s.prefix, "prefix");
		ta("Global Memory Content", s.memoryContent, "memoryContent");
		ta("Global Author's Note", s.authorNote, "authorNote");
	}

	private renderModelDropdown(host: HTMLElement) {
		const s = this.plugin.settings.data;
		const match = this.models.find((m) => m.id === s.proveedor.modelo);
		const sel = new Setting(host)
			.setName("Modelo por defecto")
			.setDesc(match?.name && match.name !== match.id ? match.name : "")
			.addDropdown((d) => {
				this.models.forEach((m) => d.addOption(m.id, m.name || m.id));
				d.setValue(s.proveedor.modelo || (this.models[0]?.id ?? ""));
				d.onChange(async (v: string) => {
					s.proveedor.modelo = v;
					await this.plugin.settings.save();
					this.display();
				});
			});
	}
}
