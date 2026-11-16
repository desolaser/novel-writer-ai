import React from "react";
import type { NovelMetrics } from "../../../../types/NovelMetrics";
import { WORDS_PER_MINUTE, WORDS_PER_PAGE } from "../../../../utils/novelMetrics";
import {
	MetricsSection,
	StatGrid,
	StatTile,
	formatDuration,
	formatNumber,
} from "./MetricsParts";

/** Headline numbers: size of the novel and how much of it is written. */
export function OverviewSection({ metrics }: { metrics: NovelMetrics }) {
	const { totals, codex } = metrics;
	return (
		<MetricsSection title="Overview">
			<StatGrid>
				<StatTile value={formatNumber(totals.words)} label="Words" />
				<StatTile
					value={`${totals.writtenChapters}/${totals.chapters}`}
					label="Chapters written"
					hint="Chapters with at least one word, out of all chapters."
				/>
				<StatTile value={formatNumber(totals.acts)} label="Acts" />
				<StatTile
					value={`${totals.outlinedChapters}/${totals.chapters}`}
					label="Chapters outlined"
				/>
				<StatTile
					value={formatNumber(totals.pages)}
					label="Pages"
					hint={`Estimate at ${WORDS_PER_PAGE} words per page.`}
				/>
				<StatTile
					value={formatDuration(totals.readingMinutes)}
					label="Reading time"
					hint={`Estimate at ${WORDS_PER_MINUTE} words per minute.`}
				/>
				<StatTile value={formatNumber(codex.activeEntries)} label="Codex entries" />
				<StatTile
					value={formatNumber(metrics.style.uniqueWords)}
					label="Different words"
				/>
			</StatGrid>
		</MetricsSection>
	);
}
