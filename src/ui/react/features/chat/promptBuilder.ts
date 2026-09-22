import { resolvePlaceholders } from '../../../../utils/roleplayPlaceholders';
import type { ChatContextItem, ChatContextKind } from '../../../../domain';
import { renderTemplateWithBlocks } from '../../../../context/promptTemplates';

export type ContextKind = ChatContextKind;
export type ContextItem = ChatContextItem;

export interface PromptBreakdownItem {
	label: string;
	content: string;
}

const CONTEXT_GROUPS: Array<[ContextKind, string]> = [
	['codex', 'Selected Codex entries'], ['chapter', 'Selected chapters'], ['outline', 'Selected outlines'],
	['note', 'Selected notes'], ['folder', 'Selected folders'],
];

/**
 * Assembles every piece that goes into a chat prompt. Shared by `buildPrompt` (the
 * request actually sent) and `buildPromptBreakdown` (the "View context" preview), so
 * the preview can never drift from what is really sent to the model.
 */
function buildPromptParts(
	mensajes: any[],
	contextItems: ContextItem[],
	newUserMessage: string,
	characterContext: ContextItem | null,
	impersonateContext: ContextItem | null,
	activeNoteItem: ContextItem | null,
	chatPromptText?: string,
	toolsBlock?: string,
	storyBible?: string,
	template?: string,
) {
	const selectedBlocks = CONTEXT_GROUPS.map(([kind, title]) => {
		const items = contextItems.filter(item => item.kind === kind);
		const content = items.map(item => {
			return `--- ${item.name}${item.path ? ` (${item.path})` : ''} ---\n${item.content}`;
		}).join('\n\n');
		return content ? `${title}:\n${content}` : '';
	});
	// Active-note: always the currently open file, included separately
	const activeNoteBlock = activeNoteItem
		? `Active note selected:\n--- ${activeNoteItem.name}${activeNoteItem.path ? ` (${activeNoteItem.path})` : ''} ---\n${activeNoteItem.content}`
		: '';

	// {{user}} / {{char}} are resolved before the model reads them: the placeholders
	// are storage, the names are what the conversation is actually about.
	const names = { user: impersonateContext?.name, char: characterContext?.name };
	const history = [...mensajes, { role: 'user', mensaje: newUserMessage }]
		.filter(m => m.role === 'user' || m.role === 'assistant')
		.map(m => ({ role: m.role, content: resolvePlaceholders(m.mensaje ?? '', names) }));

	let roleMode = '';
	if (characterContext) {
		roleMode = `[ROLE MODE: You are roleplaying the character "${characterContext.name}". Always respond IN CHARACTER, using their tone, vocabulary, knowledge and personality. Do NOT break character under any circumstances. Do NOT mention that you are an AI. You are "${characterContext.name}".]\n\nCharacter information:\n${characterContext.content}`;
	}
	let impersonateMode = '';
	if (impersonateContext) {
		impersonateMode = `[IMPERSONATE MODE: The user is roleplaying the character "${impersonateContext.name}". The user IS "${impersonateContext.name}". Treat them as if they were that character. Do NOT refer to them as "user" or "you"; call them "${impersonateContext.name}".]\n\nUser character information:\n${impersonateContext.content}`;
	}
	const userLabel = impersonateContext ? impersonateContext.name : 'User';
	const iaLabel = characterContext ? characterContext.name : 'AI';

	const chatHistoryText = history.map(m => `${m.role === 'user' ? userLabel : 'AI'}: ${m.content}`).join('\n\n');
	const conversation = chatHistoryText
		? `Current conversation:\n${chatHistoryText}` : '';
	const blocks = {
		instructions: chatPromptText ?? '',
		story_bible: storyBible ?? '',
		tools: toolsBlock ?? '',
		role_mode: roleMode,
		impersonate_mode: impersonateMode,
		selected_codex: selectedBlocks[0],
		selected_chapters: selectedBlocks[1],
		selected_outlines: selectedBlocks[2],
		selected_notes: selectedBlocks[3],
		selected_folders: selectedBlocks[4],
		active_note: activeNoteBlock,
		conversation,
		assistant_prefix: `${iaLabel}: `,
	};
	return renderTemplateWithBlocks('chat', template, blocks);
}

/** Prompt builder that injects character persona and chat prompt. */
export function buildPrompt(
	mensajes: any[],
	contextItems: ContextItem[],
	newUserMessage: string,
	characterContext: ContextItem | null,
	impersonateContext: ContextItem | null,
	activeNoteItem: ContextItem | null,
	chatPromptText?: string,
	toolsBlock?: string,
	storyBible?: string,
	template?: string,
): string {
	const parts = buildPromptParts(mensajes, contextItems, newUserMessage, characterContext, impersonateContext, activeNoteItem, chatPromptText, toolsBlock, storyBible, template);
	return parts.prompt;
}

/** Same assembly as `buildPrompt`, plus the per-section content used by the "View context" token table. */
export function buildPromptBreakdown(
	mensajes: any[],
	contextItems: ContextItem[],
	newUserMessage: string,
	characterContext: ContextItem | null,
	impersonateContext: ContextItem | null,
	activeNoteItem: ContextItem | null,
	chatPromptText?: string,
	toolsBlock?: string,
	storyBible?: string,
	template?: string,
): { prompt: string; breakdown: PromptBreakdownItem[] } {
	const parts = buildPromptParts(mensajes, contextItems, newUserMessage, characterContext, impersonateContext, activeNoteItem, chatPromptText, toolsBlock, storyBible, template);
	const prompt = parts.prompt;
	const breakdown: PromptBreakdownItem[] = parts.blocks.map(block => ({
		label: `{{${block.key}}}`,
		content: block.content,
	}));
	return { prompt, breakdown };
}
