import type { Capitulo } from '../domain';

/**
 * Vault path of a chapter's manuscript. Old and default manuscripts are stored
 * relative to the novel folder (`escritura/...`); linked notes keep their full
 * vault path.
 */
export function chapterVaultPath(chapter: Capitulo, folder: string | null): string | null {
	if (!chapter.archivo) return null;
	if (folder && chapter.archivo.startsWith('escritura/')) {
		return `${folder}/${chapter.archivo}`;
	}
	return chapter.archivo;
}

/** Vault paths of every manuscript that exists. */
export function chapterVaultPaths(chapters: Capitulo[], folder: string | null): string[] {
	const paths: string[] = [];
	for (const chapter of chapters) {
		const path = chapterVaultPath(chapter, folder);
		if (path) paths.push(path);
	}
	return paths;
}
