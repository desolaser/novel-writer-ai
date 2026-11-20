import { useEffect, useState } from "react";
import type { Capitulo, EntityId, EntradaCodex } from "../../../../domain";
import { chapterEntryMentions } from "../../../../utils/storyTimeline";
import { useNovelWriter } from "../../store/novelWriterStore";

/**
 * Entries each chapter names, for the "characters" lanes. Reads every
 * manuscript, so it only runs while that mode is on; again when the chapters
 * or the codex change, or on `revision`.
 */
export function useChapterMentions(
	enabled: boolean,
	chapters: Capitulo[],
	entries: EntradaCodex[],
	revision: number,
): Map<EntityId, Set<EntityId>> | null {
	const [mentions, setMentions] = useState<Map<EntityId, Set<EntityId>> | null>(null);

	useEffect(() => {
		if (!enabled) return;
		let cancelled = false;
		void (async () => {
			const read = useNovelWriter.getState().readCapituloTexto;
			const texts = new Map<EntityId, string>();
			for (const chapter of chapters) {
				if (!chapter.archivo) continue;
				try {
					texts.set(chapter.id_capitulo, await read(chapter.id_capitulo));
				} catch {
					// A manuscript that cannot be read names nobody.
				}
			}
			if (!cancelled) setMentions(chapterEntryMentions(texts, entries));
		})();
		return () => {
			cancelled = true;
		};
	}, [enabled, chapters, entries, revision]);

	return enabled ? mentions : null;
}
