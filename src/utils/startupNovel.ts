import type { Novela } from '../domain/entities/Novela';

/**
 * Picks the novel to open when the plugin loads.
 *
 * The saved id wins while that novel still exists. If it was deleted (or
 * nothing was saved), falls back to the most recently updated novel, so the
 * author never lands on "Novel not found".
 */
export function resolveStartupNovelId(
	savedId: string | null,
	novels: readonly { novela: Novela }[],
): string | null {
	if (savedId && novels.some((item) => item.novela.id_novela === savedId)) {
		return savedId;
	}
	let latest: Novela | null = null;
	for (const { novela } of novels) {
		if (!latest || (novela.updated_at ?? '') > (latest.updated_at ?? '')) {
			latest = novela;
		}
	}
	return latest ? latest.id_novela : null;
}
