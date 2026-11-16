import React from "react";
import type { NovelMetrics } from "../../../../types/NovelMetrics";
import {
	MetricsSection,
	StatGrid,
	StatTile,
	formatNumber,
	formatPercent,
} from "./MetricsParts";

/** Rhythm and texture of the prose: sentences, paragraphs, dialogue, vocabulary. */
export function StyleSection({ metrics }: { metrics: NovelMetrics }) {
	const style = metrics.style;
	return (
		<MetricsSection title="Style">
			<StatGrid>
				<StatTile
					value={formatNumber(style.averageSentenceWords, 1)}
					label="Words per sentence"
					hint={`${formatNumber(style.sentences)} sentences in total.`}
				/>
				<StatTile
					value={formatNumber(style.averageParagraphWords, 1)}
					label="Words per paragraph"
					hint={`${formatNumber(style.paragraphs)} paragraphs in total.`}
				/>
				<StatTile
					value={formatPercent(style.dialogueShare)}
					label="Dialogue"
					hint={"Share of words spoken by characters. Counts paragraphs that open "
						+ "with a dash and text between quotes; it is an estimate."}
				/>
				<StatTile
					value={formatPercent(style.vocabularyVariety)}
					label="Vocabulary variety"
					hint={"Different words in every 500-word stretch (MATTR). Higher means a "
						+ "more varied vocabulary; it does not drop as the novel grows."}
				/>
				<StatTile
					value={formatNumber(style.averageWordLength, 1)}
					label="Letters per word"
				/>
			</StatGrid>
		</MetricsSection>
	);
}
