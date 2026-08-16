import type { Acto, Capitulo } from "../../../domain";

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
	return `Resume el siguiente capítulo en UN ÚNICO PÁRRAFO breve, de aproximadamente 80 a 120 palabras. Prioriza una respuesta completa y terminada; no la cortes a mitad de una oración. Escribe una síntesis narrativa breve en prosa continua. No uses saltos de línea, viñetas, listas numeradas, guiones, encabezados, etiquetas, formato Markdown ni estructura de presentación. Menciona solo los acontecimientos esenciales en orden, los cambios importantes de los personajes y el estado final de la trama. No inventes información, no escribas el capítulo y devuelve únicamente ese único párrafo, sin introducción ni comentarios adicionales.\n\nTítulo del capítulo: ${chapter.nombre}\n\nTexto del capítulo:\n${manuscript}`;
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
