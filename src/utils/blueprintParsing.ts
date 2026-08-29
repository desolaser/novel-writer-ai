import type {
	BlueprintField,
	NarrativeTimeId,
	NovelBlueprint,
	WordRange,
} from '../domain/entities/NovelBlueprint';
import { NARRATIVE_TIMES } from '../constants/structures';
import {
	normalizeForMatch,
	parseDelimitedSections,
	stripCodeFence,
	type ParsedSection,
} from './codexAiParsing';

/**
 * Parsing of AI answers for the novel blueprint. Pure and defensive on purpose:
 * a field that cannot be read is dropped instead of throwing away the whole
 * answer, and a field the model had no evidence for produces no proposal at all.
 */

/** First usable line, without fences, bullets, an echoed field name or quotes. */
export function cleanValue(raw: string, label: string): string {
	let value = stripCodeFence(raw);
	const wanted = normalizeForMatch(label);
	value = value.replace(/^\s*(?:\[\[)?\s*([^\n:]{1,60}?)\s*(?:\]\])?\s*:\s*/, (match, prefix: string) =>
		normalizeForMatch(prefix) === wanted ? '' : match);
	const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
	value = firstLine.replace(/^[-*•]\s+/, '').trim();
	const quoted = value.match(/^"([\s\S]*)"$/) ?? value.match(/^'([\s\S]*)'$/);
	if (quoted) value = quoted[1].trim();
	// Models like to close a title with a period; a title is not a sentence.
	return value.replace(/\s*[.]$/, '').trim();
}

const MIN_CHAPTER_WORDS = 100;
const MAX_CHAPTER_WORDS = 30000;

/**
 * Reads a chapter length out of free text: "2000-4000", "2,000 to 4,000 words",
 * "around 3000". A single number becomes a range around it, because a target
 * length is never a single exact figure.
 */
export function parseWordRange(text: string): WordRange | null {
	const digits = (text || '').replace(/[,.](?=\d{3}\b)/g, '');
	const numbers = (digits.match(/\d{3,6}/g) ?? [])
		.map((value) => Number(value))
		.filter((value) => value >= MIN_CHAPTER_WORDS && value <= MAX_CHAPTER_WORDS);
	if (numbers.length === 0) return null;
	if (numbers.length === 1) {
		const center = numbers[0];
		return {
			min: Math.max(MIN_CHAPTER_WORDS, Math.round((center * 0.8) / 100) * 100),
			max: Math.round((center * 1.2) / 100) * 100,
		};
	}
	const [min, max] = [numbers[0], numbers[1]].sort((first, second) => first - second);
	return { min, max: Math.max(min, max) };
}

/** Resolves free text to one of the narrative times, or null when there is no evidence. */
export function matchNarrativeTime(text: string): NarrativeTimeId | null {
	const needle = normalizeForMatch(text);
	if (!needle) return null;
	if (/\b(unclear|unknown|none|no evidence|not clear)\b/.test(needle)) return null;
	// `unset` is a UI state, never something the model can answer.
	const match = NARRATIVE_TIMES.filter((item) => item.id !== 'unset').find((item) => {
		const label = normalizeForMatch(item.label);
		const id = normalizeForMatch(item.id.replace(/-/g, ' '));
		return needle === label || needle === id || needle.includes(label) || needle.includes(id);
	});
	return match?.id ?? null;
}

export interface BlueprintFieldAnswer {
	/** What the author sees in the proposal. */
	text: string;
	/** What accepting writes. Null when the answer is not usable. */
	patch: Partial<NovelBlueprint> | null;
}

/** Turns one raw field answer into something that can be shown and accepted. */
export function resolveBlueprintField(
	field: BlueprintField,
	raw: string,
	label: string,
): BlueprintFieldAnswer {
	const value = cleanValue(raw, label);
	switch (field) {
		case 'title':
			return value ? { text: value, patch: { title: value } } : { text: '', patch: null };
		case 'genre':
			return value ? { text: value, patch: { genre: value } } : { text: '', patch: null };
		case 'style':
			return value ? { text: value, patch: { style: value } } : { text: '', patch: null };
		case 'narrativeTime': {
			const matched = matchNarrativeTime(value);
			// Answering Linear is not a decision either: the spec is to assume linear
			// silently rather than record it as something the story calls for.
			if (!matched || matched === 'linear')
				return {
					text: 'No clear evidence of a non-linear arrangement. It stays linear by default.',
					patch: null,
				};
			const readable = NARRATIVE_TIMES.find((item) => item.id === matched)?.label ?? matched;
			return { text: readable, patch: { narrativeTime: matched } };
		}
		case 'wordsPerChapter': {
			const range = parseWordRange(value);
			if (!range) return { text: value, patch: null };
			return { text: `${range.min}-${range.max} words`, patch: { wordsPerChapter: range } };
		}
		default:
			return { text: value, patch: null };
	}
}

/**
 * Collapses an outline answer into the single paragraph the outline field holds,
 * matching what the rest of the plugin stores for `Capitulo.outline`.
 */
export function normalizeOutlineText(text: string): string {
	return stripCodeFence(text)
		.replace(/^\s*[-*•]\s+/gm, '')
		.replace(/^\s*#{1,6}\s+/gm, '')
		.replace(/\s*\n+\s*/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

/**
 * Maps the answer for one act onto its chapters, by index into `chapters`.
 *
 * Headers are matched by name first, then loosely, and whatever is left is taken
 * in order: a model that rephrased the headers still produces usable outlines,
 * and a chapter that got nothing simply stays empty.
 */
export function matchChapterOutlines(answer: string, chapters: string[]): Map<number, string> {
	const sections = parseDelimitedSections(answer);
	const outlines = new Map<number, string>();
	const used = new Set<number>();
	const pending: ParsedSection[] = [];

	const take = (index: number, body: string) => {
		const outline = normalizeOutlineText(body);
		if (!outline) return;
		used.add(index);
		outlines.set(index, outline);
	};

	for (const section of sections) {
		const header = normalizeForMatch(section.header);
		const exact = chapters.findIndex(
			(name, index) => !used.has(index) && normalizeForMatch(name) === header
		);
		if (exact >= 0) take(exact, section.body);
		else pending.push(section);
	}

	// Second pass: a header that contains the chapter name, or the other way around.
	const stillPending: ParsedSection[] = [];
	for (const section of pending) {
		const header = normalizeForMatch(section.header);
		const loose = chapters.findIndex((name, index) => {
			if (used.has(index)) return false;
			const normalized = normalizeForMatch(name);
			return normalized.length > 2 && (header.includes(normalized) || normalized.includes(header));
		});
		if (loose >= 0) take(loose, section.body);
		else stillPending.push(section);
	}

	// Last resort: fill the chapters still empty, in order.
	const free = chapters.map((_, index) => index).filter((index) => !used.has(index));
	stillPending.forEach((section, position) => {
		if (position < free.length) take(free[position], section.body);
	});

	return outlines;
}

/** Finds the field a section header refers to, tolerating casing and prefixes. */
function matchField(
	header: string,
	targets: BlueprintField[],
	labels: Record<BlueprintField, string>,
): BlueprintField | null {
	const cleaned = normalizeForMatch(header.replace(/^\s*(field|campo)\s*:\s*/i, ''));
	if (!cleaned) return null;
	const exact = targets.find((field) => normalizeForMatch(labels[field]) === cleaned);
	if (exact) return exact;
	return (
		targets.find((field) => {
			const label = normalizeForMatch(labels[field]);
			return label.length > 2 && (label.includes(cleaned) || cleaned.includes(label));
		}) ?? null
	);
}

/**
 * Splits a multi-field answer into per-field results. Sections for fields that
 * were not asked about, and repeated sections, are ignored.
 */
export function parseBlueprintAnswer(
	answer: string,
	targets: BlueprintField[],
	labels: Record<BlueprintField, string>,
): Partial<Record<BlueprintField, BlueprintFieldAnswer>> {
	const result: Partial<Record<BlueprintField, BlueprintFieldAnswer>> = {};
	for (const section of parseDelimitedSections(answer)) {
		const field = matchField(section.header, targets, labels);
		if (!field || result[field]) continue;
		result[field] = resolveBlueprintField(field, section.body, labels[field]);
	}
	return result;
}
