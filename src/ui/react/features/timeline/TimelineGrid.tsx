import { useState } from "react";
import type { StoryTimeline } from "../../../../types/StoryTimeline";
import { TimelineDayColumn } from "./TimelineDayColumn";
import { TimelineLaneRows } from "./TimelineLaneRows";

export interface TimelineGridProps {
	timeline: StoryTimeline;
	selectedId: string | null;
	onSelect: (chapterId: string) => void;
	onOpen: (chapterId: string) => void;
	onDropOnDay: (chapterId: string, day: number) => void;
}

const LANE_WIDTH = "140px";
const DAY_WIDTH = "128px";
const GAP_WIDTH = "44px";

/** Grid line where each column (day) starts: a gap track goes before a jump. */
function columnLines(timeline: StoryTimeline): { lines: number[]; template: string } {
	const tracks = [LANE_WIDTH];
	const lines: number[] = [];
	for (const column of timeline.columns) {
		if (column.gapBefore > 0) tracks.push(GAP_WIDTH);
		tracks.push(DAY_WIDTH);
		lines.push(tracks.length);
	}
	return { lines, template: tracks.join(" ") };
}

/** First grid row of each lane; row 1 is the header. */
function laneRows(timeline: StoryTimeline): number[] {
	let next = 2;
	return timeline.lanes.map((lane) => {
		const start = next;
		next += lane.rows;
		return start;
	});
}

/**
 * The timeline as a CSS grid: a header of days, a band of rows per lane, each
 * chapter as a bar across its days. Every day column is a drop target behind
 * the cards.
 */
export function TimelineGrid({
	timeline,
	selectedId,
	onSelect,
	onOpen,
	onDropOnDay,
}: TimelineGridProps) {
	const [dragOver, setDragOver] = useState<number | null>(null);
	const { lines, template } = columnLines(timeline);
	const starts = laneRows(timeline);
	const lastRow = 2 + timeline.lanes.reduce((sum, lane) => sum + lane.rows, 0);

	return (
		<div className="nw-timeline-scroll">
			<div className="nw-timeline-grid" style={{ gridTemplateColumns: template }}>
				<div className="nw-timeline-corner" style={{ gridColumn: 1, gridRow: 1 }} />
				{timeline.columns.map((column, index) => (
					<TimelineDayColumn
						key={column.day}
						column={column}
						line={lines[index]}
						lastRow={lastRow}
						dragOver={dragOver === index}
						onDragOver={(over) => setDragOver(over ? index : null)}
						onDropChapter={(id) => onDropOnDay(id, column.day)}
					/>
				))}
				{timeline.lanes.map((lane, index) => (
					<TimelineLaneRows
						key={lane.key}
						lane={lane}
						firstRow={starts[index]}
						lines={lines}
						selectedId={selectedId}
						onSelect={onSelect}
						onOpen={onOpen}
					/>
				))}
			</div>
		</div>
	);
}
