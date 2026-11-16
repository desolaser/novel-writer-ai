import { App } from 'obsidian';
import { EntityId, nowISO } from '../../../domain';
import type {
	CodexSchema,
	CodexSchemaMergeSummary,
	CodexSchemaSelection,
} from '../../../types/CodexSchema';
import { mergeCodexSchema } from '../../../utils/codexSchemaMerge';
import { listCategorias, writeAllCategorias } from './CategoriaRepo';
import {
	listAllDetallesExtended,
	writeAllDetallesExtended,
} from './DetalleRepo';

/** Reads the categories and custom details of the novel in `folderPath`. */
export async function readCodexSchema(
	app: App,
	folderPath: string,
): Promise<CodexSchema> {
	const categorias = await listCategorias(app, folderPath);
	const detallesFile = await listAllDetallesExtended(app, folderPath);
	return { categorias, ...detallesFile };
}

/**
 * Copies categories and custom details from one novel folder to another.
 * Entries and their values are never copied. See `mergeCodexSchema` for how
 * names, ids and links are resolved.
 */
export async function copyCodexSchema(
	app: App,
	sourceFolder: string,
	targetFolder: string,
	targetNovelId: EntityId,
	selection: CodexSchemaSelection,
): Promise<CodexSchemaMergeSummary> {
	const source = await readCodexSchema(app, sourceFolder);
	const target = await readCodexSchema(app, targetFolder);
	const { schema, summary } = mergeCodexSchema(
		source,
		target,
		targetNovelId,
		selection,
		nowISO(),
	);
	await writeAllCategorias(app, targetFolder, schema.categorias);
	await writeAllDetallesExtended(app, targetFolder, {
		detalles: schema.detalles,
		opciones: schema.opciones,
		detalle_categorias: schema.detalle_categorias,
	});
	return summary;
}
