import type { Acto, Capitulo } from "../../../domain";
import type { NovelBlueprint } from "../../../domain/entities/NovelBlueprint";

/** Helpers puros del outline: sin React, sin Obsidian, sin efectos. */

/** Devuelve los capítulos en el orden narrativo (actos, luego orden interno). */
export function orderedChapters(actos: Acto[], capitulos: Capitulo[]): Capitulo[] {
	return actos.flatMap((acto) =>
		capitulos.filter((c) => c.id_acto === acto.id_acto)
	);
}

/**
 * Construye la "memoria" acumulada de los capítulos anteriores a `chapter`.
 * Solo incluye capítulos que ya tienen outline redactado.
 */
export function buildChapterMemory(
	chapter: Capitulo,
	chapters: Capitulo[]
): string {
	const index = chapters.findIndex((c) => c.id_capitulo === chapter.id_capitulo);
	return chapters
		.slice(0, Math.max(0, index))
		.filter((c) => c.outline?.trim())
		.map((c) => `${c.nombre}:\n${c.outline.trim()}`)
		.join("\n\n===\n\n");
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

/** Limpia y recorta un texto para usarlo como contexto histórico. */
export function makeContextExcerpt(text: string): string {
	const clean = text.replace(/\s+/g, " ").trim();
	if (clean.length <= 700) return clean;
	const boundary = clean.slice(0, 700).lastIndexOf(". ");
	return `${clean.slice(0, boundary > 250 ? boundary + 1 : 700).trim()} …`;
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

/** Settings para drafts con el bloque de contexto generado por la IA removido. */
export function buildDraftSettings(settings: any): any {
	return {
		...settings,
		memoryContent: settings.memoryContent
			.replace(
				/\n?\[Novel Writer AI - Generated Story Context\][\s\S]*?\[End Novel Writer AI - Generated Story Context\]\n?/g,
				""
			)
			.trim(),
	};
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
