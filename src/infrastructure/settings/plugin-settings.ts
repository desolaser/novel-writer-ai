import { DEFAULT_COLORS } from '../../constants/novel';
import type { Modelo } from '../../domain/entities/Modelo';
import type { CustomPrompt } from '../../domain/entities/CustomPrompt';

/** Proveedor de IA seleccionado. */
export type AiProviderId =
	| 'openrouter' | 'deepseek' | 'ooba' | 'ollama'
	| 'opencodezen' | 'opencodego' | 'novelai'
	| 'anthropic' | 'claudecode';

/** Opciones de IA (reformadas). Algunas no aplican a todos los proveedores. */
export interface AiOptions {
	maxContext: number;
	maxOutput: number;
	maxOutputChat: number;
	streaming: boolean;
	temperature: number;
	topP?: number;
	topK?: number;
	topA?: number;
	repetitionPenalty?: number;
	repetitionPenaltyRange?: number;
	presencePenalty?: number;
	frequencyPenalty?: number;
	minP?: number;
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
	/** Modelos reutilizables creados por el usuario. */
	modelos: Modelo[];
	/** Identificador del modelo activo por defecto. */
	modeloPredeterminadoId: string;
	/** Numerar capitulos automaticamente. */
	numerarCapitulosAuto: boolean;
	/** Prefix prompt global. */
	prefix: string;
	/** Memoria global (overrideable por novela en __config.json). */
	memoryContent: string;
	/** Author's note global. */
	authorNote: string;
	/** Target word count used by batch chapter drafts. */
	draftWordCount: number;
	/** Opciones de IA. */
	aiOptions: AiOptions;
	/** Opciones de codex. */
	codexOptions: CodexOptions;
	/** Id de la ultima novela activa (para restaurar al abrir). */
	lastActiveNovelId: string | null;
	/** Preferencias de UI. */
	uiPrefs: {
		activeSidebarTab: 'codex' | string;
	};
	/** Prompts custom del sistema (chat y texto). */
	customPrompts: CustomPrompt[];
	/** ID del prompt de chat por defecto. */
	defaultChatPromptId: string;
	/** ID del prompt de texto por defecto. */
	defaultTextPromptId: string;
}

/** Paleta de colores predeterminada. */
export const PALETTE = DEFAULT_COLORS;

export const DEFAULT_AI_OPTIONS: AiOptions = {
	maxContext: 32768,
	maxOutput: 300,
	maxOutputChat: 8192,
	streaming: true,
	temperature: 1,
	topP: 0.9,
	topK: 40,
	presencePenalty: 1.5,
	repetitionPenalty: 1,
	repetitionPenaltyRange: 64, // Used for repeat_last_n in ollama
	minP: 0.05
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
	modelos: [],
	modeloPredeterminadoId: '',
	numerarCapitulosAuto: true,
	prefix: 'Continue the text following the narration style of the user: ',
	memoryContent: '',
	authorNote: '',
	draftWordCount: 2000,
	aiOptions: DEFAULT_AI_OPTIONS,
	codexOptions: DEFAULT_CODEX_OPTIONS,
	lastActiveNovelId: null,
	uiPrefs: {
		activeSidebarTab: 'codex',
	},
	customPrompts: createDefaultPrompts(),
	defaultChatPromptId: '',
	defaultTextPromptId: '',
};

/** Crea los dos prompts por defecto y retorna el array inicial. */
export function createDefaultPrompts(): CustomPrompt[] {
	const now = new Date().toISOString();
	const chatPrompt: CustomPrompt = {
		id_prompt: 'default-chat-prompt',
		tipo: 'chat',
		nombre: 'Default Chat Prompt',
		texto: "You're a helpful writer assistant for an author.",
		created_at: now,
		updated_at: now,
	};
	const textPrompt: CustomPrompt = {
		id_prompt: 'default-text-prompt',
		tipo: 'text',
		nombre: 'Default Text Prompt',
		texto: 'Continue the text following the narration style of the user.',
		created_at: now,
		updated_at: now,
	};
	return [chatPrompt, textPrompt];
}
