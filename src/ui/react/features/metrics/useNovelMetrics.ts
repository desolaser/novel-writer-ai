import { useEffect, useMemo, useState } from "react";
import { TAbstractFile } from "obsidian";
import { useShallow } from "zustand/react/shallow";
import { useNovelWriter } from "../../store/novelWriterStore";
import { computeNovelMetrics } from "../../../../utils/novelMetrics";
import { emptyWritingLog, writingPace } from "../../../../utils/writingLog";
import { chapterVaultPaths } from "../../../../utils/chapterPaths";
import type { NovelMetrics } from "../../../../types/NovelMetrics";
import type { WritingPace } from "../../../../types/WritingPace";
import type { MetricsSource } from "../../../../interfaces/metrics-source";
import type { Capitulo, EntityId } from "../../../../domain";
import type NovelWriterPlugin from "../../../../../main";

/**
 * Wait after the last edit of a manuscript before counting again. Longer than
 * the tracker needs to count the same save, so the pace includes it.
 */
const REFRESH_DELAY_MS = 3000;

async function readTexts(
	source: MetricsSource,
	chapters: Capitulo[],
): Promise<Map<EntityId, string>> {
	const texts = new Map<EntityId, string>();
	for (const chapter of chapters) {
		if (!chapter.archivo) continue;
		try {
			texts.set(chapter.id_capitulo, await source.readChapterText(chapter.id_capitulo));
		}
		catch {
			// A manuscript that cannot be read counts as empty.
		}
	}
	return texts;
}

/**
 * Metrics and writing pace of the active novel. Counts again when the
 * structure or the codex change, when a manuscript is edited (after a pause)
 * and on `refresh`.
 */
export function useNovelMetrics(plugin: NovelWriterPlugin) {
	const { store, actos, capitulos, entradas, categorias } = useNovelWriter(
		useShallow((state) => ({
			store: state.store,
			actos: state.actos,
			capitulos: state.capitulos,
			entradas: state.entradas,
			categorias: state.categorias,
		})),
	);
	const [metrics, setMetrics] = useState<NovelMetrics | null>(null);
	const [pace, setPace] = useState<WritingPace | null>(null);
	const [loading, setLoading] = useState(false);
	const [revision, setRevision] = useState(0);
	const folder = store?.activeFolderPath ?? null;

	const chapterPaths = useMemo(
		() => new Set(chapterVaultPaths(capitulos, folder)),
		[capitulos, folder],
	);

	useEffect(() => {
		if (!store) return;
		let cancelled = false;
		const source: MetricsSource = {
			readChapterText: (id) => store.readCapituloTexto(id),
			readBlueprint: () => store.readBlueprint(),
			readWritingLog: () => plugin.writingTracker.readLog(),
		};
		setLoading(true);
		void (async () => {
			const texts = await readTexts(source, capitulos);
			const blueprint = await source.readBlueprint().catch(() => null);
			const log = await source.readWritingLog().catch(() => emptyWritingLog());
			if (cancelled) return;
			const next = computeNovelMetrics({
				acts: actos,
				chapters: capitulos,
				texts,
				entries: entradas,
				categories: categorias,
				target: blueprint?.wordsPerChapter ?? null,
			});
			const targetWords = next.totals.targetWords;
			const remaining = targetWords === null ? null : targetWords - next.totals.words;
			setMetrics(next);
			setPace(writingPace(log, new Date(), remaining));
			setLoading(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [plugin, store, actos, capitulos, entradas, categorias, revision]);

	useEffect(() => {
		let timer: ReturnType<typeof setTimeout> | null = null;
		const onModify = (file: TAbstractFile) => {
			if (!chapterPaths.has(file.path)) return;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => setRevision((value) => value + 1), REFRESH_DELAY_MS);
		};
		const ref = plugin.app.vault.on("modify", onModify);
		return () => {
			if (timer) clearTimeout(timer);
			plugin.app.vault.offref(ref);
		};
	}, [plugin, chapterPaths]);

	const refresh = () => setRevision((value) => value + 1);
	return { metrics, pace, loading, refresh };
}
