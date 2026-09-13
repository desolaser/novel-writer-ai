import { resolvePlaceholders } from '../../../../utils/roleplayPlaceholders';
import type { ChatContextItem, ChatContextKind } from '../../../../domain';

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
) {
	const contextPrompt = CONTEXT_GROUPS.map(([kind, title]) => {
		const items = contextItems.filter(item => item.kind === kind);
		if (!items.length) return '';
		return `${title}:\n${items.map(item => `--- ${item.name}${item.path ? ` (${item.path})` : ''} ---\n${item.content}`).join('\n\n')}`;
	}).filter(Boolean).join('\n\n');

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

	let systemPrompt = '';
	if (chatPromptText) {
		systemPrompt = `${chatPromptText}\n\n`;
	}
	// What the novel is, and the language it is written in: these instructions
	// are in English no matter what language the author writes the story in.
	if (storyBible) {
		systemPrompt += `${storyBible}\n\n`;
	}
	if (toolsBlock) {
		systemPrompt += `${toolsBlock}\n\n`;
	}
	if (characterContext) {
		systemPrompt += `[ROLE MODE: You are roleplaying the character "${characterContext.name}". Always respond IN CHARACTER, using their tone, vocabulary, knowledge and personality. Do NOT break character under any circumstances. Do NOT mention that you are an AI. You are "${characterContext.name}".]\n\nCharacter information:\n${characterContext.content}\n\n`;
	}
	if (impersonateContext) {
		systemPrompt += `[IMPERSONATE MODE: The user is roleplaying the character "${impersonateContext.name}". The user IS "${impersonateContext.name}". Treat them as if they were that character. Do NOT refer to them as "user" or "you"; call them "${impersonateContext.name}".]\n\nUser character information:\n${impersonateContext.content}\n\n`;
	}
	const userLabel = impersonateContext ? impersonateContext.name : 'User';
	const iaLabel = characterContext ? characterContext.name : 'AI';

	const combinedPrompt = [contextPrompt, activeNoteBlock].filter(Boolean).join('\n\n');
	const contextBlock = combinedPrompt ? `Context explicitly selected by the user:\n${combinedPrompt}\n\n` : '';
	const chatHistoryText = history.map(m => `${m.role === 'user' ? userLabel : 'AI'}: ${m.content}`).join('\n\n');
	const historyBlock = chatHistoryText ? `Current conversation:\n${chatHistoryText}\n\n` : '';

	return { systemPrompt, contextPrompt, activeNoteBlock, contextBlock, historyBlock, chatHistoryText, iaLabel };
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
): string {
	const parts = buildPromptParts(mensajes, contextItems, newUserMessage, characterContext, impersonateContext, activeNoteItem, chatPromptText, toolsBlock, storyBible);
	return `${parts.systemPrompt}${parts.contextBlock}${parts.historyBlock}\n\n${parts.iaLabel}: `;
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
): { prompt: string; breakdown: PromptBreakdownItem[] } {
	const parts = buildPromptParts(mensajes, contextItems, newUserMessage, characterContext, impersonateContext, activeNoteItem, chatPromptText, toolsBlock, storyBible);
	const prompt = `${parts.systemPrompt}${parts.contextBlock}${parts.historyBlock}\n\n${parts.iaLabel}: `;
	const breakdown: PromptBreakdownItem[] = [
		{ label: 'System Prompt', content: parts.systemPrompt },
		{ label: 'Story Bible', content: storyBible ?? '' },
		{ label: 'Selected Context', content: parts.contextPrompt },
		{ label: 'Active Note Block', content: parts.activeNoteBlock },
		{ label: 'Chat History', content: parts.chatHistoryText },
	];
	return { prompt, breakdown };
}
