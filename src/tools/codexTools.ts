import { TipoDetalle } from '../domain';
import type { EntradaCodex } from '../domain';
import type { CodexToolContext as ToolContext } from '../interfaces/tool-context';
import { findFallbackCategory } from '../utils/categories';
import { normalizeForMatch } from '../utils/codexAiParsing';
import { resolveByName } from '../utils/toolCallParsing';
import {
	categoryName,
	isDetailVisible,
	readableDetailValue,
	resolveEntry,
	splitList,
	summarize,
	visibleEntries,
} from './codexShared';

/**
 * Codex entry tools: list, read, create, update and archive. Privacy rules live
 * in `codexShared.ts`; custom details are in `codexDetailTools.ts`.
 */

function resolveCategory(reference: string, context: ToolContext) {
	const categories = context.listCategories();
	const category = resolveByName(
		reference,
		categories,
		(item) => item.nombre,
		(item) => item.id_categoria,
	);
	if (!category) {
		const names = categories.map((item) => item.nombre).join(', ');
		throw new Error(`No category named "${reference}". Available: ${names}.`);
	}
	return category;
}

function tagNames(entry: EntradaCodex, context: ToolContext): string[] {
	const tags = context.listTags();
	return (entry.tags ?? [])
		.map((id) => tags.find((tag) => tag.id_tag === id)?.nombre)
		.filter((name): name is string => Boolean(name));
}

export async function listCodex(args: Record<string, string>, context: ToolContext): Promise<string> {
	let entries = visibleEntries(context);

	if (args.category?.trim()) {
		const category = resolveCategory(args.category, context);
		entries = entries.filter((entry) => entry.id_categoria === category.id_categoria);
	}
	if (args.query?.trim()) {
		const needle = normalizeForMatch(args.query);
		entries = entries.filter((entry) => {
			const haystack = `${entry.nombre} ${entry.alias ?? ''} ${entry.descripcion ?? ''}`;
			return normalizeForMatch(haystack).includes(needle);
		});
	}
	if (!entries.length) return 'No codex entries match.';

	return entries.map((entry) => {
		const category = categoryName(context, entry.id_categoria);
		const description = summarize(entry.descripcion);
		return `${entry.nombre} (${category})${description ? `: ${description}` : ''}`;
	}).join('\n');
}

/** Lines naming the entries whose codex-reference details point at `entry`. */
function referencedBy(entry: EntradaCodex, context: ToolContext): string[] {
	const definitions = context.listDetalles().filter((definition) =>
		definition.tipo_detalle === TipoDetalle.CodexRef && isDetailVisible(definition));
	const references: string[] = [];
	for (const other of visibleEntries(context)) {
		for (const value of other.detalles ?? []) {
			if (value.valor !== entry.id_entrada_codex) continue;
			const definition = definitions.find((item) => item.id_detalle === value.id_detalle);
			if (definition) references.push(`${other.nombre} (as ${definition.nombre})`);
		}
	}
	return references;
}

export async function readCodexEntry(args: Record<string, string>, context: ToolContext): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	const definitions = context.listDetalles();

	const lines: string[] = [
		`Name: ${entry.nombre}`,
		`Category: ${categoryName(context, entry.id_categoria)}`,
	];
	if (entry.alias?.trim()) lines.push(`Aliases: ${entry.alias.trim()}`);
	const tags = tagNames(entry, context);
	if (tags.length) lines.push(`Tags: ${tags.join(', ')}`);
	if (entry.descripcion?.trim()) lines.push(`Description: ${entry.descripcion.trim()}`);
	if (entry.first_message?.trim()) lines.push(`First message: ${entry.first_message.trim()}`);

	for (const value of entry.detalles ?? []) {
		const definition = definitions.find((item) => item.id_detalle === value.id_detalle);
		if (!definition || !isDetailVisible(definition)) continue;
		const readable = await readableDetailValue(value, definition, context);
		if (readable !== null) lines.push(`${definition.nombre}: ${readable}`);
	}

	const references = referencedBy(entry, context);
	if (references.length) lines.push(`Referenced by: ${references.join(', ')}`);
	return lines.join('\n');
}

export async function createCodexEntry(args: Record<string, string>, context: ToolContext): Promise<string> {
	const name = (args.name ?? '').trim();
	if (!name) throw new Error('Argument "name" is required.');

	const category = args.category?.trim()
		? resolveCategory(args.category, context)
		: findFallbackCategory(context.listCategories());
	if (!category) throw new Error('The novel has no categories to place the entry in.');

	// Checked against every live entry, hidden ones included, without revealing them.
	const needle = normalizeForMatch(name);
	const existing = context.listCodexEntries()
		.filter((entry) => !entry.archivado)
		.find((entry) => normalizeForMatch(entry.nombre) === needle);
	if (existing) {
		throw new Error(`A codex entry named "${existing.nombre}" already exists. `
			+ 'Read it instead of creating a duplicate.');
	}

	const created = await context.createCodexEntry(category.id_categoria, name);
	if (!created) throw new Error('The entry could not be created.');

	const alias = args.aliases?.trim() ?? '';
	const descripcion = args.description?.trim() ?? '';
	if (alias || descripcion) {
		await context.updateCodexEntry({
			...created,
			alias: alias || created.alias,
			descripcion: descripcion || created.descripcion,
		});
	}
	return `Created codex entry "${name}" in ${category.nombre}.`;
}

function joinText(current: string, addition: string, separator: string, append: boolean): string {
	const trimmed = current?.trim() ?? '';
	return append && trimmed ? `${trimmed}${separator}${addition}` : addition;
}

/** Replaces or extends the entry's tags, creating tags that do not exist yet. */
async function applyTags(
	entry: EntradaCodex,
	names: string[],
	append: boolean,
	context: ToolContext,
): Promise<void> {
	const ids = append ? [...(entry.tags ?? [])] : [];
	for (const name of names) {
		const tag = await context.findOrCreateTag(name);
		if (!ids.includes(tag.id_tag)) ids.push(tag.id_tag);
	}
	await context.setEntryTags(entry.id_entrada_codex, ids);
}

export async function updateCodexEntry(args: Record<string, string>, context: ToolContext): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	const append = (args.mode ?? 'replace').trim().toLowerCase() === 'append';
	const description = args.description?.trim() ?? '';
	const aliases = args.aliases?.trim() ?? '';
	const firstMessage = args.first_message?.trim() ?? '';
	const categoryRef = args.category?.trim() ?? '';
	const tags = splitList(args.tags ?? '');
	if (!description && !aliases && !firstMessage && !categoryRef && !tags.length) {
		throw new Error('Nothing to update: pass description, aliases, first_message, category or tags.');
	}

	const updated = { ...entry };
	const changed: string[] = [];
	if (description) {
		updated.descripcion = joinText(entry.descripcion, description, '\n\n', append);
		changed.push('description');
	}
	if (aliases) {
		updated.alias = joinText(entry.alias, aliases, ', ', append);
		changed.push('aliases');
	}
	if (firstMessage) {
		updated.first_message = joinText(entry.first_message, firstMessage, '\n\n', append);
		changed.push('first message');
	}
	if (categoryRef) {
		const category = resolveCategory(categoryRef, context);
		updated.id_categoria = category.id_categoria;
		changed.push(`category (now ${category.nombre})`);
	}

	const fieldsChanged = changed.length > 0;
	if (fieldsChanged) await context.updateCodexEntry(updated);
	if (tags.length) {
		await applyTags(entry, tags, append, context);
		changed.push('tags');
	}
	return `${append ? 'Extended' : 'Updated'} the ${changed.join(', ')} of "${entry.nombre}".`;
}

export async function archiveCodexEntry(args: Record<string, string>, context: ToolContext): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	await context.archiveCodexEntry(entry.id_entrada_codex);
	return `Archived "${entry.nombre}". The author can restore it from the archived filter `
		+ 'of the Codex panel.';
}
