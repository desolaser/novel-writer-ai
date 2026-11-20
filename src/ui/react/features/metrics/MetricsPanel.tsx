import React, { useCallback } from "react";
import { Notice } from "obsidian";
import { useNovelWriter } from "../../store/novelWriterStore";
import { Icon } from "../../components/Icon";
import { openCodexEntry, paneTypeFor } from "../../../views/openCodexEntry";
import { useNovelMetrics } from "./useNovelMetrics";
import { chapterVaultPath } from "../../../../utils/chapterPaths";
import { OverviewSection } from "./OverviewSection";
import { ChapterLengthSection } from "./ChapterLengthSection";
import { CodexMetricsSection } from "./CodexMetricsSection";
import { WordsSection } from "./WordsSection";
import { StyleSection } from "./StyleSection";
import { WritingPaceSection } from "./WritingPaceSection";
import { MentionsHeatmap } from "./MentionsHeatmap";
import { ChapterInfoSection } from "./ChapterInfoSection";
import { NameCandidatesSection } from "./NameCandidatesSection";
import type NovelWriterPlugin from "../../../../../main";

/** Metrics tab of the Companion: statistics of the active novel. */
export function MetricsPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const { metrics, pace, loading, refresh, ignoredNames } = useNovelMetrics(plugin);
	const categories = useNovelWriter((state) => state.categorias);

	const openChapter = useCallback((id: string) => {
		const state = useNovelWriter.getState();
		const chapter = state.capitulos.find((item) => item.id_capitulo === id);
		const folder = state.store?.activeFolderPath ?? null;
		const path = chapter ? chapterVaultPath(chapter, folder) : null;
		if (path) void plugin.app.workspace.openLinkText(path, "", false);
	}, [plugin]);

	const openEntry = useCallback((id: string, event: React.MouseEvent) => {
		void openCodexEntry(plugin, id, paneTypeFor(event.nativeEvent));
	}, [plugin]);

	const createEntry = useCallback(async (name: string, categoryId: string) => {
		try {
			const created = await useNovelWriter.getState().createEntry(categoryId, name);
			if (created) await openCodexEntry(plugin, created.id_entrada_codex);
		} catch (error: any) {
			new Notice(`Could not create the entry: ${error?.message ?? error}`);
		}
	}, [plugin]);

	const changeIgnored = useCallback(async (change: (names: string[]) => string[]) => {
		const store = useNovelWriter.getState().store;
		if (!store) return;
		try {
			await store.changeIgnoredNames(change);
			refresh();
		} catch (error: any) {
			new Notice(`Could not save: ${error?.message ?? error}`);
		}
	}, [refresh]);

	if (!metrics) {
		return <p className="nw-muted">Counting words...</p>;
	}

	return (
		<div className="nw-metrics">
			<div className="nw-metrics-header">
				<span className="nw-metrics-status">
					{loading ? "Updating..." : "Updates as you write"}
				</span>
				<button
					className="nw-icon-btn"
					onClick={refresh}
					disabled={loading}
					aria-label="Recount"
					title="Recount"
				>
					<Icon.Refresh />
				</button>
			</div>
			<OverviewSection metrics={metrics} />
			{pace && (
				<WritingPaceSection pace={pace} targetWords={metrics.totals.targetWords} />
			)}
			<ChapterLengthSection metrics={metrics} onOpenChapter={openChapter} />
			<ChapterInfoSection metrics={metrics} onOpenEntry={openEntry} />
			<CodexMetricsSection metrics={metrics} onOpenEntry={openEntry} />
			<NameCandidatesSection
				candidates={metrics.nameCandidates}
				categories={categories}
				ignoredCount={ignoredNames.length}
				onCreate={(name, categoryId) => void createEntry(name, categoryId)}
				onIgnore={(name) => void changeIgnored((names) =>
					names.includes(name) ? names : [...names, name])}
				onRestoreIgnored={() => void changeIgnored(() => [])}
			/>
			<MentionsHeatmap
				metrics={metrics}
				onOpenEntry={openEntry}
				onOpenChapter={openChapter}
			/>
			<WordsSection metrics={metrics} />
			<StyleSection metrics={metrics} />
		</div>
	);
}
