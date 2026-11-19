import React from "react";
import type {
	ChapterGroupMetrics,
	NovelMetrics,
} from "../../../../types/NovelMetrics";
import { BarList, MetricsSection, formatNumber } from "./MetricsParts";
import type { BarItem } from "./MetricsParts";

function groupTooltip(group: ChapterGroupMetrics): string {
	const chapters = group.chapters === 1 ? "1 chapter" : `${group.chapters} chapters`;
	const last = group.lastChapter ? ` · last: #${group.lastChapter}` : "";
	return `${chapters} · ${formatNumber(group.words)} words${last}`;
}

function toBar(
	group: ChapterGroupMetrics,
	onClick?: (event: React.MouseEvent) => void,
): BarItem {
	return {
		key: group.key || "not-set",
		label: group.name,
		value: group.chapters,
		display: `${group.chapters} · ${formatNumber(group.words)} w`,
		dot: group.color || undefined,
		tooltip: groupTooltip(group),
		onClick,
	};
}

/** Chapters and words by writing status and by point of view. */
export function ChapterInfoSection({
	metrics,
	onOpenEntry,
}: {
	metrics: NovelMetrics;
	onOpenEntry: (id: string, event: React.MouseEvent) => void;
}) {
	const { byStatus, byPointOfView } = metrics.chapterInfo;
	if (!byStatus.length && !byPointOfView.length) {
		return (
			<MetricsSection title="Status and point of view" defaultOpen={false}>
				<p className="nw-metrics-empty">
					Set the status and point of view of a chapter in the Outline
					(expand the chapter) to see them here.
				</p>
			</MetricsSection>
		);
	}

	const statusBars = byStatus.map((group) => toBar(group));
	const povBars = byPointOfView.map((group) =>
		toBar(
			group,
			group.key ? (event) => onOpenEntry(group.key, event) : undefined,
		)
	);

	return (
		<MetricsSection title="Status and point of view">
			<div className="nw-metrics-subtitle">By status</div>
			<BarList items={statusBars} empty="No chapter has a status yet." />
			<div className="nw-metrics-subtitle">By point of view</div>
			<BarList items={povBars} empty="No chapter has a point of view yet." />
		</MetricsSection>
	);
}
