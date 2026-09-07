import type { ChatContextItem, ChatContextKind } from '../domain';

/**
 * Rendering of user-selected context items into a prompt block. Shared by every
 * feature that lets the author attach codex entries, chapters, outlines or notes.
 */

const GROUP_TITLES: Array<[ChatContextKind, string]> = [
	['codex', 'Selected codex entries'],
	['chapter', 'Selected chapters'],
	['outline', 'Selected outlines'],
	['note', 'Selected notes'],
	['folder', 'Selected folders'],
	['active-note', 'Active note'],
	['character', 'Selected characters'],
];

/** Groups items by kind and renders them as a readable block. Empty when there is nothing selected. */
export function buildContextItemsBlock(items: ChatContextItem[]): string {
	if (!items.length) return '';
	return GROUP_TITLES.map(([kind, title]) => {
		const group = items.filter((item) => item.kind === kind);
		if (!group.length) return '';
		const body = group.map((item) => `--- ${item.name} ---\n${(item.content || '').trim()}`).join('\n\n');
		return `${title}:\n${body}`;
	}).filter(Boolean).join('\n\n');
}
