import { AiContextPolicy } from '../domain';
import type {
	Capitulo,
	ChapterScene,
	EntradaCodex,
	NovelBlueprint,
} from '../domain';
import { linkedEntryName } from '../utils/chapterInfo';
import { createScene, sceneLabel } from '../utils/chapterScenes';
import { summaryLanguageRule } from './blueprintPrompt';

/**
 * Scene text for prompts. A scene's point of view and setting go through
 * `linkedEntryName(..., forAi)`, so an entry hidden from the AI is never named.
 */

/** Point of view, setting, goal, conflict and outcome that are set. */
function sceneFacts(scene: ChapterScene, entries: EntradaCodex[]): string[] {
	const facts: string[] = [];
	const pov = linkedEntryName(scene.pov_entry_id, entries, true);
	if (pov) facts.push(`Point of view: ${pov}.`);
	const setting = linkedEntryName(scene.location_entry_id, entries, true);
	if (setting) facts.push(`Setting: ${setting}.`);
	if (typeof scene.story_day === 'number') facts.push(`Story day: ${scene.story_day}.`);
	if (scene.goal?.trim()) facts.push(`Goal: ${scene.goal.trim()}`);
	if (scene.conflict?.trim()) facts.push(`Conflict: ${scene.conflict.trim()}`);
	if (scene.outcome?.trim()) facts.push(`Outcome: ${scene.outcome.trim()}`);
	return facts;
}

function planLines(scenes: ChapterScene[]): string[] {
	return scenes.map((scene, index) => {
		const label = sceneLabel(scene, index);
		const summary = scene.summary.trim();
		return summary
			? `${index + 1}. ${label}: ${summary}`
			: `${index + 1}. ${label}`;
	});
}

function sceneDetail(
	scene: ChapterScene,
	entries: EntradaCodex[],
): string[] {
	const lines: string[] = [];
	if (scene.summary.trim()) lines.push(`What happens: ${scene.summary.trim()}`);
	const facts = sceneFacts(scene, entries);
	if (facts.length) lines.push(facts.join(' '));
	return lines;
}

function sceneEndingRule(index: number, count: number): string {
	const rules = [
		'Write only this scene and stop when it ends. Do not begin the next '
		+ 'scene, and do not write a scene break, a heading or a title.',
	];
	if (index > 0) {
		rules.push('The earlier scenes are already written above; do not '
			+ 'repeat or summarize them.');
	}
	rules.push(index === count - 1
		? 'It is the last scene: close the chapter.'
		: 'End it where the next scene can pick up.');
	return rules.join(' ');
}

/**
 * What a draft request for one scene adds to the prompt: the chapter's scene
 * plan, the scene to write now and where to stop.
 */
export function sceneDraftBlock(
	chapter: Capitulo,
	index: number,
	entries: EntradaCodex[],
): string {
	const scenes = chapter.scenes ?? [];
	const scene = scenes[index];
	if (!scene) return '';
	const lines = [
		'Scene plan of this chapter:',
		...planLines(scenes),
		'',
		`Now write scene ${index + 1} of ${scenes.length}, `
			+ `"${sceneLabel(scene, index)}".`,
		...sceneDetail(scene, entries),
		sceneEndingRule(index, scenes.length),
	];
	return lines.join('\n');
}

/**
 * What "Generate text" adds when the chapter has scenes: the plan and the
 * scene the cursor is in. Empty when the cursor is past the last scene.
 */
export function sceneEditorBlock(
	chapter: Capitulo,
	index: number,
	entries: EntradaCodex[],
): string {
	const scenes = chapter.scenes ?? [];
	const scene = scenes[index];
	if (!scene) return '';
	return [
		'Scene plan of this chapter:',
		...planLines(scenes),
		`The text at the cursor is in scene ${index + 1} of ${scenes.length}, `
			+ `"${sceneLabel(scene, index)}".`,
		...sceneDetail(scene, entries),
	].join('\n');
}

export interface SplitScenesInput {
	chapter: Capitulo;
	/** `chapterInfoPromptLine` of the chapter, or "". */
	chapterInfo: string;
	/** What happened before (`buildChapterHistory`). */
	history: string;
	storyBible: string;
	blueprint: NovelBlueprint | null;
}

/** Asks for the chapter outline broken into scenes, as JSON. */
export function buildSplitScenesPrompt(input: SplitScenesInput): string {
	const { chapter } = input;
	const parts: string[] = [
		'You are helping an author plan a novel chapter scene by scene.',
		'Write only the plan. Never write the prose of the chapter.',
		'',
	];
	if (input.storyBible) parts.push(input.storyBible, '');
	if (input.history) {
		parts.push('--- PREVIOUS CHAPTERS ---', input.history,
			'--- END PREVIOUS CHAPTERS ---', '');
	}
	parts.push(`Chapter: ${chapter.nombre}`);
	if (input.chapterInfo) parts.push(input.chapterInfo);
	parts.push(`Chapter outline: ${chapter.outline.trim()}`, '');
	parts.push(
		'TASK: break this chapter into its scenes, in order. A scene is one '
			+ 'continuous stretch of action in one place and time.',
		'',
		'Rules:',
		'- Between 2 and 6 scenes. Use only what the outline implies; do not '
			+ 'add events it does not need.',
		'- "title": a few words. "summary": what happens, 1 to 3 sentences.',
		'- "goal": what the point-of-view character wants in the scene. '
			+ '"conflict": what stands in the way. "outcome": how it ends, or '
			+ 'the hook into the next scene. One sentence each.',
		'- "pov" and "setting": only when they differ from the chapter\'s, '
			+ 'using the exact name of a codex entry; otherwise "".',
		'- Return only a JSON array, without any comment or Markdown fence:',
		'[{"title": "", "summary": "", "goal": "", "conflict": "", '
			+ '"outcome": "", "pov": "", "setting": ""}]',
		`- ${summaryLanguageRule(
			input.blueprint, 'the titles and texts', 'the chapter outline',
		)}`,
	);
	return parts.join('\n');
}

function normalizeName(value: string): string {
	return value
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.trim()
		.toLowerCase();
}

/** An entry the AI may see whose name or alias is `name`. */
function visibleEntryNamed(
	name: unknown,
	entries: EntradaCodex[],
): string | null {
	if (typeof name !== 'string' || !name.trim()) return null;
	const wanted = normalizeName(name);
	const match = entries.find((entry) => {
		if (entry.archivado) return false;
		if (entry.ai_context_policy === AiContextPolicy.Never) return false;
		const names = [entry.nombre, ...(entry.alias ?? '').split(',')];
		return names.some((item) => normalizeName(item) === wanted);
	});
	return match?.id_entrada_codex ?? null;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** The JSON array in a model's answer, tolerating fences and chatter. */
function extractArray(answer: string): unknown[] {
	const start = answer.indexOf('[');
	const end = answer.lastIndexOf(']');
	if (start < 0 || end <= start) {
		throw new Error('The AI did not return a list of scenes.');
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(answer.slice(start, end + 1));
	} catch {
		throw new Error('The AI returned a scene list that could not be read.');
	}
	if (!Array.isArray(parsed)) {
		throw new Error('The AI did not return a list of scenes.');
	}
	return parsed;
}

/**
 * Scenes from the model's answer. A point of view or setting equal to the
 * chapter's is left empty (it inherits); an unknown name is dropped.
 */
export function parseScenesResponse(
	answer: string,
	chapter: Capitulo,
	entries: EntradaCodex[],
): ChapterScene[] {
	const scenes = extractArray(answer)
		.filter((item): item is Record<string, unknown> =>
			Boolean(item) && typeof item === 'object')
		.map((item) => {
			const pov = visibleEntryNamed(item.pov, entries);
			const setting = visibleEntryNamed(item.setting, entries);
			return createScene({
				title: text(item.title),
				summary: text(item.summary),
				goal: text(item.goal) || undefined,
				conflict: text(item.conflict) || undefined,
				outcome: text(item.outcome) || undefined,
				pov_entry_id: pov && pov !== chapter.pov_entry_id ? pov : undefined,
				location_entry_id: setting && setting !== chapter.location_entry_id
					? setting
					: undefined,
			});
		})
		.filter((scene) => scene.title || scene.summary);
	if (!scenes.length) throw new Error('The AI returned no scenes.');
	return scenes;
}
