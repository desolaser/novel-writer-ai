import React, { useState } from "react";
import type { EntryMentions, NovelMetrics } from "../../../../types/NovelMetrics";
import {
	BarList,
	type BarItem,
	MetricsSection,
	StatGrid,
	StatTile,
	formatNumber,
} from "./MetricsParts";

type OpenEntry = (id: string, event: React.MouseEvent) => void;

const TOP_MENTIONS = 15;

function mentionTooltip(entry: EntryMentions): string {
	const chapters = entry.chapters === 1 ? "1 chapter" : `${entry.chapters} chapters`;
	const span = entry.firstChapter === entry.lastChapter
		? `chapter #${entry.firstChapter}`
		: `chapters #${entry.firstChapter}–#${entry.lastChapter}`;
	return `${entry.categoryName} · in ${chapters} (${span})`;
}

/** Codex entries never named in the manuscript, as clickable chips. */
function EntryChips({ entries, onOpen }: { entries: EntryMentions[]; onOpen: OpenEntry }) {
	if (!entries.length) {
		return <p className="nw-metrics-empty">Every entry appears in the manuscript.</p>;
	}
	return (
		<div className="nw-metrics-chips">
			{entries.map((entry) => (
				<button
					key={entry.id}
					className="nw-metrics-chip"
					title={`${entry.categoryName} · Click to open`}
					onClick={(event) => onOpen(entry.id, event)}
				>
					<span
						className="nw-metrics-dot"
						style={{ background: entry.color || "var(--text-faint)" }}
					/>
					{entry.name}
				</button>
			))}
		</div>
	);
}

/** Codex size by category, the most mentioned entries and the ones left behind. */
export function CodexMetricsSection({
	metrics,
	onOpenEntry,
}: {
	metrics: NovelMetrics;
	onOpenEntry: OpenEntry;
}) {
	const codex = metrics.codex;
	const [showAll, setShowAll] = useState(false);

	const categoryBars: BarItem[] = codex.byCategory.map((category) => ({
		key: category.id,
		label: category.name,
		value: category.entries,
		dot: category.color,
	}));

	const visibleMentions = showAll ? codex.mentioned : codex.mentioned.slice(0, TOP_MENTIONS);
	const mentionBars: BarItem[] = visibleMentions.map((entry) => ({
		key: entry.id,
		label: entry.name,
		value: entry.mentions,
		dot: entry.color,
		tooltip: `${mentionTooltip(entry)} · Click to open`,
		onClick: (event) => onOpenEntry(entry.id, event),
	}));

	const quietBars: BarItem[] = codex.goneQuiet.map((entry) => ({
		key: entry.id,
		label: entry.name,
		value: entry.silentChapters,
		display: `last in #${entry.lastChapter}`,
		dot: entry.color,
		tooltip: `${formatNumber(entry.mentions)} mentions · `
			+ `${entry.silentChapters} chapters without one · Click to open`,
		onClick: (event) => onOpenEntry(entry.id, event),
	}));

	return (
		<>
			<MetricsSection title="Codex">
				<StatGrid>
					<StatTile value={formatNumber(codex.activeEntries)} label="Entries" />
					<StatTile
						value={formatNumber(codex.mentioned.length)}
						label="In the manuscript"
						hint="Entries named at least once in a chapter."
					/>
					<StatTile
						value={formatNumber(codex.neverMentioned.length)}
						label="Never named"
					/>
					<StatTile value={formatNumber(codex.archivedEntries)} label="Archived" />
				</StatGrid>
				<h4 className="nw-metrics-subtitle">Entries by category</h4>
				<BarList items={categoryBars} empty="The codex is empty." />
			</MetricsSection>
			<MetricsSection
				title="Most mentioned"
				hint="Mentions by name and alias, the same matching as the Mentions tab."
			>
				<BarList items={mentionBars} empty="No codex entry is named in the manuscript yet." />
				{codex.mentioned.length > TOP_MENTIONS && (
					<button className="nw-metrics-link" onClick={() => setShowAll((value) => !value)}>
						{showAll ? "Show fewer" : `Show all ${codex.mentioned.length}`}
					</button>
				)}
			</MetricsSection>
			<MetricsSection
				title="Gone quiet"
				hint="Entries with 3 or more mentions that have not appeared for 3 or more chapters."
				defaultOpen={false}
			>
				<BarList items={quietBars} empty="No entry has been missing for long." />
			</MetricsSection>
			<MetricsSection title="Never mentioned" defaultOpen={false}>
				<EntryChips entries={codex.neverMentioned} onOpen={onOpenEntry} />
			</MetricsSection>
		</>
	);
}
