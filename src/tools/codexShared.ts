import { AiContextPolicy, TipoDetalle } from '../domain';
import type { Detalle, DetalleValorEmbed, EntradaCodex } from '../domain';
import type { CodexToolContext } from '../interfaces/tool-context';
import { normalizeForMatch } from '../utils/codexAiParsing';
import { resolveByName } from '../utils/toolCallParsing';

/**
 * Codex rules every tool shares. What the author keeps from the AI stays hidden
 * here, the same as in prompts:
 * - `EntradaCodex.notas` never appears in any output;
 * - an entry with the "Never" AI policy does not exist for the tools;
 * - a detail with `incluir_ia` off is neither shown nor written.
 */

/** Entries the AI may see: not archived and not marked "Never". */
export function visibleEntries(context: CodexToolContext): EntradaCodex[] {
	return context.listCodexEntries().filter((entry) =>
		!entry.archivado && entry.ai_context_policy !== AiContextPolicy.Never);
}

/** Whether a detail definition may reach the AI. */
export function isDetailVisible(definition: Detalle): boolean {
	return definition.incluir_ia !== false;
}

export function summarize(text: string, max = 140): string {
	const clean = (text || '').replace(/\s+/g, ' ').trim();
	return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

export function categoryName(context: CodexToolContext, idCategoria: string): string {
	const category = context.listCategories().find((item) => item.id_categoria === idCategoria);
	return category?.nombre ?? 'Uncategorized';
}

function aliasesOf(entry: EntradaCodex): string[] {
	return (entry.alias ?? '')
		.split(',')
		.map((alias) => normalizeForMatch(alias))
		.filter(Boolean);
}

/** Resolves an entry reference against names first, then aliases. */
export function resolveEntry(reference: string, context: CodexToolContext): EntradaCodex {
	const entries = visibleEntries(context);
	const direct = resolveByName(
		reference,
		entries,
		(entry) => entry.nombre,
		(entry) => entry.id_entrada_codex,
	);
	if (direct) return direct;
	const needle = normalizeForMatch(reference);
	const byAlias = entries.find((entry) => aliasesOf(entry).includes(needle));
	if (byAlias) return byAlias;
	throw new Error(`No codex entry matches "${reference}". Use list_codex to see what exists.`);
}

/**
 * Readable form of a stored detail value: option and entry ids become names.
 * Returns null when the value is empty or points at something the AI may not see.
 */
export async function readableDetailValue(
	value: DetalleValorEmbed,
	definition: Detalle,
	context: CodexToolContext,
): Promise<string | null> {
	if (value.valor == null || !String(value.valor).trim()) return null;
	const raw = String(value.valor);
	if (definition.tipo_detalle === TipoDetalle.Dropdown) {
		const options = await context.listOptions(definition.id_detalle);
		return options.find((option) => option.id_opcion_detalle === raw)?.nombre ?? raw;
	}
	if (definition.tipo_detalle === TipoDetalle.CodexRef) {
		const target = visibleEntries(context).find((entry) => entry.id_entrada_codex === raw);
		return target?.nombre ?? null;
	}
	return raw;
}

/** Splits a comma-separated list, trimming and dropping empty items. */
export function splitList(value: string): string[] {
	return value
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);
}
