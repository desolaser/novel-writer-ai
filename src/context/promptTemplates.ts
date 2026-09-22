import type { PromptType } from '../domain/entities/CustomPrompt';

export const TEXT_TEMPLATE = `{{codex}}

{{story_bible}}

{{memory}}

{{author_note}}

{{chapter_outline}}

{{instructions}}

{{manuscript}}`;

export const CHAT_TEMPLATE = `{{instructions}}

{{story_bible}}

{{tools}}

{{role_mode}}

{{impersonate_mode}}

{{selected_codex}}

{{selected_chapters}}

{{selected_outlines}}

{{selected_notes}}

{{selected_folders}}

{{active_note}}

{{conversation}}

{{assistant_prefix}}`;

const TEXT_KEYS = [
	'instructions', 'codex', 'story_bible', 'memory', 'author_note',
	'chapter_outline', 'manuscript',
];

const CHAT_KEYS = [
	'instructions', 'story_bible', 'tools', 'role_mode',
	'impersonate_mode', 'selected_codex', 'selected_chapters',
	'selected_outlines', 'selected_notes', 'selected_folders',
	'active_note', 'conversation', 'assistant_prefix',
];

const REQUIRED: Record<PromptType, string[]> = {
	text: ['manuscript'],
	chat: [
		'tools', 'role_mode', 'impersonate_mode',
		'conversation', 'assistant_prefix',
	],
};

export function templateKeys(type: PromptType): string[] {
	return type === 'text' ? TEXT_KEYS : CHAT_KEYS;
}

export function defaultTemplate(type: PromptType): string {
	return type === 'text' ? TEXT_TEMPLATE : CHAT_TEMPLATE;
}

export function validateTemplate(type: PromptType, template: string): string | null {
	const matches = [...template.matchAll(/{{\s*([^{}]+?)\s*}}/g)];
	const found = matches.map(match => match[1].trim());
	const unmatched = template.replace(/{{\s*([^{}]+?)\s*}}/g, '');
	if (unmatched.includes('{{') || unmatched.includes('}}')) {
		return 'A placeholder is incomplete or malformed.';
	}
	const allowed = templateKeys(type);
	const unknown = found.find(key => !allowed.includes(key));
	if (unknown) return `{{${unknown}}} is not available for ${type} prompts.`;
	for (const key of REQUIRED[type]) {
		const count = found.filter(value => value === key).length;
		if (count !== 1) return `{{${key}}} must appear exactly once.`;
	}
	return null;
}

export function renderTemplate(
	type: PromptType,
	template: string | undefined,
	blocks: Record<string, string>,
): string {
	return renderTemplateWithBlocks(type, template, blocks).prompt;
}

export interface ResolvedTemplateBlock {
	key: string;
	content: string;
}

export function renderTemplateWithBlocks(
	type: PromptType,
	template: string | undefined,
	blocks: Record<string, string>,
): { prompt: string; blocks: ResolvedTemplateBlock[] } {
	const source = template ?? defaultTemplate(type);
	const error = validateTemplate(type, source);
	if (error) throw new Error(error);
	const resolvedBlocks = [...source.matchAll(/{{\s*([^{}]+?)\s*}}/g)]
		.map(match => {
			const key = match[1].trim();
			return { key, content: blocks[key] ?? '' };
		});
	const prompt = source.split(/\r?\n[ \t]*\r?\n+/)
		.map(section => section.replace(
			/{{\s*([^{}]+?)\s*}}/g,
			(_match, key: string) => blocks[key.trim()] ?? '',
		))
		.filter(section => section.trim().length > 0)
		.join('\n\n');
	return { prompt, blocks: resolvedBlocks };
}
