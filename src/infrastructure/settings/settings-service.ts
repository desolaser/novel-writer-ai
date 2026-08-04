import { Plugin } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './plugin-settings';
import type { Modelo } from '../../domain/entities/Modelo';
import { getProviderByName } from '../../constants/providers';
import { genId } from '../../utils/ids';

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
			id_modelo: genId(), nombre_modelo: this.data.proveedor.modelo,
			nombre_listado: this.data.proveedor.modelo, id_proveedor: provider.id_proveedor,
			max_context: this.data.aiOptions.maxContext, max_output: this.data.aiOptions.maxOutput,
			stream: this.data.aiOptions.streaming, temperature: this.data.aiOptions.temperature,
			top_p: this.data.aiOptions.topP, top_k: this.data.aiOptions.topK,
			repetition_penalty: this.data.aiOptions.repetitionPenalty,
			repetition_penalty_range: this.data.aiOptions.repetitionPenaltyRange,
			frecuence_penalty: this.data.aiOptions.frequencyPenalty,
			presence_penalty: this.data.aiOptions.presencePenalty, created_at: now, updated_at: now,
		};
		this.data.modelos = [model];
		this.data.modeloPredeterminadoId = model.id_modelo;
	}
}

/** Merge profundo (1 nivel de subobjetos) sobre defaults. */
function mergeSettings(defaults: PluginSettings, loaded: any): PluginSettings {
	const out: any = { ...defaults };
	for (const k of Object.keys(loaded)) {
		const v = loaded[k];
		if (v && typeof v === 'object' && !Array.isArray(v)) {
			out[k] = { ...(defaults as any)[k] ?? {}, ...v };
		} else {
			out[k] = v;
		}
	}
	return out as PluginSettings;
}

function structuredCloneSafe<T>(v: T): T {
	return JSON.parse(JSON.stringify(v));
}
