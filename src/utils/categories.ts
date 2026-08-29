import type { Categoria } from '../domain';

/**
 * Catch-all category for entries created without an explicit one. A new novel gets
 * "Others"; vaults created before the English rename, or with renamed categories,
 * fall back to the last one so an entry is never lost.
 */
export function findFallbackCategory(categorias: Categoria[]): Categoria | null {
	if (!categorias.length) return null;
	const byName = categorias.find((category) => ['others', 'otros'].includes((category.nombre ?? '').trim().toLowerCase()));
	return byName ?? categorias[categorias.length - 1];
}

/**
 * Whether a category holds characters. Matched by name because categories are
 * plain user data with no fixed ids; the Spanish name is accepted so vaults
 * created before the English rename keep working.
 */
export function isCharacterCategory(categoria: Categoria | null | undefined): boolean {
	if (!categoria) return false;
	return ['characters', 'personajes'].includes((categoria.nombre ?? '').trim().toLowerCase());
}
