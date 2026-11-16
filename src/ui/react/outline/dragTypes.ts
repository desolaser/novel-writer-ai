import type { DragEvent } from "react";

/**
 * Drag payload types of the outline. A custom type instead of "text/plain"
 * keeps a chapter id from being typed into a textarea when the handle is
 * dropped on one, and lets the drop targets ignore ordinary text drags made
 * while selecting text inside a field.
 */
export const CHAPTER_DRAG_TYPE = "application/x-nw-chapter";
export const ACT_DRAG_TYPE = "application/x-nw-act";

/** True when the drag in progress carries the given outline payload. */
export function carriesDragType(event: DragEvent, type: string): boolean {
	return Array.from(event.dataTransfer?.types ?? []).includes(type);
}
