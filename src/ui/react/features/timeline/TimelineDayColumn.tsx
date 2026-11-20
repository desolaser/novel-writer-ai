import type { TimelineColumn } from "../../../../types/StoryTimeline";
import { TIMELINE_CHAPTER_DRAG } from "./timelineChanges";

export interface TimelineDayColumnProps {
	column: TimelineColumn;
	/** Grid line where this day's track starts. */
	line: number;
	/** Grid row after the last lane. */
	lastRow: number;
	dragOver: boolean;
	onDragOver: (over: boolean) => void;
	onDropChapter: (chapterId: string) => void;
}

/**
 * One story day: the "+N" gap before it, its header and a drop target that
 * covers every lane behind the cards.
 */
export function TimelineDayColumn({
	column,
	line,
	lastRow,
	dragOver,
	onDragOver,
	onDropChapter,
}: TimelineDayColumnProps) {
	const allRows = `1 / ${lastRow}`;
	const laneRows = `2 / ${lastRow}`;
	return (
		<>
			{column.gapBefore > 0 && (
				<div
					className="nw-timeline-gap"
					style={{ gridColumn: line - 1, gridRow: allRows }}
					title={`${column.gapBefore} days pass`}
				>
					+{column.gapBefore}
				</div>
			)}
			<div className="nw-timeline-day" style={{ gridColumn: line, gridRow: 1 }}>
				Day {column.day}
			</div>
			<div
				className={`nw-timeline-drop${dragOver ? " is-over" : ""}`}
				style={{ gridColumn: line, gridRow: laneRows }}
				onDragOver={(event) => {
					if (!event.dataTransfer.types.includes(TIMELINE_CHAPTER_DRAG)) {
						return;
					}
					event.preventDefault();
					onDragOver(true);
				}}
				onDragLeave={() => onDragOver(false)}
				onDrop={(event) => {
					onDragOver(false);
					const id = event.dataTransfer.getData(TIMELINE_CHAPTER_DRAG);
					if (!id) return;
					event.preventDefault();
					onDropChapter(id);
				}}
			/>
		</>
	);
}
