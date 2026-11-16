import { Setting } from 'obsidian';
import type { SettingsService } from '../infrastructure/settings/settings-service';
import { buildToolPrompt } from '../context/toolPrompt';
import { TOOL_DEFINITIONS, TOOL_GROUPS, type ToolGroup } from '../tools/registry';
import type { NoteAccess } from '../types/AiTool';

const NOTE_ACCESS: Array<[NoteAccess, string]> = [
	['vault', 'Any note in the vault'],
	['novel', 'Only notes inside the novel folder'],
	['off', 'No notes'],
];

const INTRO = [
	'The chat\'s AI uses tools to read and change your novel: chapters, outlines, '
		+ 'the codex, the Novel Setup and more. Each switch turns one group of tools '
		+ 'on or off, for every chat.',
	'A group that is off is not even mentioned to the AI: it cannot use those tools, '
		+ 'and every message costs fewer tokens. Tools that change the novel still wait '
		+ 'for your approval unless Auto-approve is on, and deleting a chapter always asks.',
	'The Tools toggle in the chat footer turns all of them off for a single chat.',
];

/** Rough tokens a group adds to every chat message: its share of the tool instructions. */
function groupCost(group: ToolGroup): number {
	const all = buildToolPrompt(TOOL_DEFINITIONS).length;
	const without = buildToolPrompt(
		TOOL_DEFINITIONS.filter((tool) => !group.tools.includes(tool)),
	).length;
	return Math.round((all - without) / 4 / 10) * 10;
}

function groupDescription(group: ToolGroup): DocumentFragment {
	const fragment = document.createDocumentFragment();
	fragment.append(`${group.description} About ${groupCost(group)} tokens per message.`);
	fragment.append(document.createElement('br'));
	const names = document.createElement('span');
	names.className = 'nw-setting-tool-names';
	names.textContent = `Tools: ${group.tools.map((tool) => tool.name).join(', ')}`;
	fragment.append(names);
	return fragment;
}

/**
 * Which tools the chat may use. A group turned off is left out of the prompt,
 * so it also stops costing tokens on every request.
 */
export function renderChatToolSettings(host: HTMLElement, settings: SettingsService): void {
	host.createEl('h4', { text: 'Chat tools' });
	for (const paragraph of INTRO) {
		host.createEl('p', { text: paragraph, cls: 'setting-item-description' });
	}
	const data = settings.data;
	for (const group of TOOL_GROUPS) {
		new Setting(host)
			.setName(group.label)
			.setDesc(groupDescription(group))
			.addToggle((toggle) => toggle
				.setValue(data.chatToolGroups[group.id] !== false)
				.onChange(async (value) => {
					data.chatToolGroups = { ...data.chatToolGroups, [group.id]: value };
					await settings.save();
				}));
	}
	new Setting(host)
		.setName('Notes the chat can read')
		.setDesc(
			'Which notes the read_note tool may open, for research or worldbuilding '
			+ 'kept outside the novel. Obsidian\'s settings folder is never readable. '
			+ 'Needs the Workspace group.'
		)
		.addDropdown((dropdown) => {
			for (const [value, label] of NOTE_ACCESS) dropdown.addOption(value, label);
			dropdown.setValue(data.chatNoteAccess);
			dropdown.onChange(async (value) => {
				data.chatNoteAccess = value as NoteAccess;
				await settings.save();
			});
		});
}
