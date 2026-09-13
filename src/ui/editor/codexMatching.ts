import { EditorView, Decoration, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import type { EntradaCodex } from '../../domain/entities/EntradaCodex';

/** Pure regex matching for the codex highlighter: which words in the visible
 * text refer to a tracked codex entry, and the decorations that mark them.
 * No DOM, no tooltips, no CodeMirror wiring beyond reading the view's text. */

export interface KeywordRule {
	regex: RegExp;
	color: string;
	entry: EntradaCodex;
}

export interface MatchRange {
	from: number;
	to: number;
	color: string;
	entry: EntradaCodex;
}

export function stripAccents(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function buildRules(entries: EntradaCodex[]): KeywordRule[] {
	const rules: KeywordRule[] = [];

	for (const entry of entries) {
		if (entry.archivado) continue;
		if (!entry.tracking_por_nombre) continue;
		if (!entry.color) continue;

		const candidates = [entry.nombre, ...(entry.alias || '').split(',')]
			.map(v => v.trim())
			.filter(Boolean);

		const escaped = candidates.map(c => {
			const stripped = stripAccents(entry.case_sensitive ? c : c.toLowerCase());
			return stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}).filter(Boolean);

		if (!escaped.length) continue;

		escaped.sort((a, b) => b.length - a.length);
		const pattern = escaped.join('|');
		const flags = entry.case_sensitive ? 'g' : 'gi';
		try {
			rules.push({
				regex: new RegExp(`(?<=^|[^a-zA-Z0-9])(?:${pattern})(?=$|[^a-zA-Z0-9])`, flags),
				color: entry.color,
				entry,
			});
		} catch {
			// skip invalid regex
		}
	}
	return rules;
}

/** Build a set of ranges that fall inside [[wiki-links]] so we can skip them. */
function findWikiLinkRanges(text: string, offset: number): Array<{ from: number; to: number }> {
	const ranges: Array<{ from: number; to: number }> = [];
	const re = /\[\[([^\]]*)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		ranges.push({ from: offset + m.index, to: offset + m.index + m[0].length });
	}
	return ranges;
}

function isInsideWikiLink(pos: number, end: number, linkRanges: Array<{ from: number; to: number }>): boolean {
	return linkRanges.some(r => pos >= r.from && end <= r.to);
}

export function computeMatches(view: EditorView, rules: KeywordRule[]): MatchRange[] {
	if (!rules.length) return [];

	const ranges: MatchRange[] = [];

	for (const { from, to } of view.visibleRanges) {
		const original = view.state.sliceDoc(from, to);
		const stripped = stripAccents(original);
		const text = stripped.length === original.length ? stripped : original;
		const linkRanges = findWikiLinkRanges(original, from);

		for (const rule of rules) {
			rule.regex.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = rule.regex.exec(text)) !== null) {
				const matchFrom = from + match.index;
				const matchTo = matchFrom + match[0].length;
				if (isInsideWikiLink(matchFrom, matchTo, linkRanges)) continue;
				ranges.push({ from: matchFrom, to: matchTo, color: rule.color, entry: rule.entry });
			}
		}
	}

	ranges.sort((a, b) => a.from - b.from || b.to - a.to);

	const deduped: MatchRange[] = [];
	let lastEnd = -1;
	for (const r of ranges) {
		if (r.from < lastEnd) continue;
		deduped.push(r);
		lastEnd = r.to;
	}
	return deduped;
}

export function buildDecorations(matches: MatchRange[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const cache = new Map<string, Decoration>();

	for (const m of matches) {
		let deco = cache.get(m.color);
		if (!deco) {
			deco = Decoration.mark({
				attributes: {
					style: `color: ${m.color}; text-decoration: underline; text-decoration-color: ${m.color}40;`,
					class: 'nw-codex-highlight',
				},
			});
			cache.set(m.color, deco);
		}
		builder.add(m.from, m.to, deco);
	}

	return builder.finish();
}
