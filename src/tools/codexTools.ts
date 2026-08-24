import { TipoDetalle } from '../domain';
import type { EntradaCodex } from '../domain';
import type { ToolContext } from '../interfaces/tool-context';
import { findFallbackCategory } from '../utils/categories';
import { normalizeForMatch } from '../utils/codexAiParsing';
import { resolveByName } from '../utils/toolCallParsing';

/**
 * Codex tools. `EntradaCodex.notas` is private to the author and is never part of
 * any output here, the same rule the rest of the plugin follows.
 */

const activeEntries = (context: ToolContext) => context.listCodexEntries().filter((entry) => !entry.archivado);

const summarize = (text: string, max = 140) => {
	const clean = (text || '').replace(/\s+/g, ' ').trim();
	return clean.length > max ? `${clean.slice(0, max)}...` : clean;
};

/** Resolves an entry reference against names first, then aliases. */
function resolveEntry(reference: string, context: ToolContext): EntradaCodex {
	const entries = activeEntries(context);
	const direct = resolveByName(reference, entries, (entry) => entry.nombre, (entry) => entry.id_entrada_codex);
	if (direct) return direct;
	const needle = normalizeForMatch(reference);
	const byAlias = entries.find((entry) => (entry.alias ?? '')
		.split(',')
		.map((alias) => normalizeForMatch(alias))
		.filter(Boolean)
		.includes(needle));
	if (byAlias) return byAlias;
	throw new Error(`No codex entry matches "${reference}". Use list_codex to see what exists.`);
}

export async function listCodex(args: Record<string, string>, context: ToolContext): Promise<string> {
	const categories = context.listCategories();
	let entries = activeEntries(context);

	if (args.category?.trim()) {
		const category = resolveByName(args.category, categories, (item) => item.nombre, (item) => item.id_categoria);
		if (!category) {
			throw new Error(`No category named "${args.category}". Available: ${categories.map((item) => item.nombre).join(', ')}.`);
		}
		entries = entries.filter((entry) => entry.id_categoria === category.id_categoria);
	}
	if (args.query?.trim()) {
		const needle = normalizeForMatch(args.query);
		entries = entries.filter((entry) =>
			normalizeForMatch(`${entry.nombre} ${entry.alias ?? ''} ${entry.descripcion ?? ''}`).includes(needle));
	}
	if (!entries.length) return 'No codex entries match.';

	return entries.map((entry) => {
		const category = categories.find((item) => item.id_categoria === entry.id_categoria)?.nombre ?? 'Uncategorized';
		const description = summarize(entry.descripcion);
		return `${entry.nombre} (${category})${description ? `: ${description}` : ''}`;
	}).join('\n');
}

export async function readCodexEntry(args: Record<string, string>, context: ToolContext): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	const category = context.listCategories().find((item) => item.id_categoria === entry.id_categoria)?.nombre ?? 'Uncategorized';
	const definitions = context.listDetalles();

	const lines: string[] = [`Name: ${entry.nombre}`, `Category: ${category}`];
	if (entry.alias?.trim()) lines.push(`Aliases: ${entry.alias.trim()}`);
	if (entry.descripcion?.trim()) lines.push(`Description: ${entry.descripcion.trim()}`);

	for (const value of entry.detalles ?? []) {
		const definition = definitions.find((item) => item.id_detalle === value.id_detalle);
		if (!definition || value.valor == null || !String(value.valor).trim()) continue;
		let readable = String(value.valor);
		if (definition.tipo_detalle === TipoDetalle.Dropdown) {
			const options = await context.listOptions(definition.id_detalle);
			readable = options.find((option) => option.id_opcion_detalle === value.valor)?.nombre ?? readable;
		} else if (definition.tipo_detalle === TipoDetalle.CodexRef) {
			readable = context.listCodexEntries().find((item) => item.id_entrada_codex === value.valor)?.nombre ?? readable;
		}
		lines.push(`${definition.nombre}: ${readable}`);
	}
	return lines.join('\n');
}

export async function createCodexEntry(args: Record<string, string>, context: ToolContext): Promise<string> {
	const name = (args.name ?? '').trim();
	if (!name) throw new Error('Argument "name" is required.');

	const categories = context.listCategories();
	const category = (args.category?.trim()
		? resolveByName(args.category, categories, (item) => item.nombre, (item) => item.id_categoria)
		: null) ?? findFallbackCategory(categories);
	if (!category) throw new Error('The novel has no categories to place the entry in.');

	const existing = activeEntries(context).find((entry) => normalizeForMatch(entry.nombre) === normalizeForMatch(name));
	if (existing) throw new Error(`A codex entry named "${existing.nombre}" already exists. Read it instead of creating a duplicate.`);

	const created = await context.createCodexEntry(category.id_categoria, name);
	if (!created) throw new Error('The entry could not be created.');

	const alias = args.aliases?.trim() ?? '';
	const descripcion = args.description?.trim() ?? '';
	if (alias || descripcion) {
		await context.updateCodexEntry({ ...created, alias: alias || created.alias, descripcion: descripcion || created.descripcion });
	}
	return `Created codex entry "${name}" in ${category.nombre}.`;
}

export async function updateCodexEntry(args: Record<string, string>, context: ToolContext): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	const append = (args.mode ?? 'replace').trim().toLowerCase() === 'append';
	const description = args.description?.trim() ?? '';
	const aliases = args.aliases?.trim() ?? '';
	if (!description && !aliases) throw new Error('Nothing to update: pass description and/or aliases.');

	const updated = { ...entry };
	const changed: string[] = [];
	if (description) {
		const current = entry.descripcion?.trim() ?? '';
		updated.descripcion = append && current ? `${current}\n\n${description}` : description;
		changed.push('description');
	}
	if (aliases) {
		const current = entry.alias?.trim() ?? '';
		updated.alias = append && current ? `${current}, ${aliases}` : aliases;
		changed.push('aliases');
	}
	await context.updateCodexEntry(updated);
	return `${append ? 'Extended' : 'Replaced'} the ${changed.join(' and ')} of "${entry.nombre}".`;
}
