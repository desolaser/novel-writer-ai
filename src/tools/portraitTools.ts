import type { EntradaCodex } from '../domain';
import type { CodexToolContext, PortraitToolContext } from '../interfaces/tool-context';
import {
	categoryName,
	isDetailVisible,
	readableDetailValue,
	resolveEntry,
} from './codexShared';

/**
 * Codex portraits drawn by the images model from Settings. The prompt is built
 * from what the AI may see of the entry: its description and visible details,
 * never its private notes, and entries set to Never cannot be found at all.
 */

type PortraitContext = CodexToolContext & PortraitToolContext;

/** Longest description sent to the image model. */
const DESCRIPTION_LIMIT = 1500;

async function visibleDetails(entry: EntradaCodex, context: CodexToolContext): Promise<string[]> {
	const lines: string[] = [];
	const definitions = context.listDetalles();
	for (const value of entry.detalles ?? []) {
		const definition = definitions.find((item) => item.id_detalle === value.id_detalle);
		if (!definition || !isDetailVisible(definition)) continue;
		const readable = await readableDetailValue(value, definition, context);
		if (readable !== null) lines.push(`${definition.nombre}: ${readable}`);
	}
	return lines;
}

/** Prompt for the image model. Exported for the tests. */
export async function buildPortraitPrompt(
	entry: EntradaCodex,
	style: string,
	context: CodexToolContext,
): Promise<string> {
	const description = (entry.descripcion ?? '').trim().slice(0, DESCRIPTION_LIMIT);
	const lines = [
		'Draw a single square (1:1) portrait image for a novel\'s codex. No text, '
			+ 'no captions, no borders, no watermark. Keep the subject centered.',
		`Subject: ${entry.nombre} (${categoryName(context, entry.id_categoria)})`,
	];
	if (description) lines.push(`Description: ${description}`);
	const details = await visibleDetails(entry, context);
	if (details.length) lines.push(`Details:\n${details.join('\n')}`);
	lines.push(style.trim()
		? `Style: ${style.trim()}`
		: 'Style: detailed digital illustration, consistent with the description.');
	return lines.join('\n\n');
}

export async function generatePortrait(
	args: Record<string, string>,
	context: PortraitContext,
): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	const prompt = await buildPortraitPrompt(entry, args.style ?? '', context);
	const { replaced } = await context.generatePortrait(entry.id_entrada_codex, prompt);
	const previous = replaced ? ' It replaced the previous portrait.' : '';
	return `Drew a portrait of "${entry.nombre}" and set it as the entry's image.${previous}`;
}
