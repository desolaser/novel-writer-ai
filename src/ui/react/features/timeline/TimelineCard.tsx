import type { TimelineCard as Card } from "../../../../types/StoryTimeline";
import { TIMELINE_CHAPTER_DRAG } from "./timelineChanges";

export interface TimelineCardProps {
	card: Card;
	/** Grid lines of the bar: from its first day's column to after its last. */
	gridColumn: string;
	gridRow: number;
	selected: boolean;
	onSelect: () => void;
	onOpen: () => void;
}

function cardTitle(card: Card): string {
	const days = card.start === card.end
		? `Day ${card.start}`
		: `Days ${card.start}–${card.end}`;
	const parts = [`#${card.number} ${card.name}`, days];
	if (card.when) parts.push(card.when);
	if (card.flashback) parts.push("Flashback: before a chapter read earlier");
	parts.push("Click: details · Double click: open · Drag: move");
	return parts.join("\n");
}

/** A chapter as a bar over its days; drag it to another day. */
export function TimelineCard({
	card,
	gridColumn,
	gridRow,
	selected,
	onSelect,
	onOpen,
}: TimelineCardProps) {
	return (
		<div
			className={`nw-timeline-card${selected ? " is-selected" : ""}`
				+ `${card.flashback ? " is-flashback" : ""}`}
			style={{ gridColumn, gridRow }}
			title={cardTitle(card)}
			draggable
			onDragStart={(event) => {
				event.dataTransfer.effectAllowed = "move";
				event.dataTransfer.setData(TIMELINE_CHAPTER_DRAG, card.chapterId);
			}}
			onClick={onSelect}
			onDoubleClick={onOpen}
		>
			<span className="nw-timeline-card-number">#{card.number}</span>
			{card.flashback && <span className="nw-timeline-card-flag">↶</span>}
			<span className="nw-timeline-card-name">{card.name}</span>
			{card.when && <span className="nw-timeline-card-when">{card.when}</span>}
		</div>
	);
}
