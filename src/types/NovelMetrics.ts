import type { EntityId } from '../domain';
import type { WordRange } from '../domain/entities/NovelBlueprint';

/** Statistics of the active novel, shown in the Metrics tab of the Companion. */

export interface ChapterMetrics {
	id: EntityId;
	/** Position in reading order, starting at 1. */
	number: number;
	name: string;
	actId: EntityId;
	actName: string;
	words: number;
	/** The chapter has a manuscript file linked. */
	hasFile: boolean;
	hasOutline: boolean;
	/** Different codex entries mentioned in the chapter. */
	distinctEntries: number;
}

export interface ActMetrics {
	id: EntityId;
	name: string;
	chapters: number;
	words: number;
}

export interface TermCount {
	term: string;
	count: number;
}

export interface EntryMentions {
	id: EntityId;
	name: string;
	color: string;
	categoryName: string;
	mentions: number;
	/** Chapters with at least one mention. */
	chapters: number;
	/** Reading-order number of the first and last chapter with a mention. */
	firstChapter: number | null;
	lastChapter: number | null;
	/** Written chapters after the last mention; 0 if never mentioned. */
	silentChapters: number;
	/** Mentions in each chapter, by reading order (index 0 is chapter #1). */
	perChapter: number[];
}

export interface CategoryCount {
	id: EntityId;
	name: string;
	color: string;
	entries: number;
}

export interface TotalsMetrics {
	words: number;
	acts: number;
	chapters: number;
	/** Chapters with at least one word. */
	writtenChapters: number;
	outlinedChapters: number;
	readingMinutes: number;
	pages: number;
	/** Chapters times the middle of the Novel Setup range; null without a target. */
	targetWords: number | null;
}

export interface ChapterLengthMetrics {
	/** Average and median of the chapters that have text. */
	average: number;
	median: number;
	shortest: ChapterMetrics | null;
	longest: ChapterMetrics | null;
	/** Words per chapter from the Novel Setup, if the novel has one. */
	target: WordRange | null;
	underTarget: number;
	withinTarget: number;
	overTarget: number;
}

export interface StyleMetrics {
	sentences: number;
	averageSentenceWords: number;
	averageWordLength: number;
	paragraphs: number;
	averageParagraphWords: number;
	/** Share of the words spoken in dialogue, 0 to 1. */
	dialogueShare: number;
	/** Moving-average type-token ratio, 0 to 1. Higher is a more varied vocabulary. */
	vocabularyVariety: number;
	uniqueWords: number;
}

export interface CodexMetrics {
	activeEntries: number;
	archivedEntries: number;
	byCategory: CategoryCount[];
	/** Entries with at least one mention, most mentioned first. */
	mentioned: EntryMentions[];
	neverMentioned: EntryMentions[];
	/** Mentioned entries not seen for a while, longest absence first. */
	goneQuiet: EntryMentions[];
}

/** Chapters that share a status or a point of view. */
export interface ChapterGroupMetrics {
	/** Status id or entry id; "" for chapters without one. */
	key: string;
	name: string;
	color: string;
	chapters: number;
	words: number;
	/** Reading-order number of its last chapter. */
	lastChapter: number | null;
}

export interface ChapterInfoMetrics {
	/** Empty until at least one chapter has a status. */
	byStatus: ChapterGroupMetrics[];
	/** Empty until at least one chapter has a point of view. */
	byPointOfView: ChapterGroupMetrics[];
}

/** A proper name of the manuscript with no codex entry (`findNameCandidates`). */
export interface NameCandidate {
	/** As written most often. */
	name: string;
	mentions: number;
	/** Chapters it appears in. */
	chapters: number;
	/** First chapter it appears in (1 = first). */
	firstChapter: number;
	/** A sentence where it appears mid-sentence, shortened. */
	example: string;
}

export interface NovelMetrics {
	totals: TotalsMetrics;
	chapterLength: ChapterLengthMetrics;
	acts: ActMetrics[];
	chapters: ChapterMetrics[];
	chapterInfo: ChapterInfoMetrics;
	style: StyleMetrics;
	codex: CodexMetrics;
	topWords: TermCount[];
	/** Same as `topWords`, without the names and aliases of codex entries. */
	topWordsWithoutCodex: TermCount[];
	/** Three-word phrases that repeat across the manuscript. */
	repeatedPhrases: TermCount[];
	/** Proper names without a codex entry, most mentioned first. */
	nameCandidates: NameCandidate[];
}
