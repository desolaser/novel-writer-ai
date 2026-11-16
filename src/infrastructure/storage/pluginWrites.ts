/**
 * Files the plugin itself is writing (AI drafts, generated text, undo), so
 * the writing tracker does not count those words as the author's.
 *
 * A mark lasts a few seconds: long enough to cover the save that follows
 * text inserted in an open editor, short enough not to swallow the typing
 * that comes after.
 */

const MARK_MS = 4000;
const marks = new Map<string, number>();

export function markPluginWrite(path: string, now = Date.now()): void {
	marks.set(path, now + MARK_MS);
}

export function isPluginWrite(path: string, now = Date.now()): boolean {
	const until = marks.get(path);
	if (until === undefined) return false;
	if (until >= now) return true;
	marks.delete(path);
	return false;
}
