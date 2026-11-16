import { Keymap, type PaneType, type UserEvent, type WorkspaceLeaf } from "obsidian";
import type NovelWriterPlugin from "../../../main";
import { VIEW_TYPE_CODEX_ENTRY } from "./CodexEntryView";

function entryIdOf(leaf: WorkspaceLeaf): unknown {
	return leaf.getViewState().state?.entryId;
}

/** Last time the leaf was focused; internal to Obsidian, 0 when missing. */
function activeTimeOf(leaf: WorkspaceLeaf): number {
	return (leaf as unknown as { activeTime?: number }).activeTime ?? 0;
}

/** Codex leaves that may be replaced: not pinned, most recently used first. */
function reusableEntryLeaves(leaves: WorkspaceLeaf[]): WorkspaceLeaf[] {
	return leaves
		.filter((leaf) => !leaf.getViewState().pinned)
		.sort((first, second) => activeTimeOf(second) - activeTimeOf(first));
}

/**
 * New leaf in the main area. The click usually comes from the sidebar, so the
 * most recent main-area leaf is focused first: `getLeaf` creates the new
 * tab or split next to the active leaf.
 */
function createMainLeaf(plugin: NovelWriterPlugin, paneType: PaneType): WorkspaceLeaf {
	const workspace = plugin.app.workspace;
	const anchor = workspace.getMostRecentLeaf(workspace.rootSplit);
	if (anchor && paneType === "tab" && anchor.view.getViewType() === "empty") {
		// An empty "New tab" is there to be used.
		return anchor;
	}
	if (anchor) workspace.setActiveLeaf(anchor, { focus: false });
	return workspace.getLeaf(paneType);
}

/**
 * How the click asks to open the entry, with Obsidian's own rules: a plain
 * click returns false; middle click or Ctrl/Cmd-click a new tab; with Alt a
 * split; with Alt+Shift a window.
 */
export function paneTypeFor(event?: UserEvent | null): PaneType | false {
	const type = Keymap.isModEvent(event);
	if (type === true) return "tab";
	return type || false;
}

/**
 * Opens a codex entry in the main area, the way Obsidian opens notes.
 *
 * A plain click replaces the codex entry used last, so reading one entry after
 * another does not pile up tabs; the manuscript is never replaced. With no
 * entry open, it opens in a new tab. `paneType` (from `paneTypeFor`) forces a
 * new tab, split or window. An entry already open is brought to the front.
 */
export async function openCodexEntry(
	plugin: NovelWriterPlugin,
	entryId: string,
	paneType: PaneType | false = false,
): Promise<void> {
	const workspace = plugin.app.workspace;
	const leaves = workspace.getLeavesOfType(VIEW_TYPE_CODEX_ENTRY);
	const existing = leaves.find((leaf) => entryIdOf(leaf) === entryId);
	if (existing && !paneType) {
		await workspace.revealLeaf(existing);
		workspace.setActiveLeaf(existing, { focus: true });
		return;
	}

	const leaf = paneType
		? createMainLeaf(plugin, paneType)
		: reusableEntryLeaves(leaves)[0] ?? createMainLeaf(plugin, "tab");
	await leaf.setViewState({
		type: VIEW_TYPE_CODEX_ENTRY,
		state: { entryId },
		active: true,
	});
	await workspace.revealLeaf(leaf);
}
