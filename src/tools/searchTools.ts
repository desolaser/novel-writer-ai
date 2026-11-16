import type { ToolContext } from '../interfaces/tool-context';
import { findMentions } from '../utils/codexMentions';
import { orderedChapters } from './chapterTools';
import { resolveEntry, visibleEntries } from './codexShared';

/**
 * Text search across the novel: chapter manuscripts, outlines and codex
 * entries. Lets the model find where something is mentioned without reading
 * every chapter. Private codex notes and entries hidden from the AI are never
 * searched or returned.
 */

const MAX_HITS = 40;
const SNIPPET_RADIUS = 90;

function snippet(text: string, index: number, length: number): string {
	const start = Math.max(0, index - SNIPPET_RADIUS);
	const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
	const body = text.slice(start, end).replace(/\s+/g, ' ').trim();
	return `${start > 0 ? '...' : ''}${body}${end < text.length ? '...' : ''}`;
}

/** Every position of `needle` in `text`, case-insensitive. */
function findAll(text: string, needle: string): number[] {
	const haystack = text.toLowerCase();
	const positions: number[] = [];
	let from = haystack.indexOf(needle);
	while (from !== -1) {
		positions.push(from);
		from = haystack.indexOf(needle, from + needle.length);
	}
	return positions;
}

function wants(scope: string, area: string): boolean {
	return scope === 'all' || scope === area;
}

export async function searchNovel(
	args: Record<string, string>,
	context: ToolContext,
): Promise<string> {
	const query = (args.query ?? '').trim();
	if (!query) throw new Error('Argument "query" is required.');
	const needle = query.toLowerCase();
	const scope = (args.scope ?? 'all').trim().toLowerCase() || 'all';
	const hits: string[] = [];
	let total = 0;
	const add = (label: string, text: string) => {
		for (const position of findAll(text, needle)) {
			total += 1;
			if (hits.length < MAX_HITS) {
				hits.push(`${label}: ${snippet(text, position, needle.length)}`);
			}
		}
	};

	const chapters = orderedChapters(context);
	for (const [index, chapter] of chapters.entries()) {
		const label = `#${index + 1} ${chapter.nombre}`;
		if (wants(scope, 'chapters')) {
			add(`${label} (text)`, await context.readChapterText(chapter.id_capitulo));
		}
		if (wants(scope, 'outlines')) add(`${label} (outline)`, chapter.outline ?? '');
	}
	if (wants(scope, 'codex')) {
		for (const entry of visibleEntries(context)) {
			const text = [entry.nombre, entry.alias, entry.descripcion]
				.filter(Boolean)
				.join('\n');
			add(`Codex "${entry.nombre}"`, text);
		}
	}

	if (!total) return `No matches for "${query}".`;
	const shown = hits.join('\n');
	const more = total > hits.length
		? `\n(${total - hits.length} more matches not shown)`
		: '';
	return `${total} match${total === 1 ? '' : 'es'} for "${query}":\n${shown}${more}`;
}

const MAX_MENTION_SNIPPETS = 3;

/** Where a codex entry is mentioned in the manuscript, by name or alias. */
export async function findMentionsTool(
	args: Record<string, string>,
	context: ToolContext,
): Promise<string> {
	const entry = resolveEntry(args.entry ?? '', context);
	const lines: string[] = [];
	let total = 0;
	let chapterCount = 0;

	for (const [index, chapter] of orderedChapters(context).entries()) {
		const text = await context.readChapterText(chapter.id_capitulo);
		const positions = findMentions(text, entry);
		if (!positions.length) continue;
		total += positions.length;
		chapterCount += 1;
		lines.push(`#${index + 1} ${chapter.nombre} (${positions.length}):`);
		for (const position of positions.slice(0, MAX_MENTION_SNIPPETS)) {
			lines.push(`  ${snippet(text, position.index, position.length)}`);
		}
	}

	if (!total) return `"${entry.nombre}" is not mentioned in any chapter.`;
	const times = `${total} time${total === 1 ? '' : 's'}`;
	const chapters = `${chapterCount} chapter${chapterCount === 1 ? '' : 's'}`;
	const header = `"${entry.nombre}" is mentioned ${times} in ${chapters}:`;
	return [header, ...lines].join('\n');
}
