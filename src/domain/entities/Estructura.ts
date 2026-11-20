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
	/** Local date ("2026-11-19") it was published online; null if not yet. */
	published_on?: string | null;
}

/** Keys of `ChapterInfo`, to copy it between chapters without listing them twice. */
export const CHAPTER_INFO_KEYS: (keyof ChapterInfo)[] = [
	'status', 'pov_entry_id', 'location_entry_id', 'story_day', 'story_time',
	'published_on',
];

/**
 * One scene of a chapter's plan. The chapter outline stays as the summary;
 * scenes break it down so a draft can be written one scene at a time.
 * Empty point of view or setting means "same as the chapter".
 */
export interface ChapterScene {
	id: EntityId;
	title: string;
	/** What happens in the scene. */
	summary: string;
	pov_entry_id?: EntityId | null;
	location_entry_id?: EntityId | null;
	/** What the point-of-view character wants in the scene. */
	goal?: string;
	/** What stands in the way. */
	conflict?: string;
	/** How it ends, or the hook into the next scene. */
	outcome?: string;
	/** Words for this scene; empty shares the chapter's length. */
	target_words?: number | null;
}

/** Capitulo: pertenece a un Acto y tiene un manuscrito Markdown asociado. */
export interface Capitulo extends ChapterInfo {
	id_capitulo: EntityId;
	nombre: string;
	/** Resumen / outline de lo que pasara en el capitulo. */
	outline: string;
	/** Scenes of the chapter, in order. Absent or empty: no scene plan. */
	scenes?: ChapterScene[];
	/** Path relativo al vault del manuscrito asociado, si ya fue creado. */
	archivo: string | null;
	id_acto: EntityId;
	orden: number;
	created_at: ISODate;
	updated_at: ISODate;
}

