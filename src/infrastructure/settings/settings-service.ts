import { Plugin } from 'obsidian';
import { PluginSettings, DEFAULT_SETTINGS } from './plugin-settings';

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