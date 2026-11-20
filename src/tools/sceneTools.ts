import type { Capitulo, ChapterScene, EntityId } from '../domain';
import type {
	ChapterToolContext,
	CodexToolContext,
	SceneToolContext,
} from '../interfaces/tool-context';
import { linkedEntryName, parseStoryDay } from '../utils/chapterInfo';
import {
	createScene,
	insertScene,
	moveScene,
	parseSceneWords,
	patchScene,
	removeScene,
	sceneLabel,
} from '../utils/chapterScenes';
import { resolveChapter } from './chapterTools';
import { resolveEntry, visibleEntries } from './codexShared';

/**
 * Scene plan tools. Scenes break a chapter's outline down; the draft
 * generators write one scene at a time when a chapter has them. Point of view
 * and setting are codex entries: one hidden from the AI is neither shown nor
 * accepted.
 */

type SceneContext = ChapterToolContext & CodexToolContext & SceneToolContext;

function isClear(value: string): boolean {
	const clean = value.trim().toLowerCase();
	return clean === 'none' || clean === '-';
}

function given(args: Record<string, string>, name: string): string | null {
	const value = args[name];
	if (value === undefined || !value.trim()) return null;
	return value;
}

function entryArg(value: string, context: CodexToolContext): EntityId | null {
	if (isClear(value)) return null;
	return resolveEntry(value, context).id_entrada_codex;
}

function textArg(value: string): string {
	return isClear(value) ? '' : value.trim();
}

/** One scene as the model reads it. */
export function describeScene(
	scene: ChapterScene,
	index: number,
	context: CodexToolContext,
): string {
	const entries = visibleEntries(context);
	const facts: string[] = [];
	const pov = linkedEntryName(scene.pov_entry_id, entries, true);
	if (pov) facts.push(`pov: ${pov}`);
	const setting = linkedEntryName(scene.location_entry_id, entries, true);
	if (setting) facts.push(`setting: ${setting}`);
	if (scene.goal) facts.push(`goal: ${scene.goal}`);
	if (scene.conflict) facts.push(`conflict: ${scene.conflict}`);
	if (scene.outcome) facts.push(`outcome: ${scene.outcome}`);
	if (typeof scene.story_day === 'number') facts.push(`day: ${scene.story_day}`);
	if (scene.target_words) facts.push(`words: ${scene.target_words}`);
	const head = `${index + 1}. ${sceneLabel(scene, index)}`;
	const summary = scene.summary ? ` — ${scene.summary}` : '';
	const detail = facts.length ? `\n   ${facts.join(' | ')}` : '';
	return `${head}${summary}${detail}`;
}

/** The scene plan of a chapter, or "" without scenes. */
export function describeScenes(chapter: Capitulo, context: CodexToolContext): string {
	const scenes = chapter.scenes ?? [];
	if (!scenes.length) return '';
	const lines = scenes.map((scene, index) => describeScene(scene, index, context));
	return `Scenes:\n${lines.join('\n')}`;
}

/** Resolves a 1-based scene number of the chapter. */
function sceneAt(chapter: Capitulo, value: string): ChapterScene {
	const scenes = chapter.scenes ?? [];
	const number = Number(value.trim().replace(/^#/, ''));
	if (!Number.isInteger(number) || number < 1 || number > scenes.length) {
		throw new Error(`"${chapter.nombre}" has ${scenes.length} scene(s); `
			+ `there is no scene "${value}".`);
	}
	return scenes[number - 1];
}

function buildPatch(
	args: Record<string, string>,
	context: CodexToolContext,
): Partial<ChapterScene> {
	const patch: Partial<ChapterScene> = {};
	for (const key of ['title', 'summary', 'goal', 'conflict', 'outcome'] as const) {
		const value = given(args, key);
		if (value !== null) patch[key] = textArg(value);
	}
	const pov = given(args, 'pov');
	if (pov !== null) patch.pov_entry_id = entryArg(pov, context);
	const setting = given(args, 'setting');
	if (setting !== null) patch.location_entry_id = entryArg(setting, context);
	const words = given(args, 'words');
	if (words !== null) patch.target_words = parseSceneWords(words);
	const day = given(args, 'day');
	if (day !== null) patch.story_day = parseStoryDay(day);
	return patch;
}

function positionArg(value: string | null): number | undefined {
	if (value === null) return undefined;
	const number = Number(value.trim());
	if (!Number.isInteger(number) || number < 1) {
		throw new Error(`Position must be a whole number from 1, got "${value}".`);
	}
	return number - 1;
}

/** Adds a scene (`scene` omitted or "new") or changes an existing one. */
export async function setScene(
	args: Record<string, string>,
	context: SceneContext,
): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const target = given(args, 'scene');
	const patch = buildPatch(args, context);
	const position = positionArg(given(args, 'position'));
	if (!target || target.trim().toLowerCase() === 'new') {
		if (!patch.title && !patch.summary) {
			throw new Error('A new scene needs a title or a summary.');
		}
		const scene = createScene(patch);
		const scenes = await context.changeChapterScenes(
			chapter.id_capitulo,
			(list) => insertScene(list, scene, position),
		);
		const index = scenes.findIndex((item) => item.id === scene.id);
		return `Added scene ${index + 1} to "${chapter.nombre}".\n`
			+ describeScene(scene, index, context);
	}
	const scene = sceneAt(chapter, target);
	if (!Object.keys(patch).length && position === undefined) {
		throw new Error('Nothing to update: pass title, summary, pov, setting, '
			+ 'goal, conflict, outcome, day, words and/or position.');
	}
	const scenes = await context.changeChapterScenes(chapter.id_capitulo, (list) => {
		const patched = patchScene(list, scene.id, patch);
		if (position === undefined) return patched;
		const from = patched.findIndex((item) => item.id === scene.id);
		const to = Math.min(position, patched.length - 1);
		return moveScene(patched, scene.id, to - from);
	});
	const index = scenes.findIndex((item) => item.id === scene.id);
	return `Updated scene ${index + 1} of "${chapter.nombre}".\n`
		+ describeScene(scenes[index], index, context);
}

export async function deleteScene(
	args: Record<string, string>,
	context: SceneContext,
): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const scene = sceneAt(chapter, args.scene ?? '');
	const index = (chapter.scenes ?? []).indexOf(scene);
	const scenes = await context.changeChapterScenes(
		chapter.id_capitulo,
		(list) => removeScene(list, scene.id),
	);
	return `Deleted scene ${index + 1} ("${sceneLabel(scene, index)}") of `
		+ `"${chapter.nombre}". It has ${scenes.length} scene(s) now; the `
		+ 'manuscript was not touched.';
}
