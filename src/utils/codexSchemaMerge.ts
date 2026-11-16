import type {
	Categoria,
	Detalle,
	DetalleCategoria,
	EntityId,
	OpcionDetalle,
} from '../domain';
import type {
	CodexSchema,
	CodexSchemaMergeResult,
	CodexSchemaSelection,
} from '../types/CodexSchema';
import { genId } from './ids';

/** Name used to match items across novels: trimmed and case-insensitive. */
export function schemaNameKey(name: string): string {
	return (name ?? '').trim().toLowerCase();
}

/**
 * Finds an item in `items` whose name matches `name`. Unnamed items never
 * match: two "(unnamed)" details are not the same detail.
 */
function findByName<T>(
	items: T[],
	name: string,
	nameOf: (item: T) => string,
): T | undefined {
	const key = schemaNameKey(name);
	if (!key) return undefined;
	return items.find(item => schemaNameKey(nameOf(item)) === key);
}

export function findCategoriaByName(
	categorias: Categoria[],
	name: string,
): Categoria | undefined {
	return findByName(categorias, name, c => c.nombre);
}

export function findDetalleByName(
	detalles: Detalle[],
	name: string,
): Detalle | undefined {
	return findByName(detalles, name, d => d.nombre);
}

function isSelectedCategory(
	cat: Categoria,
	selection: CodexSchemaSelection,
): boolean {
	if (cat.system) return false;
	if (selection === 'all') return true;
	return selection.categoryIds.includes(cat.id_categoria);
}

function isSelectedDetail(
	det: Detalle,
	selection: CodexSchemaSelection,
): boolean {
	if (selection === 'all') return true;
	return selection.detailIds.includes(det.id_detalle);
}

function bySourceOrder(a: Detalle, b: Detalle): number {
	return (a.orden ?? 0) - (b.orden ?? 0);
}

/**
 * Copies the selected categories and details of `source` into `target`, and
 * returns the new target schema. Neither input is modified.
 *
 * - Every copied item gets a new id; references are remapped to those ids.
 * - An item whose name already exists in the target is skipped and the
 *   existing one is left untouched.
 * - Categories and details are matched by name, selected or not (default
 *   categories included, since their ids differ from novel to novel).
 * - A detail-category link is copied when both ends exist in the target and
 *   at least one of them was added by this copy. Links between two items the
 *   target already had are never changed.
 */
export function mergeCodexSchema(
	source: CodexSchema,
	target: CodexSchema,
	targetNovelId: EntityId,
	selection: CodexSchemaSelection,
	now: string,
): CodexSchemaMergeResult {
	const categorias = target.categorias.map(c => ({ ...c }));
	const detalles = target.detalles.map(d => ({ ...d }));
	const opciones = target.opciones.map(o => ({ ...o }));
	const links = target.detalle_categorias.map(l => ({ ...l }));
	const summary = {
		categoriesAdded: 0,
		categoriesSkipped: 0,
		detailsAdded: 0,
		detailsSkipped: 0,
	};

	// Source category id -> target category id, and which ones are new.
	const categoryMap = new Map<EntityId, EntityId>();
	const newCategoryIds = new Set<EntityId>();

	for (const cat of source.categorias) {
		const selected = isSelectedCategory(cat, selection);
		const existing = findCategoriaByName(categorias, cat.nombre);
		if (existing) {
			// Mapped even when not selected: a copied detail can still link
			// to a category the target already has under the same name.
			categoryMap.set(cat.id_categoria, existing.id_categoria);
			if (selected) summary.categoriesSkipped++;
			continue;
		}
		if (!selected) continue;
		const copy: Categoria = {
			...cat,
			id_categoria: genId(),
			system: false,
			id_novela: targetNovelId,
			created_at: now,
			updated_at: now,
		};
		categorias.push(copy);
		categoryMap.set(cat.id_categoria, copy.id_categoria);
		newCategoryIds.add(copy.id_categoria);
		summary.categoriesAdded++;
	}

	// Source detail id -> target detail id, and which ones are new.
	const detailMap = new Map<EntityId, EntityId>();
	const newDetailIds = new Set<EntityId>();
	let nextOrden = detalles.reduce(
		(max, d) => Math.max(max, d.orden ?? 0),
		-1,
	) + 1;

	const sourceDetalles = [...source.detalles].sort(bySourceOrder);
	for (const det of sourceDetalles) {
		const selected = isSelectedDetail(det, selection);
		const existing = findDetalleByName(detalles, det.nombre);
		if (existing) {
			// Mapped even when not selected, so a copied category still
			// links to the details the target already has.
			detailMap.set(det.id_detalle, existing.id_detalle);
			if (selected) summary.detailsSkipped++;
			continue;
		}
		if (!selected) continue;
		const copy: Detalle = {
			...det,
			id_detalle: genId(),
			orden: nextOrden++,
			id_novela: targetNovelId,
			created_at: now,
			updated_at: now,
		};
		detalles.push(copy);
		detailMap.set(det.id_detalle, copy.id_detalle);
		newDetailIds.add(copy.id_detalle);
		summary.detailsAdded++;

		opciones.push(...copyOptions(source.opciones, det, copy, now));
	}

	for (const link of source.detalle_categorias) {
		const idDetalle = detailMap.get(link.id_detalle);
		const idCategoria = categoryMap.get(link.id_categoria);
		if (!idDetalle || !idCategoria) continue;
		const touchesNew = newDetailIds.has(idDetalle)
			|| newCategoryIds.has(idCategoria);
		if (!touchesNew) continue;
		const duplicate = links.some(l =>
			l.id_detalle === idDetalle && l.id_categoria === idCategoria);
		if (duplicate) continue;
		const copy: DetalleCategoria = {
			id_detalle_categoria: genId(),
			id_detalle: idDetalle,
			id_categoria: idCategoria,
			created_at: now,
			updated_at: now,
		};
		links.push(copy);
	}

	return {
		schema: {
			categorias,
			detalles,
			opciones,
			detalle_categorias: links,
		},
		summary,
	};
}

function copyOptions(
	sourceOptions: OpcionDetalle[],
	sourceDetail: Detalle,
	copiedDetail: Detalle,
	now: string,
): OpcionDetalle[] {
	return sourceOptions
		.filter(o => o.id_detalle === sourceDetail.id_detalle)
		.map(o => ({
			...o,
			id_opcion_detalle: genId(),
			id_detalle: copiedDetail.id_detalle,
			created_at: now,
			updated_at: now,
		}));
}
