import type { EntradaCodex } from '../domain';

/**
 * Finds where a codex entry is mentioned in a text, by its name and aliases.
 * Pure: shared by the Mentions tab of the entry editor and the chat's
 * `find_mentions` tool, so both count the same mentions.
 */

export function stripAccents(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Regex matching the entry's name or any alias as a whole word. */
export function buildEntryRegex(entry: EntradaCodex): RegExp | null {
	const candidates = [entry.nombre, ...(entry.alias || '').split(',')]
		.map((value) => value.trim())
		.filter(Boolean);

	const escaped = candidates.map((candidate) => {
		const cased = entry.case_sensitive ? candidate : candidate.toLowerCase();
		return stripAccents(cased).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}).filter(Boolean);

	if (!escaped.length) return null;
	escaped.sort((first, second) => second.length - first.length);
	const pattern = escaped.join('|');
	const flags = entry.case_sensitive ? 'g' : 'gi';
	try {
		return new RegExp(
			`(?<=^|[^a-zA-Z0-9])(?:${pattern})(?=$|[^a-zA-Z0-9])`,
			flags,
		);
	} catch {
		return null;
	}
}

/**
 * Text to run the regex on. Accents are stripped only when that keeps every
 * position in place, so a match index still points into the original text.
 */
export function searchableText(text: string): string {
	const stripped = stripAccents(text);
	return stripped.length === text.length ? stripped : text;
}

export interface MentionPosition {
	index: number;
	length: number;
}

/** Every mention of the entry in `text`, positions relative to `text`. */
export function findMentions(text: string, entry: EntradaCodex): MentionPosition[] {
	const regex = buildEntryRegex(entry);
	if (!regex) return [];
	const target = searchableText(text);
	const positions: MentionPosition[] = [];
	let match: RegExpExecArray | null;
	while ((match = regex.exec(target)) !== null) {
		positions.push({ index: match.index, length: match[0].length });
		if (match[0].length === 0) regex.lastIndex += 1;
	}
	return positions;
}
