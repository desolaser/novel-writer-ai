import type {
	Categoria,
	Detalle,
	DetalleCategoria,
	EntityId,
	OpcionDetalle,
} from '../domain';

/**
 * The configurable shape of a novel's codex: its categories and the custom
 * details (with dropdown options and category links). Entries are not part of
 * it; copying a schema never copies lore.
 */
export interface CodexSchema {
	categorias: Categoria[];
	detalles: Detalle[];
	opciones: OpcionDetalle[];
	detalle_categorias: DetalleCategoria[];
}

/**
 * Which source items to copy. `'all'` takes every custom category and every
 * detail. Default (system) categories are never listed: every novel has them,
 * so they are matched by name.
 */
export type CodexSchemaSelection =
	| 'all'
	| { categoryIds: EntityId[]; detailIds: EntityId[] };

export interface CodexSchemaMergeSummary {
	categoriesAdded: number;
	categoriesSkipped: number;
	detailsAdded: number;
	detailsSkipped: number;
}

export interface CodexSchemaMergeResult {
	schema: CodexSchema;
	summary: CodexSchemaMergeSummary;
}
