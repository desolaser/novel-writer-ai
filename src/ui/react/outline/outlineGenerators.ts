import type { App } from "obsidian";
import type { Acto, Capitulo } from "../../../domain";
import type { PluginSettings } from "../../../infrastructure/settings/plugin-settings";
import type { NovelBlueprint } from "../../../domain/entities/NovelBlueprint";
import { buildScenePrompt, type ScenePromptMeta } from "../../../context/promptBuilder";
import { trimToCompleteSentence, wasCutMidSentence } from "../../../utils/draftEnding";
import type { DraftLength } from "../../../utils/draftLength";
import { summaryLanguageRule } from "../../../context/blueprintPrompt";
import type { CompletionOptions } from "../../../utils/provider-options";
import { chapterOutputBudget } from "../../../utils/chapterOutputBudget";
import { DRAFT_SCENE_BREAK } from "../../../utils/sceneSections";

/** Helpers puros del outline: sin React, sin Obsidian, sin efectos. */

/** Devuelve los capítulos en el orden narrativo (actos, luego orden interno). */
export function orderedChapters(actos: Acto[], capitulos: Capitulo[]): Capitulo[] {
	return actos.flatMap((acto) =>
		capitulos.filter((c) => c.id_acto === acto.id_acto)
	);
}

/**
 * Prompt de resumen de un capítulo ya escrito (generación de outline).
 * La regla de idioma va al final, después del manuscrito: ver
 * `summaryLanguageRule`.
 */
export function buildOutlinePrompt(
	chapter: Capitulo,
	manuscript: string,
	blueprint: NovelBlueprint | null,
): string {
	const parts: string[] = [];
	parts.push(
		'Summarize the following chapter in ONE SINGLE short PARAGRAPH, '
		+ 'about 80 to 120 words. Prioritize a complete and finished response; '
		+ 'do not cut it off in the middle of a sentence. Write a brief narrative '
		+ 'summary in continuous prose. Do not use line breaks, bullets, numbered '
		+ 'lists, dashes, headings, labels, Markdown formatting, or presentation '
		+ 'structure. Mention only the essential events in order, the important '
		+ 'changes to the characters, and the final state of the plot. Do not '
		+ 'invent information, do not write the chapter, and return only that '
		+ 'single paragraph, without any introduction or additional comments.'
	);
	parts.push('');
	parts.push(`Chapter title: ${chapter.nombre}`);
	parts.push('');
	parts.push('--- CHAPTER TEXT ---');
	parts.push(manuscript);
	parts.push('--- END CHAPTER TEXT ---');
	parts.push('');
	parts.push(summaryLanguageRule(blueprint, 'the summary', 'the chapter text'));
	return parts.join('\n');
}

/**
 * Regla de idioma del outline "por memoria". Sin idioma explícito toma el de
 * los capítulos previos; si no hay, el de la descripción de la story bible
 * (que ya trae su propia regla). Sin ninguno de los dos no hay a qué apuntar.
 */
function outlineByMemoryLanguageRule(
	previousOutlines: string,
	storyBible: string,
	blueprint: NovelBlueprint | null,
): string {
	if (blueprint?.language?.trim() || previousOutlines) {
		return summaryLanguageRule(blueprint, 'the outline', 'the previous chapters');
	}
	if (storyBible) {
		return summaryLanguageRule(
			blueprint, 'the outline', 'the description in the story bible'
		);
	}
	return '';
}

/** Prompt to generate an outline from previous chapters' outlines. */
export function buildOutlineByMemoryPrompt(
	chapter: Capitulo,
	previousOutlines: string,
	storyBible: string,
	blueprint: NovelBlueprint | null,
): string {
	const parts: string[] = [];
	parts.push('You are helping an author outline a novel, chapter by chapter.');
	parts.push('Write only outlines. Never write the prose of the chapter itself.');
	parts.push('');
	if (storyBible) {
		parts.push(storyBible);
		parts.push('');
	}
	if (previousOutlines) {
		parts.push('--- PREVIOUS CHAPTERS ---');
		parts.push(previousOutlines);
		parts.push('--- END PREVIOUS CHAPTERS ---');
		parts.push('');
	}
	parts.push(`TASK: write the outline for the next chapter titled "${chapter.nombre}".`);
	parts.push('');
	parts.push('Rules:');
	parts.push('- One single paragraph, between 80 and 120 words.');
	parts.push('- Continuous prose: no bullets, no lists, no headings, no markdown, no dialogue.');
	parts.push('- Tell what happens, in order, and how it changes the characters or the plot.');
	parts.push('- Keep continuity with the previous chapters; do not repeat what already happened.');
	parts.push('- This is a suggestion for the author. Be creative but stay coherent with the story so far.');
	parts.push('- Prioritize a complete and finished response; do not cut it off in the middle of a sentence.');
	parts.push('- Return only the outline paragraph, without any introduction or additional comments.');
	const languageRule = outlineByMemoryLanguageRule(
		previousOutlines, storyBible, blueprint
	);
	if (languageRule) parts.push(`- ${languageRule}`);
	return parts.join('\n');
}

/**
 * Prompt del resumen de un acto completo, a partir de los outlines de sus
 * capítulos. Es el contexto que representa a los capítulos ya lejanos, así que
 * pide el arco del acto y no una lista de lo que pasa en cada capítulo.
 */
export function buildActSummaryPrompt(
	act: Acto,
	chapterOutlines: string,
	storyBible: string,
	blueprint: NovelBlueprint | null,
): string {
	const parts: string[] = [];
	parts.push('You are helping an author keep track of a long novel.');
	if (storyBible) {
		parts.push('');
		parts.push(storyBible);
	}
	parts.push('');
	parts.push(`--- CHAPTERS OF THE ACT "${act.nombre}" ---`);
	parts.push(chapterOutlines);
	parts.push('--- END CHAPTERS ---');
	parts.push('');
	parts.push(`TASK: summarize the act "${act.nombre}" as a whole.`);
	parts.push('');
	parts.push('Rules:');
	parts.push('- One single paragraph, between 120 and 180 words.');
	parts.push('- Continuous prose: no bullets, no lists, no headings, no markdown, no dialogue.');
	parts.push('- Tell the arc of the act: what changes between its beginning and its end.');
	parts.push('- Keep the facts a later chapter still needs: what the characters learned, what they decided, who died, what is left unresolved.');
	parts.push('- Do not summarize chapter by chapter, and do not invent anything that is not in the outlines.');
	parts.push('- Prioritize a complete and finished response; do not cut it off in the middle of a sentence.');
	parts.push('- Return only that paragraph, without any introduction or additional comments.');
	parts.push(
		`- ${summaryLanguageRule(blueprint, 'the summary', 'the chapter outlines above')}`
	);
	return parts.join('\n');
}

/** Detecta respuestas corruptas de la IA (tokens gigantes, basura de encoding). */
export function isCorruptGeneration(text: string): boolean {
	const compact = text.replace(/\s+/g, " ").trim();
	if (!compact) return false;
	const suspiciousToken = compact
		.split(" ")
		.some(
			(token) =>
				token.length > 140 &&
				((token.match(/[#:]/g)?.length ?? 0) > 4 ||
					(token.match(/[\uFFFD]/g)?.length ?? 0) > 0)
		);
	const replacementChars = (compact.match(/[\uFFFD]/g) ?? []).length;
	return (
		suspiciousToken ||
		replacementChars > 3 ||
		/(?:#u-hc|pí\d+Lm|u#u-hc)/i.test(compact)
	);
}

/** Normaliza el outline devuelto por la IA a un único párrafo compacto. */
export function normalizeOutline(text: string): string {
	return (text ?? "")
		.replace(/\s*\n+\s*/g, " ")
		.replace(/\s{2,}/g, " ")
		.trim();
}

/**
 * Wrapper de completado de draft con reintentos ante presupuestos de tokens
 * que el proveedor rechaza aunque el modelo los anuncie.
 */
export async function requestDraftCompletion(
	api: any,
	prompt: string,
	model: string,
	maxTokens: number,
	options: CompletionOptions
): Promise<{ text?: string }> {
	try {
		return await api.generateCompletion(prompt, model, {
			...options,
			max_tokens: maxTokens,
			stream: false,
		});
	} catch (error: any) {
		const message = String(error?.message ?? error).toLowerCase();
		if (
			!message.includes("internal server") &&
			!message.includes("max_tokens") &&
			!message.includes("context")
		)
			throw error;
		for (const fallback of [2048, 1024, 512]) {
			if (fallback >= maxTokens) continue;
			try {
				return await api.generateCompletion(prompt, model, {
					...options,
					max_tokens: fallback,
					stream: false,
				});
			} catch {
				/* prueba con el siguiente presupuesto seguro */
			}
		}
		throw error;
	}
}

/** Longest closing asked for when a draft was cut off past its target. */
const CLOSING_WORDS = 200;

function wordCount(text: string): number {
	return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Where a draft piece stands before its next request. */
export interface DraftStep {
	currentWords: number;
	remainingWords: number;
	/** It reached its length but was cut mid-sentence: only close it. */
	needsEnding: boolean;
}

/** Model and settings of one draft (a chapter or a scene). */
export interface DraftRequest {
	app: App;
	activeFolderPath: string;
	api: any;
	model: string;
	options: CompletionOptions;
	settings: PluginSettings;
	onCorrupt?: () => void;
}

/**
 * Asks for text until it reaches the minimum of `length` (or generation stalls
 * or corrupts). A request that hits the output limit stops mid-sentence: the
 * half sentence is cut back to the last complete one, and if the piece already
 * reached its length, one short request closes it instead of leaving it cut
 * off. `buildPrompt` gets the piece written so far.
 */
async function draftToLength(
	request: DraftRequest,
	length: DraftLength,
	buildPrompt: (text: string, step: DraftStep) => Promise<string>,
): Promise<string> {
	let text = "";
	let attempts = 0;
	let closed = false;
	let cutOff = false;
	while (attempts++ < 12) {
		const currentWords = wordCount(text);
		const needsLength = currentWords < length.min;
		const needsEnding = !needsLength && !closed && cutOff;
		if (!needsLength && !needsEnding) break;
		const remainingWords = Math.max(100, length.target - currentWords);
		const prompt = await buildPrompt(
			text, { currentWords, remainingWords, needsEnding },
		);
		const requestTokens = chapterOutputBudget(
			needsEnding ? CLOSING_WORDS : remainingWords
		);
		const result = await requestDraftCompletion(
			request.api, prompt, request.model, requestTokens, request.options
		);
		const addition = result.text ?? "";
		if (!addition.trim()) break;
		if (isCorruptGeneration(addition)) {
			request.onCorrupt?.();
			break;
		}
		if (needsEnding) closed = true;
		cutOff = wasCutMidSentence(addition);
		const kept = cutOff ? trimToCompleteSentence(addition) : addition;
		text += `${text ? "\n\n" : ""}${kept}`;
	}
	return text;
}

/**
 * Generates one chapter's draft text, retrying with the remaining word count
 * until the draft reaches the minimum of `length`. Any length inside the range
 * is fine; the model aims at its target and must not pass its maximum. Shared
 * by the batch ("generate all drafts") and single-chapter draft actions, which
 * only differ in how they word the "how much is left" instruction sent on each
 * retry — that wording is left to the caller via `buildLengthControl`.
 *
 * `meta` is the memory and author note of the chapter being drafted. Without
 * it the prompt falls back to the note open in the editor, which is the wrong
 * chapter whenever the draft is started from the outline or the chat.
 */
export async function generateChapterDraftText(
	request: DraftRequest,
	outline: string,
	length: DraftLength,
	buildLengthControl: (info: { currentWords: number; remainingWords: number }) => string,
	meta?: ScenePromptMeta,
): Promise<string> {
	// Validate before building prompts or making a paid request.
	chapterOutputBudget(length.target);
	return draftToLength(request, length, async (text, step) => {
		const control = step.needsEnding
			? `The draft was cut off before its ending. Do not add new events: write only `
				+ `the end of the current scene and close the chapter in at most ${CLOSING_WORDS} words.`
			: buildLengthControl(step);
		const scene = await buildScenePrompt(
			request.app, request.activeFolderPath, request.settings,
			outline, text, length, meta,
		);
		return `${scene}\n\n[Length control]\nThe current draft has ${step.currentWords} words; `
			+ `the chapter must end between ${length.min} and ${length.max} (about ${length.target}). `
			+ control;
	});
}

/** "How much is left" of one scene, for its length control. */
function sceneLengthControl(length: DraftLength, step: DraftStep): string {
	const status = `This scene has ${step.currentWords} words so far; it must `
		+ `end between ${length.min} and ${length.max} words (about ${length.target}). `;
	if (step.needsEnding) {
		return status + 'It was cut off before its ending. Do not add new events: '
			+ `write only the end of this scene in at most ${CLOSING_WORDS} words.`;
	}
	if (step.currentWords === 0) return status + 'Write the complete scene.';
	return status + `About ${step.remainingWords} words remain. Continue exactly `
		+ 'from the end of the scene without restarting it.';
}

/** What a scene follows: the earlier scenes and the break before it. */
function textBeforeScene(previous: string): string {
	return previous.trim() ? `${previous.trim()}\n\n${DRAFT_SCENE_BREAK}` : "";
}

/**
 * Generates one scene of a chapter. `previous` is the chapter text before it
 * (earlier scenes), which the model reads but doesn't rewrite; `sceneBlock` is
 * the plan and the scene to write (`sceneDraftBlock`). Returns only the scene.
 */
export async function generateSceneDraftText(
	request: DraftRequest,
	outline: string,
	previous: string,
	sceneBlock: string,
	length: DraftLength,
	meta?: ScenePromptMeta,
): Promise<string> {
	chapterOutputBudget(length.target);
	const before = textBeforeScene(previous);
	const sceneMeta: ScenePromptMeta | undefined = meta
		? { ...meta, scene: sceneBlock }
		: undefined;
	return draftToLength(request, length, async (text, step) => {
		const story = [before, text].filter(Boolean).join("\n\n");
		const prompt = await buildScenePrompt(
			request.app, request.activeFolderPath, request.settings,
			outline, story, undefined, sceneMeta ?? {
				memory: "", authorNote: "", scene: sceneBlock,
			},
		);
		return `${prompt}\n\n[Length control]\n${sceneLengthControl(length, step)}`;
	});
}
