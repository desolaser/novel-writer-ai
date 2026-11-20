import type {
	Capitulo,
	Categoria,
	ChapterInfo,
	ChapterScene,
	EntityId,
	EntradaCodex,
} from '../domain';
import type {
	StoryTimeline,
	TimelineCard,
	TimelineColumn,
	TimelineLane,
	TimelineLaneMode,
	TimelineSceneMark,
	TimelineUndated,
} from '../types/StoryTimeline';
import { chapterDayRange, type DayRange } from './chapterInfo';
import { sceneLabel } from './chapterScenes';
import { findMentions } from './codexMentions';
import { cleanMarkdown } from './textStats';

/**
 * The story timeline, pure: one column per day used, one lane per point of
 * view, setting or character, and each chapter as a bar over its days.
 */

export interface TimelineInput {
	/** In reading order. */
	chapters: Capitulo[];
	entries: EntradaCodex[];
	categories: Categoria[];
	mode: TimelineLaneMode;
	/** Entries each chapter names; only needed by the "characters" mode. */
	mentions?: Map<EntityId, Set<EntityId>>;
}

const NO_LANE = 'none';

const NO_LANE_NAMES: Record<TimelineLaneMode, string> = {
	pov: 'No point of view',
	setting: 'No setting',
	characters: 'No character named',
	none: 'Chapters',
};

/** The codex entries a chapter names, by id, for the "characters" lanes. */
export function chapterEntryMentions(
	texts: Map<EntityId, string>,
	entries: EntradaCodex[],
): Map<EntityId, Set<EntityId>> {
	const active = entries.filter((entry) => !entry.archivado);
	const result = new Map<EntityId, Set<EntityId>>();
	for (const [chapterId, raw] of texts) {
		const text = cleanMarkdown(raw);
		const named = new Set<EntityId>();
		for (const entry of active) {
			if (findMentions(text, entry).length) named.add(entry.id_entrada_codex);
		}
		result.set(chapterId, named);
	}
	return result;
}

/** Entries of the "Characters" category; every entry if there is none. */
function characterEntries(
	entries: EntradaCodex[],
	categories: Categoria[],
): Set<EntityId> {
	const category = categories.find((item) =>
		item.nombre.toLowerCase() === 'characters');
	const chosen = category
		? entries.filter((entry) => entry.id_categoria === category.id_categoria)
		: entries;
	return new Set(chosen.map((entry) => entry.id_entrada_codex));
}

/** The lanes a chapter goes in: their keys (entry ids or `NO_LANE`). */
function laneKeys(
	chapter: Capitulo,
	input: TimelineInput,
	characters: Set<EntityId>,
): string[] {
	if (input.mode === 'pov') return [chapter.pov_entry_id || NO_LANE];
	if (input.mode === 'setting') return [chapter.location_entry_id || NO_LANE];
	if (input.mode === 'none') return [NO_LANE];
	const named = [...(input.mentions?.get(chapter.id_capitulo) ?? [])]
		.filter((id) => characters.has(id));
	return named.length ? named : [NO_LANE];
}

function columnsOf(days: number[]): TimelineColumn[] {
	const sorted = [...new Set(days)].sort((a, b) => a - b);
	return sorted.map((day, index) => ({
		day,
		gapBefore: index ? Math.max(0, day - sorted[index - 1] - 1) : 0,
	}));
}

function sceneMarks(
	scenes: ChapterScene[] | undefined,
	columnOf: Map<number, number>,
): TimelineSceneMark[] {
	const marks: TimelineSceneMark[] = [];
	(scenes ?? []).forEach((scene, index) => {
		if (typeof scene.story_day !== 'number') return;
		marks.push({
			column: columnOf.get(scene.story_day)!,
			label: String(index + 1),
			title: `Scene ${index + 1}: ${sceneLabel(scene, index)} (day ${scene.story_day})`,
		});
	});
	return marks;
}

/** Rows inside a lane: a bar goes in the first row where it fits. */
function stack(cards: TimelineCard[]): number {
	const rowEnds: number[] = [];
	const ordered = [...cards].sort((a, b) =>
		a.startColumn - b.startColumn || a.number - b.number);
	for (const card of ordered) {
		let row = rowEnds.findIndex((end) => end < card.startColumn);
		if (row < 0) {
			row = rowEnds.length;
			rowEnds.push(card.endColumn);
		} else {
			rowEnds[row] = card.endColumn;
		}
		card.row = row;
	}
	return Math.max(1, rowEnds.length);
}

function laneName(key: string, mode: TimelineLaneMode, entries: EntradaCodex[]) {
	const entry = entries.find((item) => item.id_entrada_codex === key);
	return {
		name: entry?.nombre || NO_LANE_NAMES[mode],
		color: entry?.color ?? '',
		entryId: entry ? entry.id_entrada_codex : null,
	};
}

export function buildStoryTimeline(input: TimelineInput): StoryTimeline {
	const ranges = new Map<EntityId, DayRange>();
	const undated: TimelineUndated[] = [];
	const days: number[] = [];
	input.chapters.forEach((chapter, index) => {
		const range = chapterDayRange(chapter);
		if (!range) {
			undated.push({
				chapterId: chapter.id_capitulo,
				number: index + 1,
				name: chapter.nombre,
			});
			return;
		}
		ranges.set(chapter.id_capitulo, range);
		days.push(range.start, range.end);
		for (const scene of chapter.scenes ?? []) {
			if (typeof scene.story_day === 'number') days.push(scene.story_day);
		}
	});
	const columns = columnsOf(days);
	const columnOf = new Map(columns.map((column, index) => [column.day, index]));
	const characters = characterEntries(input.entries, input.categories);

	const lanes = new Map<string, TimelineLane>();
	let latestStart = -Infinity;
	input.chapters.forEach((chapter, index) => {
		const range = ranges.get(chapter.id_capitulo);
		if (!range) return;
		const flashback = range.start < latestStart;
		latestStart = Math.max(latestStart, range.start);
		for (const key of laneKeys(chapter, input, characters)) {
			let lane = lanes.get(key);
			if (!lane) {
				const named = laneName(key, input.mode, input.entries);
				lane = { key, ...named, rows: 1, cards: [] };
				lanes.set(key, lane);
			}
			lane.cards.push({
				chapterId: chapter.id_capitulo,
				number: index + 1,
				name: chapter.nombre,
				startColumn: columnOf.get(range.start)!,
				endColumn: columnOf.get(range.end)!,
				row: 0,
				start: range.start,
				end: range.end,
				when: chapter.story_time?.trim() ?? '',
				flashback,
				scenes: sceneMarks(chapter.scenes, columnOf),
			});
		}
	});
	for (const lane of lanes.values()) lane.rows = stack(lane.cards);

	// Lanes in the order they first appear in the book; the empty one last.
	const ordered = [...lanes.values()].sort((a, b) => {
		if (a.key === NO_LANE) return 1;
		if (b.key === NO_LANE) return -1;
		return Math.min(...a.cards.map((card) => card.number))
			- Math.min(...b.cards.map((card) => card.number));
	});
	return { columns, lanes: ordered, undated };
}

/** Day fields of a chapter after moving it, and its scenes when they have days. */
export interface ChapterDayChange {
	patch: Pick<ChapterInfo, 'story_day' | 'story_day_end'>;
	/** New scenes when some had a day; null when none changes. */
	scenes: ChapterScene[] | null;
}

function shift(day: number | null | undefined, delta: number): number | null | undefined {
	return typeof day === 'number' ? day + delta : day;
}

/**
 * Moves a chapter so it starts on `day`, keeping how long it lasts: its day,
 * its "to day" and its scenes' days all shift by the same amount. A chapter
 * with no day just gets this one.
 */
export function moveChapterToDay(chapter: Capitulo, day: number): ChapterDayChange {
	const range = chapterDayRange(chapter);
	if (!range) return { patch: { story_day: day }, scenes: null };
	const delta = day - range.start;
	const dated = (chapter.scenes ?? []).some((scene) => typeof scene.story_day === 'number');
	return {
		patch: {
			story_day: typeof chapter.story_day === 'number' ? chapter.story_day + delta : day,
			story_day_end: shift(chapter.story_day_end, delta) ?? null,
		},
		scenes: dated
			? (chapter.scenes ?? []).map((scene) => ({
				...scene,
				story_day: shift(scene.story_day, delta) ?? null,
			}))
			: null,
	};
}

/** Takes every day off a chapter and its scenes (dropped on "Undated"). */
export function clearChapterDays(chapter: Capitulo): ChapterDayChange {
	const dated = (chapter.scenes ?? []).some((scene) => typeof scene.story_day === 'number');
	return {
		patch: { story_day: null, story_day_end: null },
		scenes: dated
			? (chapter.scenes ?? []).map((scene) => ({ ...scene, story_day: null }))
			: null,
	};
}
