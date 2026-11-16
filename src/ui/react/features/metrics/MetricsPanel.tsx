import React, { useCallback } from "react";
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
import type NovelWriterPlugin from "../../../../../main";

/** Metrics tab of the Companion: statistics of the active novel. */
export function MetricsPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const { metrics, pace, loading, refresh } = useNovelMetrics(plugin);

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
			<CodexMetricsSection metrics={metrics} onOpenEntry={openEntry} />
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
