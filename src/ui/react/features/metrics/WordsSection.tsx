import React, { useState } from "react";
import type { NovelMetrics, TermCount } from "../../../../types/NovelMetrics";
import { BarList, type BarItem, MetricsSection } from "./MetricsParts";

function termBars(terms: TermCount[]): BarItem[] {
	return terms.map((item) => ({
		key: item.term,
		label: item.term,
		value: item.count,
	}));
}

/** Most used words and the three-word phrases that keep coming back. */
export function WordsSection({ metrics }: { metrics: NovelMetrics }) {
	const [hideCodex, setHideCodex] = useState(true);
	const words = hideCodex ? metrics.topWordsWithoutCodex : metrics.topWords;
	return (
		<>
			<MetricsSection
				title="Most used words"
				hint="Without articles, prepositions and other function words."
			>
				<label className="nw-metrics-toggle">
					<input
						type="checkbox"
						checked={hideCodex}
						onChange={(event) => setHideCodex(event.target.checked)}
					/>
					Hide codex names
				</label>
				<BarList items={termBars(words)} empty="No text to count yet." />
			</MetricsSection>
			<MetricsSection
				title="Repeated phrases"
				hint="Three-word phrases used more than once. Handy to spot verbal tics."
				defaultOpen={false}
			>
				<BarList
					items={termBars(metrics.repeatedPhrases)}
					empty="No phrase repeats yet."
				/>
			</MetricsSection>
		</>
	);
}
