import { EntityId, ISODate } from '../types';

/** Tipo de prompt: chat (ChatTab) o texto (generacion de texto). */
export type PromptType = 'chat' | 'text';

/** Prompt custom del sistema que el usuario puede configurar. */
export interface CustomPrompt {
	id_prompt: EntityId;
	/** Tipo: 'chat' para ChatTab, 'text' para generacion de texto. */
	tipo: PromptType;
	nombre: string;
	texto: string;
	/** Optional layout. Existing prompts use the default layout for their type. */
	plantilla?: string;
	created_at: ISODate;
	updated_at: ISODate;
}
