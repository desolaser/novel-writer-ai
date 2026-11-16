import React, { useState } from "react";
import type { ChapterMetrics, EntryMentions, NovelMetrics } from "../../../../types/NovelMetrics";
import { MetricsSection, formatNumber } from "./MetricsParts";

type OpenEntry = (id: string, event: React.MouseEvent) => void;
type OpenChapter = (id: string) => void;

const DEFAULT_ROWS = 12;
const LEVELS = 4;

/** Intensity 0..4 of a cell, relative to the entry's busiest chapter. */
function levelOf(count: number, rowMax: number): number {
	if (!count || !rowMax) return 0;
	return Math.max(1, Math.ceil((count / rowMax) * LEVELS));
}

function HeatmapRow({
	entry,
	chapters,
	onOpenEntry,
	onOpenChapter,
}: {
	entry: EntryMentions;
	chapters: ChapterMetrics[];
	onOpenEntry: OpenEntry;
	onOpenChapter: OpenChapter;
}) {
	const rowMax = Math.max(0, ...entry.perChapter);
	return (
		<>
			<button
				className="nw-heatmap-name"
				title={`${entry.categoryName} · ${formatNumber(entry.mentions)} mentions · Click to open`}
				onClick={(event) => onOpenEntry(entry.id, event)}
			>
				<span
					className="nw-metrics-dot"
					style={{ background: entry.color || "var(--text-faint)" }}
				/>
				<span className="nw-heatmap-name-text">{entry.name}</span>
			</button>
			{chapters.map((chapter, index) => {
				const count = entry.perChapter[index] ?? 0;
				return (
					<div
						key={chapter.id}
						className={`nw-heatmap-cell level-${levelOf(count, rowMax)}`}
						title={`${entry.name} · #${chapter.number} ${chapter.name}: `
							+ `${formatNumber(count)} mentions`}
						onClick={chapter.hasFile ? () => onOpenChapter(chapter.id) : undefined}
					/>
				);
			})}
		</>
	);
}

/**
 * Which codex entries appear in which chapters. Rows are the most mentioned
 * entries, columns the chapters in reading order.
 */
export function MentionsHeatmap({
	metrics,
	onOpenEntry,
	onOpenChapter,
}: {
	metrics: NovelMetrics;
	onOpenEntry: OpenEntry;
	onOpenChapter: OpenChapter;
}) {
	const [showAll, setShowAll] = useState(false);
	const mentioned = metrics.codex.mentioned;
	const chapters = metrics.chapters;
	const rows = showAll ? mentioned : mentioned.slice(0, DEFAULT_ROWS);

	return (
		<MetricsSection
			title="Appearances by chapter"
			hint="Darker cells: more mentions, compared with the entry's busiest chapter."
			defaultOpen={false}
		>
			{!rows.length || !chapters.length ? (
				<p className="nw-metrics-empty">No codex entry is named in the manuscript yet.</p>
			) : (
				<>
					<div className="nw-heatmap-scroll">
						<div
							className="nw-heatmap"
							style={{ gridTemplateColumns: `minmax(80px, 120px) repeat(${chapters.length}, 14px)` }}
						>
							<div className="nw-heatmap-corner" />
							{chapters.map((chapter) => (
								<div
									key={chapter.id}
									className="nw-heatmap-chapter"
									title={`#${chapter.number} ${chapter.name}`}
								>
									{chapter.number % 5 === 0 || chapter.number === 1 ? chapter.number : ""}
								</div>
							))}
							{rows.map((entry) => (
								<HeatmapRow
									key={entry.id}
									entry={entry}
									chapters={chapters}
									onOpenEntry={onOpenEntry}
									onOpenChapter={onOpenChapter}
								/>
							))}
						</div>
					</div>
					<div className="nw-heatmap-legend">
						<span>Fewer</span>
						{[1, 2, 3, 4].map((level) => (
							<span key={level} className={`nw-heatmap-cell level-${level}`} />
						))}
						<span>More mentions</span>
					</div>
					{mentioned.length > DEFAULT_ROWS && (
						<button className="nw-metrics-link" onClick={() => setShowAll((value) => !value)}>
							{showAll ? "Show fewer" : `Show all ${mentioned.length}`}
						</button>
					)}
				</>
			)}
		</MetricsSection>
	);
}
