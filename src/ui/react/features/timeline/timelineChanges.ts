import { Notice } from "obsidian";
import type { Capitulo } from "../../../../domain";
import {
	clearChapterDays,
	moveChapterToDay,
	type ChapterDayChange,
} from "../../../../utils/storyTimeline";
import { useNovelWriter } from "../../store/novelWriterStore";

/** Drag payload type of a chapter card; other drags never move a chapter. */
export const TIMELINE_CHAPTER_DRAG = "application/x-nw-timeline-chapter";

function chapterById(id: string): Capitulo | undefined {
	return useNovelWriter.getState().capitulos.find((item) => item.id_capitulo === id);
}

/**
 * Saves a day change: the chapter's fields, then its scenes' days computed
 * again against the scenes as they are now (`changeChapterScenes`).
 */
async function apply(
	id: string,
	change: (chapter: Capitulo) => ChapterDayChange,
): Promise<void> {
	const chapter = chapterById(id);
	if (!chapter) return;
	const state = useNovelWriter.getState();
	try {
		const first = change(chapter);
		await state.updateCapitulo(id, first.patch);
		if (first.scenes) {
			await state.changeChapterScenes(id, (scenes) =>
				change({ ...chapter, scenes }).scenes ?? scenes);
		}
	} catch (error: any) {
		new Notice(`Could not move the chapter: ${error?.message ?? error}`);
	}
}

/** Moves a chapter to start on `day`, keeping how long it lasts. */
export function moveChapter(id: string, day: number): Promise<void> {
	return apply(id, (chapter) => moveChapterToDay(chapter, day));
}

/** Takes every day off a chapter and its scenes. */
export function clearChapter(id: string): Promise<void> {
	return apply(id, (chapter) => clearChapterDays(chapter));
}
