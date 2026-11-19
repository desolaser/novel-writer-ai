import { EntityId, ISODate } from '../types';

/** Acto: acto narrativo de la novela. */
export interface Acto {
	id_acto: EntityId;
	nombre: string;
	/**
	 * Resumen del acto completo. Es el contexto comprimido que representa a los
	 * capitulos ya lejanos, cuando enviar el outline de cada uno saldria caro.
	 */
	resumen: string;
	/** Orden de aparicion. */
	orden: number;
	id_novela: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}

/** Writing stage of a chapter, from the first idea to the final text. */
export type ChapterStatus = 'idea' | 'outlined' | 'drafted' | 'revised' | 'final';

/**
 * Chapter information beyond its text. Every field is optional: chapters saved
 * before it existed lack them, and an empty field means "not set".
 */
export interface ChapterInfo {
	status?: ChapterStatus;
	/** Codex entry whose point of view tells the chapter. */
	pov_entry_id?: EntityId | null;
	/** Codex entry where the chapter mainly takes place. */
	location_entry_id?: EntityId | null;
	/** Day inside the story, used to sort chapters chronologically. */
	story_day?: number | null;
	/** Free label for when it happens ("third moon of winter"). */
	story_time?: string;
}

/** Keys of `ChapterInfo`, to copy it between chapters without listing them twice. */
export const CHAPTER_INFO_KEYS: (keyof ChapterInfo)[] = [
	'status', 'pov_entry_id', 'location_entry_id', 'story_day', 'story_time',
];

/** Capitulo: pertenece a un Acto y tiene un manuscrito Markdown asociado. */
export interface Capitulo extends ChapterInfo {
	id_capitulo: EntityId;
	nombre: string;
	/** Resumen / outline de lo que pasara en el capitulo. */
	outline: string;
	/** Path relativo al vault del manuscrito asociado, si ya fue creado. */
	archivo: string | null;
	id_acto: EntityId;
	orden: number;
	created_at: ISODate;
	updated_at: ISODate;
}

