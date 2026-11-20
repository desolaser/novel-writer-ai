import { AiContextPolicy } from '../domain';
import type { ChapterInfo, EntradaCodex, EntityId } from '../domain';
import { chapterStatusInfo } from '../constants/chapterStatus';

/**
 * Chapter information (status, point of view, setting, story time) as text.
 * Pure: the Outline, the chat tools, the prompts and Metrics share it.
 */

/** Entries the AI may see: not archived and not marked "Never". */
function isVisibleToAi(entry: EntradaCodex): boolean {
	return !entry.archivado && entry.ai_context_policy !== AiContextPolicy.Never;
}

/**
 * Name of a linked codex entry. With `forAi`, an entry hidden from the AI
 * resolves to nothing, so its name never reaches a prompt.
 */
export function linkedEntryName(
	id: EntityId | null | undefined,
	entries: EntradaCodex[],
	forAi: boolean,
): string {
	if (!id) return '';
	const entry = entries.find((item) => item.id_entrada_codex === id);
	if (!entry) return '';
	if (forAi && !isVisibleToAi(entry)) return '';
	return entry.nombre;
}

/** The days of a chapter's scenes, the only part of a scene time needs. */
export interface DatedScene {
	story_day?: number | null;
}

/** A chapter's time and, when it has them, its scenes. */
export type ChapterTime = ChapterInfo & { scenes?: DatedScene[] };

export interface DayRange {
	start: number;
	end: number;
}

function isDay(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Days a chapter covers: from its day to its "to day", widened to every day
 * its scenes have. Null when nothing is dated.
 */
export function chapterDayRange(info: ChapterTime): DayRange | null {
	const days = [
		info.story_day,
		info.story_day_end,
		...(info.scenes ?? []).map((scene) => scene.story_day),
	].filter(isDay);
	if (!days.length) return null;
	return { start: Math.min(...days), end: Math.max(...days) };
}

/** "day 12", "days 3–5" or "". */
export function formatDayRange(range: DayRange | null): string {
	if (!range) return '';
	return range.start === range.end
		? `day ${range.start}`
		: `days ${range.start}–${range.end}`;
}

/** "days 3–5 (third moon)", "day 12", "third moon" or "". */
export function formatStoryTime(info: ChapterTime): string {
	const label = info.story_time?.trim() ?? '';
	const days = formatDayRange(chapterDayRange(info));
	if (days && label) return `${days} (${label})`;
	return days || label;
}

/**
 * Checks a chapter's "to day" against its day: it can't be before it.
 * Throws a message the author or the model can act on.
 */
export function checkDayRange(start: number | null | undefined, end: number | null): void {
	if (end === null || !isDay(start)) return;
	if (end < start) {
		throw new Error(`The last day (${end}) can't be before the first (${start}).`);
	}
}

/**
 * Parses a story day. Empty or "none" clears it (null); anything that is not a
 * whole number throws, with a message the author or the model can act on.
 */
export function parseStoryDay(value: string): number | null {
	const clean = value.trim().replace(/^day\s+/i, '');
	if (!clean || clean.toLowerCase() === 'none') return null;
	const day = Number(clean);
	if (!Number.isInteger(day)) {
		throw new Error(`Story day must be a whole number, got "${value}".`);
	}
	return day;
}

export interface ChapterInfoFact {
	label: string;
	value: string;
}

/**
 * Facts that are set, in a fixed order. Status and publication date only when
 * asked for.
 */
export function chapterInfoFacts(
	info: ChapterTime,
	entries: EntradaCodex[],
	options: { forAi: boolean; includeStatus: boolean },
): ChapterInfoFact[] {
	const facts: ChapterInfoFact[] = [];
	const status = chapterStatusInfo(info.status);
	if (options.includeStatus && status) {
		facts.push({ label: 'Status', value: status.label });
	}
	const pov = linkedEntryName(info.pov_entry_id, entries, options.forAi);
	if (pov) facts.push({ label: 'Point of view', value: pov });
	const location = linkedEntryName(info.location_entry_id, entries, options.forAi);
	if (location) facts.push({ label: 'Setting', value: location });
	const time = formatStoryTime(info);
	if (time) facts.push({ label: 'Story time', value: time });
	// Like the status, the publication date says nothing about the story.
	if (options.includeStatus && info.published_on) {
		facts.push({ label: 'Published', value: info.published_on });
	}
	return facts;
}

/**
 * The line a writing prompt receives: point of view, setting and story time.
 * Empty when nothing is set. Status is left out: it says nothing about the
 * story.
 */
export function chapterInfoPromptLine(
	info: ChapterTime,
	entries: EntradaCodex[],
): string {
	const facts = chapterInfoFacts(info, entries, {
		forAi: true,
		includeStatus: false,
	});
	if (!facts.length) return '';
	const text = facts.map((fact) => `${fact.label}: ${fact.value}.`).join(' ');
	return `Chapter info: ${text}`;
}
