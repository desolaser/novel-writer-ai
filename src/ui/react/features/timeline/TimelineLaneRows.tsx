import { Fragment } from "react";
import type { TimelineLane } from "../../../../types/StoryTimeline";
import { TimelineCard } from "./TimelineCard";

export interface TimelineLaneRowsProps {
	lane: TimelineLane;
	/** First grid row of the lane. */
	firstRow: number;
	/** Grid line where each column (day) starts. */
	lines: number[];
	selectedId: string | null;
	onSelect: (chapterId: string) => void;
	onOpen: (chapterId: string) => void;
}

/** A lane: its name on the left, its chapters as bars, scene marks on them. */
export function TimelineLaneRows({
	lane,
	firstRow,
	lines,
	selectedId,
	onSelect,
	onOpen,
}: TimelineLaneRowsProps) {
	return (
		<>
			<div
				className={`nw-timeline-lane${lane.entryId ? "" : " is-empty"}`}
				style={{
					gridColumn: 1,
					gridRow: `${firstRow} / span ${lane.rows}`,
					borderLeftColor: lane.color || undefined,
				}}
				title={lane.name}
			>
				{lane.name}
			</div>
			{lane.cards.map((card) => {
				const row = firstRow + card.row;
				const span = `${lines[card.startColumn]} / ${lines[card.endColumn] + 1}`;
				return (
					<Fragment key={card.chapterId}>
						<TimelineCard
							card={card}
							gridColumn={span}
							gridRow={row}
							selected={selectedId === card.chapterId}
							onSelect={() => onSelect(card.chapterId)}
							onOpen={() => onOpen(card.chapterId)}
						/>
						{card.scenes.map((mark) => (
							<span
								key={`${card.chapterId}-${mark.label}`}
								className="nw-timeline-scene"
								style={{ gridColumn: lines[mark.column], gridRow: row }}
								title={mark.title}
							>
								{mark.label}
							</span>
						))}
					</Fragment>
				);
			})}
		</>
	);
}
