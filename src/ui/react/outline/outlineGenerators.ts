import type { App } from "obsidian";
import type { Acto, Capitulo } from "../../../domain";
import type { PluginSettings } from "../../../infrastructure/settings/plugin-settings";
import type { NovelBlueprint } from "../../../domain/entities/NovelBlueprint";
import { buildScenePrompt } from "../../../context/promptBuilder";

/** Helpers puros del outline: sin React, sin Obsidian, sin efectos. */

/** Devuelve los capítulos en el orden narrativo (actos, luego orden interno). */
export function orderedChapters(actos: Acto[], capitulos: Capitulo[]): Capitulo[] {
	return actos.flatMap((acto) =>
		capitulos.filter((c) => c.id_acto === acto.id_acto)
	);
}

/** Prompt de resumen de un capítulo ya escrito (generación de outline). */
export function buildOutlinePrompt(chapter: Capitulo, manuscript: string): string {
	return `Summarize the following chapter in ONE SINGLE short PARAGRAPH, about 80 to 120 words. Prioritize a complete and finished response; do not cut it off in the middle of a sentence. Write a brief narrative summary in continuous prose. Do not use line breaks, bullets, numbered lists, dashes, headings, labels, Markdown formatting, or presentation structure. Mention only the essential events in order, the important changes to the characters, and the final state of the plot. Do not invent information, do not write the chapter, and return only that single paragraph, without any introduction or additional comments.\n\nChapter title: ${chapter.nombre}\n\nChapter text:\n${manuscript}`;
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
	if (!storyBible && blueprint?.language?.trim()) {
		parts.push(`- Write the outline in ${blueprint.language.trim()}, regardless of the language of these instructions.`);
	}
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
	if (!storyBible && blueprint?.language?.trim()) {
		parts.push(`- Write the summary in ${blueprint.language.trim()}, regardless of the language of these instructions.`);
	}
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
	temperature: number,
	topP?: number
): Promise<{ text?: string }> {
	try {
		return await api.generateCompletion(prompt, model, {
			max_tokens: maxTokens,
			temperature,
			top_p: topP,
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
					max_tokens: fallback,
					temperature,
					top_p: topP,
					stream: false,
				});
			} catch {
				/* prueba con el siguiente presupuesto seguro */
			}
		}
		throw error;
	}
}

/**
 * Generates one chapter's draft text, retrying with the remaining word count
 * until the target length is reached (or generation stalls/corrupts). Shared by
 * the batch ("generate all drafts") and single-chapter draft actions, which only
 * differ in how they word the "how much is left" instruction sent on each retry —
 * that wording is left to the caller via `buildLengthControl` so neither prompt's
 * exact phrasing changes.
 */
export async function generateChapterDraftText(
	app: App,
	activeFolderPath: string,
	api: any,
	model: string,
	temperature: number,
	topP: number | undefined,
	settings: PluginSettings,
	outline: string,
	targetWords: number,
	buildLengthControl: (info: { currentWords: number; remainingWords: number }) => string,
	onCorrupt?: () => void,
): Promise<string> {
	let text = "";
	let attempts = 0;
	while (attempts++ < 12 && text.trim().split(/\s+/).filter(Boolean).length < targetWords * 0.95) {
		const currentWords = text.trim().split(/\s+/).filter(Boolean).length;
		const remainingWords = Math.max(100, targetWords - currentWords);
		const scene = await buildScenePrompt(app, activeFolderPath, settings, outline, text, targetWords);
		const prompt = `${scene}\n\n[Length control]\nThe current draft has ${currentWords} words and the target is ${targetWords}. ${buildLengthControl({ currentWords, remainingWords })}`;
		const requestTokens = Math.max(512, Math.min(Math.ceil(remainingWords * 1.5) + 200, 8192));
		const result = await requestDraftCompletion(api, prompt, model, requestTokens, temperature, topP);
		const addition = result.text ?? "";
		if (!addition.trim()) break;
		if (isCorruptGeneration(addition)) {
			onCorrupt?.();
			break;
		}
		text += `${text ? "\n\n" : ""}${addition}`;
	}
	return text;
}
