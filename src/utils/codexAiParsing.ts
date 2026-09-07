import type { CodexAiChoice, CodexAiField, CodexAiFieldType } from '../types/CodexAi';

/**
 * Parsing of AI answers for Codex entries. Pure and defensive on purpose: weaker
 * models produce sloppy output, so every helper degrades to "nothing usable for
 * this field" instead of throwing and losing the whole answer.
 */

export interface ParsedSection {
	header: string;
	body: string;
}

/** Lowercase, accent- and punctuation-free form used for every comparison. */
export function normalizeForMatch(value: string): string {
	return (value || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Removes a code fence wrapping the whole answer, which many models add unprompted. */
export function stripCodeFence(text: string): string {
	const trimmed = (text || '').trim();
	const fenced = trimmed.match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```$/);
	return fenced ? fenced[1].trim() : trimmed;
}

const BRACKET_HEADER = /^[ \t]*\[{1,2}[ \t]*([^\]\r\n]+?)[ \t]*\]{1,2}[ \t]*:?[ \t]*$/;
const MARKDOWN_HEADER = /^[ \t]*#{1,6}[ \t]*([^\r\n]+?)[ \t]*:?[ \t]*$/;
const BOLD_HEADER = /^[ \t]*\*\*([^\r\n*]+?)\*\*[ \t]*:?[ \t]*$/;

function splitByHeader(lines: string[], pattern: RegExp): ParsedSection[] {
	const sections: ParsedSection[] = [];
	let current: { header: string; body: string[] } | null = null;
	for (const line of lines) {
		const match = line.match(pattern);
		if (match) {
			if (current) sections.push({ header: current.header, body: current.body.join('\n').trim() });
			current = { header: match[1].trim(), body: [] };
			continue;
		}
		if (current) current.body.push(line);
	}
	if (current) sections.push({ header: current.header, body: current.body.join('\n').trim() });
	return sections.filter((section) => section.header);
}

/**
 * Splits a delimited answer into sections. `[[Header]]` is the requested format;
 * markdown and bold headings are accepted as fallbacks so a model that ignores the
 * instructions still produces something. Returns [] when no layout is recognizable.
 */
export function parseDelimitedSections(text: string): ParsedSection[] {
	const lines = stripCodeFence(text).split(/\r?\n/);
	for (const pattern of [BRACKET_HEADER, MARKDOWN_HEADER, BOLD_HEADER]) {
		const sections = splitByHeader(lines, pattern);
		if (sections.length) return sections;
	}
	return [];
}

/** Finds the field a parsed section header refers to, tolerating prefixes and casing. */
export function matchFieldByHeader(header: string, fields: CodexAiField[]): CodexAiField | null {
	const cleaned = normalizeForMatch(header.replace(/^\s*(detail|detalle|field|campo)\s*:\s*/i, ''));
	if (!cleaned) return null;
	const byLabel = fields.find((field) => normalizeForMatch(field.label) === cleaned);
	if (byLabel) return byLabel;
	const byKey = fields.find((field) => normalizeForMatch(field.key) === cleaned);
	if (byKey) return byKey;
	return fields.find((field) => {
		const label = normalizeForMatch(field.label);
		return label.length > 2 && (label.includes(cleaned) || cleaned.includes(label));
	}) ?? null;
}

const SINGLE_LINE_TYPES: CodexAiFieldType[] = ['alias', 'line', 'dropdown', 'codex_ref'];

/**
 * Turns a raw model answer into the value for a field: drops fences, quotes, the
 * echoed field name and, for single-line fields, everything past the first line.
 */
export function cleanGeneratedValue(raw: string, type: CodexAiFieldType, label: string): string {
	let value = stripCodeFence(raw);
	// Drop an echoed "Field name:" prefix without having to escape the label into a regex.
	const wantedLabel = normalizeForMatch(label);
	value = value.replace(/^\s*(?:\[\[)?\s*([^\n:]{1,60}?)\s*(?:\]\])?\s*:\s*/, (match, prefix: string) =>
		normalizeForMatch(prefix) === wantedLabel ? '' : match);
	if (SINGLE_LINE_TYPES.includes(type)) {
		const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
		value = firstLine.replace(/^[-*\u2022]\s+/, '');
	}
	value = value.trim();
	const quoted = value.match(/^"([\s\S]*)"$/) ?? value.match(/^'([\s\S]*)'$/);
	if (quoted) value = quoted[1].trim();
	return value;
}

/** Resolves free text to one of the allowed choices, or null when nothing matches. */
export function matchChoice(text: string, choices: CodexAiChoice[]): CodexAiChoice | null {
	const needle = normalizeForMatch(text);
	if (!needle) return null;
	const names = (choice: CodexAiChoice) => [choice.name, ...(choice.aliases ?? [])].map(normalizeForMatch).filter(Boolean);
	const exact = choices.find((choice) => names(choice).includes(needle));
	if (exact) return exact;
	const contained = choices.find((choice) => names(choice).some((name) => name.length > 2 && needle.includes(name)));
	if (contained) return contained;
	return choices.find((choice) => names(choice).some((name) => name.length > 2 && name.includes(needle))) ?? null;
}

export interface ResolvedValue {
	/** Text shown to the author. */
	text: string;
	/** Value to store (option id / entry id for choice fields), null when unusable. */
	value: string | null;
	/** True when a choice field got an answer outside its allowed values. */
	unmatched: boolean;
}

/** Cleans a raw answer and, for choice fields, resolves it to the id that gets stored. */
export function resolveFieldValue(field: CodexAiField, raw: string): ResolvedValue {
	const cleaned = cleanGeneratedValue(raw, field.type, field.label);
	if (field.type === 'dropdown' || field.type === 'codex_ref') {
		const choice = matchChoice(cleaned, field.choices ?? []);
		if (!choice) return { text: cleaned, value: null, unmatched: true };
		return { text: choice.name, value: choice.id, unmatched: false };
	}
	return { text: cleaned, value: cleaned, unmatched: false };
}
