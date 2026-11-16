import { TipoDetalle } from '../domain';
import type { Categoria, Detalle, EntradaCodex } from '../domain';
import type { CodexToolContext as ToolContext } from '../interfaces/tool-context';
import { resolveByName } from '../utils/toolCallParsing';
import { isDetailVisible, resolveEntry } from './codexShared';

/**
 * Custom details of codex entries (age, faction, mentor...). Each category has
 * its own set, defined by the author. Details hidden from the AI are left out
 * of both the listing and the writes.
 */

const TYPE_LABEL: Record<string, string> = {
	[TipoDetalle.Text]: 'text',
	[TipoDetalle.Line]: 'single line',
	[TipoDetalle.Dropdown]: 'one option',
	[TipoDetalle.CodexRef]: 'codex entry name',
};

async function describeDetail(definition: Detalle, context: ToolContext): Promise<string> {
	let type = TYPE_LABEL[definition.tipo_detalle] ?? definition.tipo_detalle;
	if (definition.tipo_detalle === TipoDetalle.Dropdown) {
		const options = await context.listOptions(definition.id_detalle);
		type = `one of: ${options.map((option) => option.nombre).join(' | ') || '(no options)'}`;
	}
	const hint = definition.ai_hint?.trim() ? ` — ${definition.ai_hint.trim()}` : '';
	return `  ${definition.nombre} (${type})${hint}`;
}

async function describeCategory(category: Categoria, context: ToolContext): Promise<string> {
	const details = (await context.listDetailsOfCategory(category.id_categoria))
		.filter(isDetailVisible);
	if (!details.length) return `${category.nombre}: no custom details`;
	const lines = await Promise.all(details.map((detail) => describeDetail(detail, context)));
	return [`${category.nombre}:`, ...lines].join('\n');
}

export async function listCodexFields(args: Record<string, string>, context: ToolContext): Promise<string> {
	let categories = context.listCategories();
	if (args.category?.trim()) {
		const category = resolveByName(
			args.category,
			categories,
			(item) => item.nombre,
			(item) => item.id_categoria,
		);
		if (!category) {
			const names = categories.map((item) => item.nombre).join(', ');
			throw new Error(`No category named "${args.category}". Available: ${names}.`);
		}
		categories = [category];
	}
	if (!categories.length) return 'The novel has no categories.';
	const blocks = await Promise.all(categories.map((category) => describeCategory(category, context)));
	return blocks.join('\n');
}

/** Details the entry can hold: its category's, plus any it already has. */
async function detailsFor(entry: EntradaCodex, context: ToolContext): Promise<Detalle[]> {
	const ofCategory = await context.listDetailsOfCategory(entry.id_categoria);
	const present = new Set((entry.detalles ?? []).map((value) => value.id_detalle));
	const extra = context.listDetalles().filter((definition) =>
		present.has(definition.id_detalle)
		&& !ofCategory.some((item) => item.id_detalle === definition.id_detalle));
	return [...ofCategory, ...extra].filter(isDetailVisible);
}

/** Turns the model's value into what is stored: text, an option id or an entry id. */
async function storedValue(
	definition: Detalle,
	value: string,
	current: string,
	append: boolean,
	context: ToolContext,
): Promise<string> {
	if (definition.tipo_detalle === TipoDetalle.Dropdown) {
		const options = await context.listOptions(definition.id_detalle);
		const option = resolveByName(value, options, (item) => item.nombre);
		if (!option) {
			const names = options.map((item) => item.nombre).join(', ') || '(none)';
			throw new Error(`"${value}" is not an option of ${definition.nombre}. Options: ${names}.`);
		}
		return option.id_opcion_detalle;
	}
	if (definition.tipo_detalle === TipoDetalle.CodexRef) {
		return resolveEntry(value, context).id_entrada_codex;
	}
	const text = definition.tipo_detalle === TipoDetalle.Line
		? value.replace(/\s*\n\s*/g, ' ')
		: value;
	if (!append || !current.trim()) return text;
	const separator = definition.tipo_detalle === TipoDetalle.Line ? ' ' : '\n\n';
	return `${current.trim()}${separator}${text}`;
}

export async function setCodexDetail(args: Record<string, string>, context: ToolContext): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	const available = await detailsFor(entry, context);
	const definition = resolveByName(
		args.detail ?? '',
		available,
		(item) => item.nombre,
		(item) => item.id_detalle,
	);
	if (!definition) {
		const names = available.map((item) => item.nombre).join(', ') || '(none)';
		throw new Error(`"${args.detail}" is not a detail of "${entry.nombre}". Available: ${names}. `
			+ 'Use list_codex_fields to see each detail\'s type and options.');
	}

	const value = (args.value ?? '').trim();
	if (!value) {
		await context.setDetailValue(entry.id_entrada_codex, definition.id_detalle, null);
		return `Cleared ${definition.nombre} of "${entry.nombre}".`;
	}
	const append = (args.mode ?? 'replace').trim().toLowerCase() === 'append';
	const current = (entry.detalles ?? [])
		.find((item) => item.id_detalle === definition.id_detalle)?.valor ?? '';
	const stored = await storedValue(definition, value, String(current), append, context);
	await context.setDetailValue(entry.id_entrada_codex, definition.id_detalle, stored);
	return `Set ${definition.nombre} of "${entry.nombre}".`;
}
