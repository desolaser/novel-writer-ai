import { Plugin } from "obsidian";
import { PluginSettings, DEFAULT_SETTINGS, createDefaultPrompts } from "./plugin-settings";
import type { Modelo } from "../../domain/entities/Modelo";
import type { CustomPrompt } from "../../domain/entities/CustomPrompt";
import { getProviderByName } from "../../constants/providers";
import { genId } from "../../utils/ids";

/**
 * Servicio de settings: carga (con merge profundo sobre defaults) y guarda
 * la configuracion global del plugin via Obsidian loadData/saveData.
 * Permite coexistir con el settings viejo durante la transicion (Fase 2).
 */
export class SettingsService {
	private plugin: Plugin;
	data: PluginSettings;

	constructor(plugin: Plugin) {
		this.plugin = plugin;
		this.data = structuredCloneSafe(DEFAULT_SETTINGS);
	}

	async load(): Promise<PluginSettings> {
		const raw = await this.plugin.loadData();
		this.data = mergeSettings(DEFAULT_SETTINGS, raw ?? {});
		this.migrateLegacyModel();
		this.ensureDefaultPrompts();
		return this.data;
	}

	async save(): Promise<void> {
		await this.plugin.saveData(this.data);
	}

	/** Helper patch en memoria + persistir. */
	async update(patch: Partial<PluginSettings>): Promise<void> {
		this.data = { ...this.data, ...patch };
		await this.save();
	}

	private migrateLegacyModel(): void {
		if (this.data.modelos.length || !this.data.proveedor.modelo) return;
		const provider = getProviderByName(this.data.proveedor.id);
		if (!provider) return;
		const now = new Date().toISOString();
		const model: Modelo = {
			id_modelo: genId(),
			nombre_modelo: this.data.proveedor.modelo,
			nombre_listado: this.data.proveedor.modelo,
			id_proveedor: provider.id_proveedor,
			max_context: this.data.aiOptions.maxContext,
			max_output: this.data.aiOptions.maxOutput,
			stream: this.data.aiOptions.streaming,
			temperature: this.data.aiOptions.temperature,
			top_p: this.data.aiOptions.topP,
			top_k: this.data.aiOptions.topK,
			repetition_penalty: this.data.aiOptions.repetitionPenalty,
			repetition_penalty_range:
				this.data.aiOptions.repetitionPenaltyRange,
			frecuence_penalty: this.data.aiOptions.frequencyPenalty,
			presence_penalty: this.data.aiOptions.presencePenalty,
			created_at: now,
			updated_at: now,
		};
		this.data.modelos = [model];
		this.data.modeloPredeterminadoId = model.id_modelo;
	}

	// --- Custom Prompts ---

	/** Lista todos los prompts custom. */
	listPrompts(): CustomPrompt[] {
		return this.data.customPrompts ?? [];
	}

	/** Obtiene un prompt por ID. */
	getPrompt(id: string): CustomPrompt | undefined {
		return this.data.customPrompts?.find(p => p.id_prompt === id);
	}

	/** Crea un nuevo prompt custom. */
	async createPrompt(tipo: 'chat' | 'text', nombre: string, texto: string): Promise<CustomPrompt> {
		if (!this.data.customPrompts) {
			this.data.customPrompts = createDefaultPrompts();
		}
		const now = new Date().toISOString();
		const prompt: CustomPrompt = {
			id_prompt: genId(),
			tipo,
			nombre,
			texto,
			created_at: now,
			updated_at: now,
		};
		this.data.customPrompts.push(prompt);
		await this.save();
		return prompt;
	}

	/** Actualiza un prompt existente. */
	async updatePrompt(id: string, patch: Partial<Pick<CustomPrompt, 'nombre' | 'texto'>>): Promise<void> {
		const prompts = this.data.customPrompts;
		if (!prompts) return;
		const idx = prompts.findIndex(p => p.id_prompt === id);
		if (idx < 0) return;
		prompts[idx] = { ...prompts[idx], ...patch, updated_at: new Date().toISOString() };
		await this.save();
	}

	/** Elimina un prompt (solo si no es el unico de su tipo). */
	async deletePrompt(id: string): Promise<boolean> {
		const prompts = this.data.customPrompts;
		if (!prompts) return false;
		const target = prompts.find(p => p.id_prompt === id);
		if (!target) return false;
		const sameType = prompts.filter(p => p.tipo === target.tipo);
		if (sameType.length <= 1) return false; // No se puede borrar el ultimo de su tipo
		this.data.customPrompts = prompts.filter(p => p.id_prompt !== id);
		// Si se borro el default, asignar el primero del mismo tipo
		if (target.tipo === 'chat' && this.data.defaultChatPromptId === id) {
			const first = this.data.customPrompts.find(p => p.tipo === 'chat');
			this.data.defaultChatPromptId = first?.id_prompt ?? '';
		}
		if (target.tipo === 'text' && this.data.defaultTextPromptId === id) {
			const first = this.data.customPrompts.find(p => p.tipo === 'text');
			this.data.defaultTextPromptId = first?.id_prompt ?? '';
		}
		await this.save();
		return true;
	}

	/** Establece el prompt por defecto para un tipo. */
	async setDefaultPrompt(tipo: 'chat' | 'text', id: string): Promise<void> {
		if (tipo === 'chat') this.data.defaultChatPromptId = id;
		else this.data.defaultTextPromptId = id;
		await this.save();
	}

	/** Obtiene el prompt por defecto para un tipo. */
	getDefaultPrompt(tipo: 'chat' | 'text'): CustomPrompt | undefined {
		const id = tipo === 'chat' ? this.data.defaultChatPromptId : this.data.defaultTextPromptId;
		if (id) {
			const found = this.data.customPrompts?.find(p => p.id_prompt === id);
			if (found) return found;
		}
		// Fallback al primero del tipo
		return this.data.customPrompts?.find(p => p.tipo === tipo);
	}

	/** Asegura que existan los defaults despues de cargar/migrar. */
	ensureDefaultPrompts(): void {
		if (!this.data.customPrompts || this.data.customPrompts.length === 0) {
			this.data.customPrompts = createDefaultPrompts();
		}
		const hasChat = this.data.customPrompts.some(p => p.tipo === 'chat');
		const hasText = this.data.customPrompts.some(p => p.tipo === 'text');
		if (!hasChat || !hasText) {
			const defaults = createDefaultPrompts();
			if (!hasChat) {
				const dp = defaults.find(p => p.tipo === 'chat')!;
				if (!this.data.customPrompts.some(p => p.id_prompt === dp.id_prompt)) {
					this.data.customPrompts.push(dp);
				}
			}
			if (!hasText) {
				const dp = defaults.find(p => p.tipo === 'text')!;
				if (!this.data.customPrompts.some(p => p.id_prompt === dp.id_prompt)) {
					this.data.customPrompts.push(dp);
				}
			}
		}
		if (!this.data.defaultChatPromptId) {
			const first = this.data.customPrompts.find(p => p.tipo === 'chat');
			if (first) this.data.defaultChatPromptId = first.id_prompt;
		}
		if (!this.data.defaultTextPromptId) {
			const first = this.data.customPrompts.find(p => p.tipo === 'text');
			if (first) this.data.defaultTextPromptId = first.id_prompt;
		}
	}
}

/** Merge profundo (1 nivel de subobjetos) sobre defaults. */
function mergeSettings(defaults: PluginSettings, loaded: any): PluginSettings {
	const out: any = { ...defaults };
	for (const k of Object.keys(loaded)) {
		const v = loaded[k];
		if (v && typeof v === "object" && !Array.isArray(v)) {
			out[k] = { ...((defaults as any)[k] ?? {}), ...v };
		} else {
			out[k] = v;
		}
	}
	return out as PluginSettings;
}

function structuredCloneSafe<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}
