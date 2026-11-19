import type { ChapterInfo, EntityId } from '../domain';
import type {
	ChapterToolContext,
	CodexToolContext,
} from '../interfaces/tool-context';
import {
	CHAPTER_STATUSES,
	parseChapterStatus,
} from '../constants/chapterStatus';
import { parseStoryDay } from '../utils/chapterInfo';
import { describeChapterInfo, resolveChapter } from './chapterTools';
import { resolveEntry } from './codexShared';

/**
 * Chapter information: status, point of view, setting and story time. The
 * point of view and the setting are codex entries, so an entry hidden from the
 * AI is neither shown nor accepted (`resolveEntry` only sees visible ones).
 */

type InfoContext = ChapterToolContext & CodexToolContext;

function isClear(value: string): boolean {
	const clean = value.trim().toLowerCase();
	return clean === 'none' || clean === '-';
}

/** Arguments the model passed; an absent one is left unchanged. */
function given(args: Record<string, string>, name: string): string | null {
	const value = args[name];
	if (value === undefined || !value.trim()) return null;
	return value;
}

function entryArg(value: string, context: CodexToolContext): EntityId | null {
	if (isClear(value)) return null;
	return resolveEntry(value, context).id_entrada_codex;
}

function statusArg(value: string): ChapterInfo['status'] {
	if (isClear(value)) return undefined;
	const status = parseChapterStatus(value);
	if (!status) {
		const known = CHAPTER_STATUSES.map((item) => item.id).join(', ');
		throw new Error(`Unknown status "${value}". Use one of: ${known}.`);
	}
	return status;
}

function buildPatch(
	args: Record<string, string>,
	context: CodexToolContext,
): ChapterInfo {
	const patch: ChapterInfo = {};
	const status = given(args, 'status');
	if (status !== null) patch.status = statusArg(status);
	const pov = given(args, 'pov');
	if (pov !== null) patch.pov_entry_id = entryArg(pov, context);
	const setting = given(args, 'setting');
	if (setting !== null) patch.location_entry_id = entryArg(setting, context);
	const day = given(args, 'day');
	if (day !== null) patch.story_day = parseStoryDay(day);
	const when = given(args, 'when');
	if (when !== null) patch.story_time = isClear(when) ? '' : when.trim();
	return patch;
}

export async function setChapterInfo(
	args: Record<string, string>,
	context: InfoContext,
): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const patch = buildPatch(args, context);
	if (!Object.keys(patch).length) {
		throw new Error('Nothing to update: pass status, pov, setting, day and/or when.');
	}
	await context.updateChapter(chapter.id_capitulo, patch);
	const summary = describeChapterInfo({ ...chapter, ...patch }, context);
	return `Chapter "${chapter.nombre}" updated. Now: ${summary || 'no info set'}.`;
}
