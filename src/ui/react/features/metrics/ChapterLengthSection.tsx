import React from "react";
import type { ChapterMetrics, NovelMetrics } from "../../../../types/NovelMetrics";
import {
	BarList,
	type BarItem,
	MetricsSection,
	StatGrid,
	StatTile,
	formatNumber,
} from "./MetricsParts";

type OpenChapter = (id: string) => void;

function chapterLabel(chapter: ChapterMetrics | null): string {
	return chapter ? `#${chapter.number} ${chapter.name}` : "—";
}

function TargetSummary({ metrics }: { metrics: NovelMetrics }) {
	const { target, underTarget, withinTarget, overTarget } = metrics.chapterLength;
	if (!target) {
		return (
			<p className="nw-metrics-note">
				Set "Words per chapter" in Novel Setup to compare chapters with a target.
			</p>
		);
	}
	return (
		<p className="nw-metrics-note">
			Target {formatNumber(target.min)}–{formatNumber(target.max)} words:{" "}
			<strong>{withinTarget}</strong> within, <strong>{underTarget}</strong> under,{" "}
			<strong>{overTarget}</strong> over.
		</p>
	);
}

/** Words per chapter and per act, with average, median and extremes. */
export function ChapterLengthSection({
	metrics,
	onOpenChapter,
}: {
	metrics: NovelMetrics;
	onOpenChapter: OpenChapter;
}) {
	const length = metrics.chapterLength;
	const target = length.target;
	const isOff = (words: number) =>
		Boolean(target) && words > 0 && (words < target.min || words > target.max);

	const chapterBars: BarItem[] = metrics.chapters.map((chapter) => ({
		key: chapter.id,
		label: `#${chapter.number} ${chapter.name}`,
		value: chapter.words,
		flagged: isOff(chapter.words),
		tooltip: `${chapter.actName} · ${formatNumber(chapter.words)} words`
			+ ` · ${chapter.distinctEntries} codex entries`
			+ (chapter.hasFile ? " · Click to open" : " · No manuscript yet"),
		onClick: chapter.hasFile ? () => onOpenChapter(chapter.id) : undefined,
	}));

	const actBars: BarItem[] = metrics.acts.map((act) => ({
		key: act.id,
		label: act.name,
		value: act.words,
		tooltip: `${act.chapters} chapters · ${formatNumber(act.words)} words`,
	}));

	return (
		<>
			<MetricsSection title="Chapter length">
				<StatGrid>
					<StatTile
						value={formatNumber(length.average)}
						label="Average"
						hint="Average words of the chapters that have text."
					/>
					<StatTile
						value={formatNumber(length.median)}
						label="Median"
						hint="Half the written chapters are shorter than this."
					/>
					<StatTile
						value={formatNumber(length.shortest?.words ?? 0)}
						label="Shortest"
						hint={chapterLabel(length.shortest)}
					/>
					<StatTile
						value={formatNumber(length.longest?.words ?? 0)}
						label="Longest"
						hint={chapterLabel(length.longest)}
					/>
				</StatGrid>
				<TargetSummary metrics={metrics} />
				<BarList items={chapterBars} band={target} empty="The novel has no chapters yet." />
			</MetricsSection>
			<MetricsSection title="Words per act" defaultOpen={false}>
				<BarList items={actBars} empty="The novel has no acts yet." />
			</MetricsSection>
		</>
	);
}
