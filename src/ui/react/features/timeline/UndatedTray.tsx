import { useState } from "react";
import type { TimelineUndated } from "../../../../types/StoryTimeline";
import { TIMELINE_CHAPTER_DRAG } from "./timelineChanges";

export interface UndatedTrayProps {
	chapters: TimelineUndated[];
	selectedId: string | null;
	onSelect: (chapterId: string) => void;
	/** A dated chapter dropped here loses its days. */
	onDrop: (chapterId: string) => void;
}

/** Chapters with no day: drag one onto a day, or click it to type its day. */
export function UndatedTray({ chapters, selectedId, onSelect, onDrop }: UndatedTrayProps) {
	const [over, setOver] = useState(false);
	return (
		<div
			className={`nw-timeline-undated${over ? " is-over" : ""}`}
			onDragOver={(event) => {
				if (!event.dataTransfer.types.includes(TIMELINE_CHAPTER_DRAG)) return;
				event.preventDefault();
				setOver(true);
			}}
			onDragLeave={() => setOver(false)}
			onDrop={(event) => {
				setOver(false);
				const id = event.dataTransfer.getData(TIMELINE_CHAPTER_DRAG);
				if (!id) return;
				event.preventDefault();
				onDrop(id);
			}}
		>
			<span className="nw-timeline-undated-title">
				Undated{chapters.length ? ` (${chapters.length})` : ""}
			</span>
			{!chapters.length && (
				<span className="nw-timeline-hint">
					Drop a chapter here to take its days off.
				</span>
			)}
			{chapters.map((chapter) => (
				<button
					key={chapter.chapterId}
					className={selectedId === chapter.chapterId
						? "nw-timeline-chip is-selected"
						: "nw-timeline-chip"}
					draggable
					title="Click to give it a day, or drag it onto a day"
					onDragStart={(event) => {
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData(TIMELINE_CHAPTER_DRAG, chapter.chapterId);
					}}
					onClick={() => onSelect(chapter.chapterId)}
				>
					#{chapter.number} {chapter.name}
				</button>
			))}
		</div>
	);
}
