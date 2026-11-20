import type { ChapterScene } from '../domain';
import type { DraftLength } from './draftLength';
import { genId } from './ids';

/**
 * A chapter's scene list: pure operations the Outline and the chat tools
 * share. Every one returns a new list; none touches storage.
 */

/** Fewest words a scene is given when the chapter's length is shared out. */
const MIN_SCENE_WORDS = 150;

export function createScene(fields: Partial<ChapterScene> = {}): ChapterScene {
	return {
		...fields,
		id: fields.id ?? genId(),
		title: fields.title?.trim() ?? '',
		summary: fields.summary?.trim() ?? '',
	};
}

/** Inserts a scene at `position` (0-based), or at the end. */
export function insertScene(
	scenes: ChapterScene[],
	scene: ChapterScene,
	position?: number,
): ChapterScene[] {
	const next = [...scenes];
	const at = position === undefined
		? next.length
		: Math.max(0, Math.min(position, next.length));
	next.splice(at, 0, scene);
	return next;
}

export function patchScene(
	scenes: ChapterScene[],
	id: string,
	patch: Partial<ChapterScene>,
): ChapterScene[] {
	return scenes.map((scene) =>
		scene.id === id ? { ...scene, ...patch, id: scene.id } : scene);
}

export function removeScene(scenes: ChapterScene[], id: string): ChapterScene[] {
	return scenes.filter((scene) => scene.id !== id);
}

/** Moves a scene by `delta` places; a move past either end does nothing. */
export function moveScene(
	scenes: ChapterScene[],
	id: string,
	delta: number,
): ChapterScene[] {
	const from = scenes.findIndex((scene) => scene.id === id);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= scenes.length) return scenes;
	const next = [...scenes];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return next;
}

/**
 * Parses a scene's word target. Empty or "none" clears it (null); anything
 * that is not a positive whole number throws.
 */
export function parseSceneWords(value: string): number | null {
	const clean = value.trim().replace(/\s*words?$/i, '');
	if (!clean || clean.toLowerCase() === 'none') return null;
	const words = Number(clean);
	if (!Number.isInteger(words) || words <= 0) {
		throw new Error(`Scene words must be a positive whole number, got "${value}".`);
	}
	return words;
}

/** "Scene 2" when the scene has no title. */
export function sceneLabel(scene: ChapterScene, index: number): string {
	return scene.title.trim() || `Scene ${index + 1}`;
}

/** A length around `target`, with the same spread as the chapter's range. */
function scaledLength(target: number, chapter: DraftLength): DraftLength {
	const low = chapter.target ? chapter.min / chapter.target : 0.8;
	const high = chapter.target ? chapter.max / chapter.target : 1.2;
	return {
		min: Math.round(target * low),
		max: Math.round(target * high),
		target,
	};
}

/**
 * The length of each scene. A scene with its own word target keeps it; the
 * others share what is left of the chapter's target evenly.
 */
export function sceneLengths(
	scenes: ChapterScene[],
	chapter: DraftLength,
): DraftLength[] {
	const fixed = scenes.reduce(
		(sum, scene) => sum + (scene.target_words ?? 0), 0);
	const open = scenes.filter((scene) => !scene.target_words).length;
	const share = open
		? Math.max(MIN_SCENE_WORDS, Math.round((chapter.target - fixed) / open))
		: 0;
	return scenes.map((scene) =>
		scaledLength(scene.target_words ?? share, chapter));
}
