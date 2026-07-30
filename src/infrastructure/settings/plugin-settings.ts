import { DEFAULT_COLORS } from '../../constants/novel';

/** Proveedor de IA seleccionado. */
export type AiProviderId =
	| 'openrouter' | 'deepseek' | 'ooba' | 'ollama'
	| 'opencodezen' | 'opencodego' | 'novelai';

/** Opciones de IA (reformadas). Algunas no aplican a todos los proveedores. */
export interface AiOptions {
	maxContext: number;
	maxOutput: number;
	streaming: boolean;
	temperature: number;
	topP?: number;
	topK?: number;
	topA?: number;
	repetitionPenalty?: number;
	repetitionPenaltyRange?: number;
	presencePenalty?: number;
	frequencyPenalty?: number;
}

/** Opciones de Codex. */
export interface CodexOptions {
	/** Busqueda por keywords: cantidad de caracteres recientes a escanear. */
	searchRange: number;
	/** Porcentaje del contexto principal destinado a entradas de codex. */
	lorebookPercentage: number;
	/** Prompt para generar entradas de lore. */
	lorebookPrompt: string;
}

/** Configuracion global del plugin (persistida en loadData/saveData). */
export interface PluginSettings {
	proveedor: {
		/** Id del proveedor seleccionado. */
		id: AiProviderId;
		/** Modelo de IA seleccionado. */
		modelo: string;
	};
	/** Tokens por proveedor. */
	apiToken: Record<string, string>;
	/** Numerar capitulos automaticamente. */
	numerarCapitulosAuto: boolean;
	/** Prefix prompt global. */
	prefix: string;
	/** Memoria global (overrideable por novela en __config.json). */
	memoryContent: string;
	/** Author's note global. */
	authorNote: string;
	/** Opciones de IA. */
	aiOptions: AiOptions;
	/** Opciones de codex. */
	codexOptions: CodexOptions;
	/** Id de la ultima novela activa (para restaurar al abrir). */
	lastActiveNovelId: string | null;
	/** Preferencias de UI. */
	uiPrefs: {
		sidebarWidth: number;
		sidebarCollapsed: boolean;
		activeWorkTab: 'planear' | 'escribir' | 'chat' | 'review';
		activeSidebarTab: 'codex' | string;
	};
}

/** Paleta de colores predeterminada. */
export const PALETTE = DEFAULT_COLORS;

export const DEFAULT_AI_OPTIONS: AiOptions = {
	maxContext: 32764,
	maxOutput: 512,
	streaming: false,
	temperature: 1,
	topP: 0.01,
};

export const DEFAULT_CODEX_OPTIONS: CodexOptions = {
	searchRange: 1000,
	lorebookPercentage: 25,
	lorebookPrompt: `You are an expert worldbuilding assistant.
Given the following description, generate a codex entry in YAML format for a story-writing tool.
The entry MUST start with a "keys" field (a list of keywords relevant to the entry, in lower case, comma separated or as a YAML array).
After the keys, write a concise but detailed definition or description for the concept.
Do not include anything except the codex entry.`,
};

export const DEFAULT_SETTINGS: PluginSettings = {
	proveedor: { id: 'openrouter', modelo: '' },
	apiToken: {},
	numerarCapitulosAuto: true,
	prefix: 'Continue the text following the narration style of the user: ',
	memoryContent: '',
	authorNote: '',
	aiOptions: DEFAULT_AI_OPTIONS,
	codexOptions: DEFAULT_CODEX_OPTIONS,
	lastActiveNovelId: null,
	uiPrefs: {
		sidebarWidth: 320,
		sidebarCollapsed: false,
		activeWorkTab: 'escribir',
		activeSidebarTab: 'codex',
	},
};