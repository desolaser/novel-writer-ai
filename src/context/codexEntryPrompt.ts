import type { CodexAiField } from '../types/CodexAi';

/**
 * Prompt building for AI-assisted Codex entries. Pure: no Obsidian, no React, no I/O.
 *
 * Two shapes are produced:
 *  - `buildCodexFieldPrompt`: one field, plain-text answer, nothing to parse.
 *  - `buildCodexEntryPrompt`: several fields in one call, answered as `[[Header]]`
 *    sections. Sections are used instead of JSON because a malformed section only
 *    loses that field, while a malformed JSON object loses the whole answer.
 *
 * `EntradaCodex.notas` is private to the author and is never part of any prompt.
 */

export interface CodexAiPromptContext {
	entryName: string;
	category: string;
	tags: string[];
	/** Every field of the entry, used to describe what is already known. */
	fields: CodexAiField[];
	/** Free-text instructions written by the author in the AI panel. */
	instructions: string;
	/** Material picked with the context selector (codex entries, chapters, notes...). */
	extraContext: string;
}

/** Section header used by the delimited output format. */
export function sectionHeader(field: CodexAiField): string {
	return `[[${field.label}]]`;
}

function choiceList(field: CodexAiField): string {
	return (field.choices ?? []).map((choice) => `- ${choice.name}`).join('\n');
}

/** Per-type instruction telling the model what shape the answer must have. */
export function fieldFormatInstruction(field: CodexAiField): string {
	switch (field.type) {
		case 'alias':
			return 'Answer with 2 to 4 alternate names or nicknames, separated by commas, on a single line.';
		case 'line':
			return 'Answer with a single short line of a few words. Do not write a paragraph.';
		case 'dropdown':
			return `Answer with exactly one of these options, copied verbatim:\n${choiceList(field)}`;
		case 'codex_ref':
			return `Answer with exactly one of these entry names, copied verbatim:\n${choiceList(field)}`;
		case 'text':
		default:
			return 'Answer with one or two paragraphs of prose.';
	}
}

function fieldGuideLine(field: CodexAiField): string {
	const hint = field.aiHint?.trim() ? ` ${field.aiHint.trim()}` : '';
	return `- ${field.label}: ${fieldFormatInstruction(field).replace(/\n/g, ' ')}${hint}`;
}

/** Human-readable dump of what the entry already contains. Empty fields are listed as unknown. */
export function buildEntryStateBlock(fields: CodexAiField[]): string {
	const known = fields.filter((field) => field.currentText.trim());
	const unknown = fields.filter((field) => !field.currentText.trim());
	const parts: string[] = [];
	if (known.length) {
		parts.push('Known so far:');
		known.forEach((field) => parts.push(`${field.label}: ${field.currentText.trim()}`));
	}
	if (unknown.length) {
		parts.push(`Still unknown: ${unknown.map((field) => field.label).join(', ')}`);
	}
	return parts.join('\n');
}

function buildHeader(context: CodexAiPromptContext): string[] {
	const parts: string[] = [];
	parts.push('--- ENTRY ---');
	parts.push(`Name: ${context.entryName || '(unnamed)'}`);
	parts.push(`Category: ${context.category || 'Uncategorized'}`);
	if (context.tags.length) parts.push(`Tags: ${context.tags.join(', ')}`);
	const state = buildEntryStateBlock(context.fields);
	if (state) parts.push(state);
	parts.push('--- END ENTRY ---');
	if (context.extraContext.trim()) {
		parts.push('');
		parts.push('--- REFERENCE MATERIAL ---');
		parts.push(context.extraContext.trim());
		parts.push('--- END REFERENCE MATERIAL ---');
	}
	if (context.instructions.trim()) {
		parts.push('');
		parts.push(`Author instructions: ${context.instructions.trim()}`);
	}
	return parts;
}

/** Prompt for a single field. The whole answer is the value, so there is nothing to parse. */
export function buildCodexFieldPrompt(context: CodexAiPromptContext, field: CodexAiField): string {
	const parts: string[] = [];
	parts.push('You are helping an author write one field of a worldbuilding codex entry.');
	parts.push('Stay consistent with everything already known about the entry.');
	parts.push('');
	parts.push(...buildHeader(context));
	parts.push('');
	parts.push(`TASK: write the value of the field "${field.label}".`);
	parts.push(fieldFormatInstruction(field));
	if (field.aiHint?.trim()) parts.push(field.aiHint.trim());
	if (field.currentText.trim()) {
		parts.push(`This field currently reads: ${field.currentText.trim()}`);
		parts.push('Write a new version of it.');
	}
	parts.push('');
	parts.push('Output the value only: no field name, no preamble, no explanation, no quotes, no markdown.');
	return parts.join('\n');
}

/**
 * Prompt for several fields in a single call, answered as `[[Header]]` sections.
 * Unknown or missing sections are simply skipped by the parser, so a partial or
 * sloppy answer still yields usable proposals.
 */
export function buildCodexEntryPrompt(context: CodexAiPromptContext, targets: CodexAiField[]): string {
	const parts: string[] = [];
	parts.push('You are helping an author write a worldbuilding codex entry.');
	parts.push('Stay consistent with everything already known about the entry.');
	parts.push('');
	parts.push(...buildHeader(context));
	parts.push('');
	parts.push('TASK: write the following fields.');
	parts.push('Answer using EXACTLY this layout, each header alone on its own line:');
	parts.push('');
	targets.forEach((field) => {
		parts.push(sectionHeader(field));
		parts.push('(value here)');
	});
	parts.push('');
	parts.push('Rules:');
	parts.push('- Copy every header exactly as written above, including the double brackets.');
	parts.push('- Write the value on the lines below its header.');
	parts.push('- Write nothing before the first header and add no sections of your own.');
	parts.push('- Do not use JSON, code fences or markdown headings.');
	parts.push('');
	parts.push('Field guide:');
	targets.forEach((field) => parts.push(fieldGuideLine(field)));
	return parts.join('\n');
}
