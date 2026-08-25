import { EntityId, ISODate, nowISO } from '../types';

/** Verb tense the manuscript is written in. */
export type NarrativeTense = 'past' | 'present' | 'future';

/** How the story is arranged in time. */
export type NarrativeTimeId =
	| 'linear'
	| 'in-media-res'
	| 'flashback'
	| 'flashforward'
	| 'nonlinear'
	| 'frame';

/** Where the novel is meant to be published. Drives the chapter length default. */
export type AudienceId =
	| 'undefined'
	| 'web-novel'
	| 'royal-road'
	| 'wattpad'
	| 'traditional';

/**
 * Fields the AI is allowed to infer when the author leaves them empty. They are
 * badged as deduced in the UI so the author knows what was not their decision.
 */
export type BlueprintField = 'title' | 'genre' | 'style' | 'narrativeTime' | 'wordsPerChapter';

/** Target chapter length, in words. */
export interface WordRange {
	min: number;
	max: number;
}

/**
 * Blueprint of a novel: the premise plus everything needed to lay out its acts
 * and chapters. One per novel, stored in `escritura/blueprint.json`.
 *
 * `structureMarkdown` is what the author sees and edits. Once `structureEdited`
 * is true it is the source of truth, and rebuilding it from the template needs
 * the author's confirmation.
 */
export interface NovelBlueprint {
	id_novela: EntityId;
	title: string;
	/** Id of a StructureTemplate (see `src/constants/structures.ts`). */
	structure: string;
	chapterCount: number;
	/** Premise and broad strokes of the plot. */
	description: string;
	setting: string;
	genre: string;
	style: string;
	tense: NarrativeTense;
	narrativeTime: NarrativeTimeId;
	audience: AudienceId;
	wordsPerChapter: WordRange;
	/** Fields filled in by the AI rather than by the author. */
	inferred: BlueprintField[];
	structureMarkdown: string;
	/** True once the author edits the markdown by hand. */
	structureEdited: boolean;
	/** Whether the story bible block is added to AI prompts. */
	includeInPrompts: boolean;
	created_at: ISODate;
	updated_at: ISODate;
}

/** Default chapter length used until an audience or genre suggests a better one. */
export const DEFAULT_WORD_RANGE: WordRange = { min: 2000, max: 4000 };

/** Blueprint of a novel that has not been configured yet. */
export function createEmptyBlueprint(idNovela: EntityId, title = ''): NovelBlueprint {
	const now = nowISO();
	return {
		id_novela: idNovela,
		title,
		structure: 'three-act',
		chapterCount: 12,
		description: '',
		setting: '',
		genre: '',
		style: '',
		tense: 'past',
		narrativeTime: 'linear',
		audience: 'undefined',
		wordsPerChapter: { ...DEFAULT_WORD_RANGE },
		inferred: [],
		structureMarkdown: '',
		structureEdited: false,
		includeInPrompts: true,
		created_at: now,
		updated_at: now,
	};
}
