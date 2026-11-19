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

/** "day 12 (third moon)", "day 12", "third moon" or "". */
export function formatStoryTime(info: ChapterInfo): string {
	const label = info.story_time?.trim() ?? '';
	const hasDay = typeof info.story_day === 'number';
	if (hasDay && label) return `day ${info.story_day} (${label})`;
	if (hasDay) return `day ${info.story_day}`;
	return label;
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

/** Facts that are set, in a fixed order. Status only when asked for. */
export function chapterInfoFacts(
	info: ChapterInfo,
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
	return facts;
}

/**
 * The line a writing prompt receives: point of view, setting and story time.
 * Empty when nothing is set. Status is left out: it says nothing about the
 * story.
 */
export function chapterInfoPromptLine(
	info: ChapterInfo,
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
