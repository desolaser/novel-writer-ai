import type { Acto, Capitulo, Categoria, EntityId, EntradaCodex } from '../domain';
import type { WordRange } from '../domain/entities/NovelBlueprint';
import type {
	ActMetrics,
	CategoryCount,
	ChapterLengthMetrics,
	ChapterMetrics,
	CodexMetrics,
	EntryMentions,
	NovelMetrics,
	StyleMetrics,
	TermCount,
} from '../types/NovelMetrics';
import { STOPWORDS } from '../constants/stopwords';
import { findMentions, stripAccents } from './codexMentions';
import {
	cleanMarkdown,
	dialogueWords,
	splitParagraphs,
	splitSentences,
	tokenize,
	vocabularyVariety,
} from './textStats';

/**
 * Computes every statistic of the Metrics tab from data already loaded. Pure:
 * the UI reads the chapters and hands them over, so this is tested without
 * Obsidian.
 */

export const WORDS_PER_MINUTE = 250;
export const WORDS_PER_PAGE = 250;
const TOP_WORDS = 25;
const TOP_PHRASES = 15;
const TOP_GONE_QUIET = 10;
/** Chapters without a mention before an entry counts as gone quiet. */
const GONE_QUIET_CHAPTERS = 3;
/** Mentions an entry needs before its absence is worth noticing. */
const GONE_QUIET_MIN_MENTIONS = 3;
const MIN_WORD_LENGTH = 3;

export interface NovelMetricsInput {
	acts: Acto[];
	chapters: Capitulo[];
	/** Manuscript of each chapter by id. Missing means no text. */
	texts: Map<EntityId, string>;
	entries: EntradaCodex[];
	categories: Categoria[];
	target: WordRange | null;
}

interface TextTally {
	words: string[];
	sentences: number;
	paragraphs: number;
	dialogue: number;
	letters: number;
	phrases: Map<string, number>;
}

interface MentionTally {
	entry: EntradaCodex;
	mentions: number;
	chapters: number[];
	perChapter: number[];
}

/** Chapters in reading order: act order first, then chapter order. */
export function chaptersInOrder(acts: Acto[], chapters: Capitulo[]): Capitulo[] {
	const actOrder = new Map(acts.map((act) => [act.id_acto, act.orden]));
	const orderOf = (chapter: Capitulo) =>
		actOrder.get(chapter.id_acto) ?? Number.MAX_SAFE_INTEGER;
	return [...chapters].sort((first, second) =>
		orderOf(first) - orderOf(second) || first.orden - second.orden);
}

export function computeNovelMetrics(input: NovelMetricsInput): NovelMetrics {
	const ordered = chaptersInOrder(input.acts, input.chapters);
	const activeEntries = input.entries.filter((entry) => !entry.archivado);
	const tally: TextTally = {
		words: [],
		sentences: 0,
		paragraphs: 0,
		dialogue: 0,
		letters: 0,
		phrases: new Map(),
	};
	const mentionTallies = activeEntries.map((entry): MentionTally => ({
		entry,
		mentions: 0,
		chapters: [],
		perChapter: ordered.map(() => 0),
	}));

	const chapters = ordered.map((chapter, index): ChapterMetrics => {
		const number = index + 1;
		const text = cleanMarkdown(input.texts.get(chapter.id_capitulo) ?? '');
		const words = tallyText(text, tally);
		const distinctEntries = tallyMentions(text, number, mentionTallies);
		const act = input.acts.find((item) => item.id_acto === chapter.id_acto);
		return {
			id: chapter.id_capitulo,
			number,
			name: chapter.nombre,
			actId: chapter.id_acto,
			actName: act?.nombre ?? 'No act',
			words,
			hasFile: Boolean(chapter.archivo),
			hasOutline: Boolean(chapter.outline?.trim()),
			distinctEntries,
		};
	});

	const totalWords = tally.words.length;
	const target = usableTarget(input.target);
	const written = chapters.filter((chapter) => chapter.words > 0);
	const lastWritten = written.length ? written[written.length - 1].number : 0;

	return {
		totals: {
			words: totalWords,
			acts: input.acts.length,
			chapters: chapters.length,
			writtenChapters: written.length,
			outlinedChapters: chapters.filter((chapter) => chapter.hasOutline).length,
			readingMinutes: Math.round(totalWords / WORDS_PER_MINUTE),
			pages: Math.ceil(totalWords / WORDS_PER_PAGE),
			targetWords: target
				? Math.round((target.min + target.max) / 2) * chapters.length
				: null,
		},
		chapterLength: chapterLength(written, target),
		acts: actMetrics(input.acts, chapters),
		chapters,
		style: styleMetrics(tally),
		codex: codexMetrics(input, activeEntries, mentionTallies, lastWritten),
		topWords: topWords(tally.words, new Set()),
		topWordsWithoutCodex: topWords(tally.words, codexTerms(activeEntries)),
		repeatedPhrases: topTerms(tally.phrases, TOP_PHRASES, 2),
	};
}

/** Adds one chapter to the tally and returns its word count. */
function tallyText(text: string, tally: TextTally): number {
	let chapterWords = 0;
	for (const paragraph of splitParagraphs(text)) {
		const words = tokenize(paragraph);
		if (!words.length) continue;
		tally.paragraphs++;
		tally.dialogue += dialogueWords(paragraph);
		chapterWords += words.length;
		for (const word of words) {
			tally.words.push(word.toLowerCase());
			tally.letters += word.length;
		}
		for (const sentence of splitSentences(paragraph)) {
			tally.sentences++;
			countPhrases(tokenize(sentence), tally.phrases);
		}
	}
	return chapterWords;
}

function isStopword(word: string): boolean {
	return STOPWORDS.has(stripAccents(word));
}

/** Three-word phrases of a sentence with at least two words that carry meaning. */
function countPhrases(words: string[], phrases: Map<string, number>) {
	const lower = words.map((word) => word.toLowerCase());
	for (let index = 0; index + 2 < lower.length; index++) {
		const phrase = lower.slice(index, index + 3);
		const meaningful = phrase.filter((word) => !isStopword(word)).length;
		if (meaningful < 2) continue;
		const key = phrase.join(' ');
		phrases.set(key, (phrases.get(key) ?? 0) + 1);
	}
}

/** Counts the mentions of every entry in one chapter; returns how many entries appear. */
function tallyMentions(text: string, number: number, tallies: MentionTally[]): number {
	if (!text.trim()) return 0;
	let distinct = 0;
	for (const tally of tallies) {
		const found = findMentions(text, tally.entry).length;
		if (!found) continue;
		tally.mentions += found;
		tally.chapters.push(number);
		tally.perChapter[number - 1] = found;
		distinct++;
	}
	return distinct;
}

function median(values: number[]): number {
	if (!values.length) return 0;
	const sorted = [...values].sort((first, second) => first - second);
	const middle = Math.floor(sorted.length / 2);
	if (sorted.length % 2) return sorted[middle];
	return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

/** The Novel Setup range, if it makes sense. */
function usableTarget(target: WordRange | null): WordRange | null {
	return target && target.min > 0 && target.max >= target.min ? target : null;
}

function chapterLength(written: ChapterMetrics[], target: WordRange | null): ChapterLengthMetrics {
	const words = written.map((chapter) => chapter.words);
	const total = words.reduce((sum, value) => sum + value, 0);
	const byLength = [...written].sort((first, second) => first.words - second.words);
	const count = (test: (value: number) => boolean) => words.filter(test).length;
	return {
		average: written.length ? Math.round(total / written.length) : 0,
		median: median(words),
		shortest: byLength[0] ?? null,
		longest: byLength[byLength.length - 1] ?? null,
		target,
		underTarget: target ? count((value) => value < target.min) : 0,
		withinTarget: target
			? count((value) => value >= target.min && value <= target.max)
			: 0,
		overTarget: target ? count((value) => value > target.max) : 0,
	};
}

function actMetrics(acts: Acto[], chapters: ChapterMetrics[]): ActMetrics[] {
	return [...acts]
		.sort((first, second) => first.orden - second.orden)
		.map((act) => {
			const own = chapters.filter((chapter) => chapter.actId === act.id_acto);
			return {
				id: act.id_acto,
				name: act.nombre,
				chapters: own.length,
				words: own.reduce((sum, chapter) => sum + chapter.words, 0),
			};
		});
}

function styleMetrics(tally: TextTally): StyleMetrics {
	const words = tally.words.length;
	const ratio = (value: number, over: number) => (over ? value / over : 0);
	return {
		sentences: tally.sentences,
		averageSentenceWords: ratio(words, tally.sentences),
		averageWordLength: ratio(tally.letters, words),
		paragraphs: tally.paragraphs,
		averageParagraphWords: ratio(words, tally.paragraphs),
		dialogueShare: Math.min(1, ratio(tally.dialogue, words)),
		vocabularyVariety: vocabularyVariety(tally.words),
		uniqueWords: new Set(tally.words).size,
	};
}

function codexMetrics(
	input: NovelMetricsInput,
	activeEntries: EntradaCodex[],
	tallies: MentionTally[],
	lastWritten: number,
): CodexMetrics {
	const categories = new Map(input.categories.map((item) => [item.id_categoria, item]));
	const toMentions = (tally: MentionTally): EntryMentions => {
		const category = categories.get(tally.entry.id_categoria);
		const lastChapter = tally.chapters[tally.chapters.length - 1] ?? null;
		return {
			id: tally.entry.id_entrada_codex,
			name: tally.entry.nombre,
			color: tally.entry.color || category?.color || '',
			categoryName: category?.nombre ?? 'Other',
			mentions: tally.mentions,
			chapters: tally.chapters.length,
			firstChapter: tally.chapters[0] ?? null,
			lastChapter,
			silentChapters: lastChapter === null ? 0 : lastWritten - lastChapter,
			perChapter: tally.perChapter,
		};
	};
	const all = tallies.map(toMentions);
	const mentioned = all
		.filter((entry) => entry.mentions > 0)
		.sort((first, second) => second.mentions - first.mentions);
	const goneQuiet = mentioned
		.filter((entry) => entry.mentions >= GONE_QUIET_MIN_MENTIONS)
		.filter((entry) => entry.silentChapters >= GONE_QUIET_CHAPTERS)
		.sort((first, second) => second.silentChapters - first.silentChapters)
		.slice(0, TOP_GONE_QUIET);

	return {
		activeEntries: activeEntries.length,
		archivedEntries: input.entries.length - activeEntries.length,
		byCategory: categoryCounts(activeEntries, categories),
		mentioned,
		neverMentioned: all.filter((entry) => entry.mentions === 0),
		goneQuiet,
	};
}

function categoryCounts(
	entries: EntradaCodex[],
	categories: Map<EntityId, Categoria>,
): CategoryCount[] {
	const counts = new Map<EntityId, CategoryCount>();
	for (const entry of entries) {
		const category = categories.get(entry.id_categoria);
		const current = counts.get(entry.id_categoria) ?? {
			id: entry.id_categoria,
			name: category?.nombre ?? 'Other',
			color: category?.color ?? '',
			entries: 0,
		};
		current.entries++;
		counts.set(entry.id_categoria, current);
	}
	return [...counts.values()].sort((first, second) => second.entries - first.entries);
}

/** Lowercase words of every name and alias, to leave them out of the word list. */
function codexTerms(entries: EntradaCodex[]): Set<string> {
	const terms = new Set<string>();
	for (const entry of entries) {
		const names = [entry.nombre, ...(entry.alias || '').split(',')];
		for (const name of names) {
			for (const word of tokenize(name)) terms.add(word.toLowerCase());
		}
	}
	return terms;
}

function topWords(words: string[], excluded: Set<string>): TermCount[] {
	const counts = new Map<string, number>();
	for (const word of words) {
		if (word.length < MIN_WORD_LENGTH) continue;
		if (/^\d+$/.test(word)) continue;
		if (isStopword(word) || excluded.has(word)) continue;
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
	return topTerms(counts, TOP_WORDS, 1);
}

function topTerms(counts: Map<string, number>, limit: number, minCount: number): TermCount[] {
	const terms: TermCount[] = [];
	counts.forEach((count, term) => {
		if (count >= minCount) terms.push({ term, count });
	});
	terms.sort((first, second) =>
		second.count - first.count || first.term.localeCompare(second.term));
	return terms.slice(0, limit);
}
