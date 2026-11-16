/**
 * The generated story history lives inside a chapter's `memoryContent`, between
 * these markers, so it can be regenerated without erasing what the author wrote
 * there. Pure: shared by the outline's memory generation and the chat's memory
 * tools, which only ever touch the author's part.
 */

export const MEMORY_MARKER_START = '[Novel Writer AI - Generated Story Context]';
export const MEMORY_MARKER_END = '[End Novel Writer AI - Generated Story Context]';
export const GENERATED_MEMORY_BLOCK =
	/\n?\[Novel Writer AI - Generated Story Context\][\s\S]*?\[End Novel Writer AI - Generated Story Context\]\n?/g;

export interface MemoryParts {
	/** What the author (or the chat) wrote. */
	authored: string;
	/** The generated block with its markers, or empty. */
	generated: string;
}

export function splitGeneratedMemory(value: string): MemoryParts {
	const text = value ?? '';
	const generated = text.match(new RegExp(GENERATED_MEMORY_BLOCK.source))?.[0]?.trim() ?? '';
	const authored = text.replace(GENERATED_MEMORY_BLOCK, '').trim();
	return { authored, generated };
}

/** Author's part first, then the generated block, as the outline writes them. */
export function joinGeneratedMemory(parts: MemoryParts): string {
	return [parts.authored.trim(), parts.generated.trim()].filter(Boolean).join('\n\n');
}
