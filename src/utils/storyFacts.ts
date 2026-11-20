import type { Capitulo, EntityId, ISODate } from '../domain';
import type {
	ChapterContinuity,
	ContinuityFile,
	StoryFact,
} from '../types/Continuity';
import { formatStoryTime } from './chapterInfo';
import { genId } from './ids';

/**
 * The facts ledger, pure: hashes to know when a chapter changed, merging new
 * AI facts with the author's, list operations and the text a prompt gets.
 */

/** Most facts asked for per chapter. */
export const MAX_FACTS_PER_CHAPTER = 12;

export function emptyContinuityFile(): ContinuityFile {
	return { version: 1, chapters: {} };
}

export function emptyChapterContinuity(): ChapterContinuity {
	return { text_hash: null, extracted_at: null, facts: [], report: null };
}

function withoutFrontmatter(text: string): string {
	return text.replace(/^---\s*[\s\S]*?---\s*/, '');
}

/**
 * Hash of a chapter's story text (FNV-1a, 32 bits). Frontmatter and spacing
 * are left out: rewriting the chapter's memory is not a change to the story.
 */
export function storyTextHash(text: string): string {
	const story = withoutFrontmatter(text ?? '').replace(/\s+/g, ' ').trim();
	let hash = 0x811c9dc5;
	for (let i = 0; i < story.length; i++) {
		hash ^= story.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193) >>> 0;
	}
	return hash.toString(16).padStart(8, '0');
}

/** Whether the AI facts of a chapter were extracted from other text. */
export function factsAreStale(entry: ChapterContinuity | undefined, hash: string): boolean {
	return !entry || entry.text_hash !== hash;
}

function normalizeFact(text: string): string {
	return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * New AI facts for a chapter. The author's facts (written or edited by hand)
 * stay; the old AI facts are replaced; an AI fact the author already has is
 * not added twice.
 */
export function mergeExtractedFacts(
	entry: ChapterContinuity | undefined,
	extracted: string[],
	hash: string,
	now: ISODate,
): ChapterContinuity {
	const current = entry ?? emptyChapterContinuity();
	const authored = current.facts.filter((fact) => fact.source === 'author');
	const known = new Set(authored.map((fact) => normalizeFact(fact.text)));
	const fresh: StoryFact[] = [];
	for (const text of extracted) {
		const clean = text.trim();
		const key = normalizeFact(clean);
		if (!clean || known.has(key)) continue;
		known.add(key);
		fresh.push({ id: genId(), text: clean, source: 'ai' });
	}
	return {
		...current,
		text_hash: hash,
		extracted_at: now,
		facts: [...authored, ...fresh],
	};
}

export function addFact(entry: ChapterContinuity, text: string): ChapterContinuity {
	const clean = text.trim();
	if (!clean) return entry;
	const fact: StoryFact = { id: genId(), text: clean, source: 'author' };
	return { ...entry, facts: [...entry.facts, fact] };
}

/** An edited fact becomes the author's: extracting again won't replace it. */
export function editFact(
	entry: ChapterContinuity,
	id: EntityId,
	text: string,
): ChapterContinuity {
	const clean = text.trim();
	if (!clean) return removeFact(entry, id);
	return {
		...entry,
		facts: entry.facts.map((fact) =>
			fact.id === id ? { ...fact, text: clean, source: 'author' } : fact),
	};
}

export function removeFact(entry: ChapterContinuity, id: EntityId): ChapterContinuity {
	return { ...entry, facts: entry.facts.filter((fact) => fact.id !== id) };
}

export function dismissIssue(
	entry: ChapterContinuity,
	issueId: EntityId,
): ChapterContinuity {
	if (!entry.report) return entry;
	const issues = entry.report.issues.filter((issue) => issue.id !== issueId);
	return { ...entry, report: { ...entry.report, issues } };
}

/** Facts of the chapters before one, in reading order, for a prompt. */
export interface EarlierFacts {
	/** "Ch. 2 "Arrival" (day 3):\n- fact" blocks. */
	text: string;
	/** Chapter number in `text` → chapter id. */
	chapterByNumber: Map<number, EntityId>;
	count: number;
}

/**
 * The facts of `chapters` (reading order, the ones before the checked
 * chapter), numbered by their place in the novel. Chapters without facts are
 * left out but keep their number.
 */
export function earlierFactsBlock(
	chapters: Capitulo[],
	ledger: ContinuityFile,
	numberOf: (chapter: Capitulo) => number,
): EarlierFacts {
	const blocks: string[] = [];
	const chapterByNumber = new Map<number, EntityId>();
	let count = 0;
	for (const chapter of chapters) {
		const facts = ledger.chapters[chapter.id_capitulo]?.facts ?? [];
		if (!facts.length) continue;
		const number = numberOf(chapter);
		chapterByNumber.set(number, chapter.id_capitulo);
		const time = formatStoryTime(chapter);
		const head = `Ch. ${number} "${chapter.nombre}"${time ? ` (${time})` : ''}:`;
		blocks.push([head, ...facts.map((fact) => `- ${fact.text}`)].join('\n'));
		count += facts.length;
	}
	return { text: blocks.join('\n\n'), chapterByNumber, count };
}
