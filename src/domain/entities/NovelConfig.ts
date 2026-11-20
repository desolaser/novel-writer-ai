/**
 * Settings of one novel that override the global ones, stored in the novel's
 * `__config.json`. Today: the memory and author note of the whole novel, which
 * sit between a chapter's own and the global ones in the prompt cascade.
 */
export interface NovelConfig {
	memoryContent?: string;
	authorNote?: string;
	/** Names the Metrics tab no longer suggests for a codex entry. */
	ignoredNames?: string[];
}
