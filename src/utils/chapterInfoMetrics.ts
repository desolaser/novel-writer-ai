import type { Capitulo, Categoria, EntradaCodex } from '../domain';
import type {
	ChapterGroupMetrics,
	ChapterInfoMetrics,
	ChapterMetrics,
} from '../types/NovelMetrics';
import { CHAPTER_STATUSES } from '../constants/chapterStatus';

/**
 * Chapters and words grouped by status and by point of view. Pure, like the
 * rest of Metrics. `ordered` and `measured` are the same chapters in reading
 * order: the first has the chapter info, the second the word counts.
 */

const NOT_SET_KEY = '';

function emptyGroup(key: string, name: string, color: string): ChapterGroupMetrics {
	return { key, name, color, chapters: 0, words: 0, lastChapter: null };
}

function addTo(group: ChapterGroupMetrics, chapter: ChapterMetrics): void {
	group.chapters += 1;
	group.words += chapter.words;
	group.lastChapter = chapter.number;
}

function statusGroups(
	ordered: Capitulo[],
	measured: ChapterMetrics[],
): ChapterGroupMetrics[] {
	const groups = CHAPTER_STATUSES.map((status) =>
		emptyGroup(status.id, status.label, status.color));
	const notSet = emptyGroup(NOT_SET_KEY, 'Not set', '');
	ordered.forEach((chapter, index) => {
		const group = groups.find((item) => item.key === chapter.status) ?? notSet;
		addTo(group, measured[index]);
	});
	return [...groups, notSet].filter((group) => group.chapters > 0);
}

function povGroups(
	ordered: Capitulo[],
	measured: ChapterMetrics[],
	entries: EntradaCodex[],
	categories: Categoria[],
): ChapterGroupMetrics[] {
	const groups = new Map<string, ChapterGroupMetrics>();
	const groupOf = (id: string | null | undefined): ChapterGroupMetrics => {
		const key = id ?? NOT_SET_KEY;
		const known = groups.get(key);
		if (known) return known;
		const entry = id
			? entries.find((item) => item.id_entrada_codex === id)
			: undefined;
		const category = categories.find((item) =>
			item.id_categoria === entry?.id_categoria);
		const name = !id ? 'No point of view' : entry?.nombre || '(deleted entry)';
		const created = emptyGroup(key, name, entry?.color || category?.color || '');
		groups.set(key, created);
		return created;
	};
	ordered.forEach((chapter, index) => {
		addTo(groupOf(chapter.pov_entry_id), measured[index]);
	});
	const named = [...groups.values()].filter((group) => group.key !== NOT_SET_KEY);
	// Without any point of view set the breakdown says nothing.
	if (!named.length) return [];
	named.sort((first, second) =>
		second.chapters - first.chapters || second.words - first.words);
	const unset = groups.get(NOT_SET_KEY);
	return unset ? [...named, unset] : named;
}

export function chapterInfoMetrics(
	ordered: Capitulo[],
	measured: ChapterMetrics[],
	entries: EntradaCodex[],
	categories: Categoria[],
): ChapterInfoMetrics {
	const anyStatus = ordered.some((chapter) => Boolean(chapter.status));
	return {
		byStatus: anyStatus ? statusGroups(ordered, measured) : [],
		byPointOfView: povGroups(ordered, measured, entries, categories),
	};
}
