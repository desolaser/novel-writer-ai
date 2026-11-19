import type { InlineSpan } from '../../types/ManuscriptExport';

/**
 * Markdown emphasis inside one line: ***bold italic***, **bold**, __bold__,
 * *italic*, _italic_, ~~strike~~ and ==highlight== (kept as plain text).
 * A backslash escapes a marker, as in Markdown.
 */

interface Style {
	italic: boolean;
	bold: boolean;
	strike: boolean;
}

interface Rule {
	pattern: RegExp;
	apply: (style: Style) => Style;
}

// Order matters: the longer markers are tried first at the same position.
const RULES: Rule[] = [
	{
		pattern: /\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/,
		apply: (style) => ({ ...style, bold: true, italic: true }),
	},
	{
		pattern: /\*\*(?=\S)([\s\S]*?\S)\*\*/,
		apply: (style) => ({ ...style, bold: true }),
	},
	{
		pattern: /__(?=\S)([\s\S]*?\S)__/,
		apply: (style) => ({ ...style, bold: true }),
	},
	{
		// The closing "*" is not part of a "**": "*a **b** c*" is all italic.
		pattern: /\*(?![\s*])([\s\S]*?[^\s*])\*(?!\*)/,
		apply: (style) => ({ ...style, italic: true }),
	},
	{
		// Underscores inside a word (snake_case) are not emphasis.
		pattern: /(?<![\p{L}\p{N}])_(?=\S)([\s\S]*?\S)_(?![\p{L}\p{N}])/u,
		apply: (style) => ({ ...style, italic: true }),
	},
	{
		pattern: /~~(?=\S)([\s\S]*?\S)~~/,
		apply: (style) => ({ ...style, strike: true }),
	},
	{
		pattern: /==(?=\S)([\s\S]*?\S)==/,
		apply: (style) => style,
	},
];

// Escaped markers become private-use characters while parsing, so no rule
// sees them, and turn back into the plain character at the end.
const ESCAPABLE = '\\*_~=`#>[]';
const ESCAPE_BASE = 0xe000;

function protectEscapes(text: string): string {
	return text.replace(/\\(.)/g, (whole, char: string) => {
		const index = ESCAPABLE.indexOf(char);
		return index < 0 ? whole : String.fromCharCode(ESCAPE_BASE + index);
	});
}

function restoreEscapes(text: string): string {
	return text.replace(/[-]/g, (char) =>
		ESCAPABLE[char.charCodeAt(0) - ESCAPE_BASE] ?? char);
}

interface FoundRule {
	rule: Rule;
	match: RegExpExecArray;
}

function earliestRule(text: string): FoundRule | null {
	let best: FoundRule | null = null;
	for (const rule of RULES) {
		const match = rule.pattern.exec(text);
		if (!match) continue;
		if (!best || match.index < best.match.index) best = { rule, match };
	}
	return best;
}

function pushSpan(spans: InlineSpan[], text: string, style: Style): void {
	if (!text) return;
	const last = spans[spans.length - 1];
	const same = last
		&& last.italic === style.italic
		&& last.bold === style.bold
		&& last.strike === style.strike;
	if (same) {
		last.text += text;
	} else {
		spans.push({ text, ...style });
	}
}

function parseInto(text: string, style: Style, spans: InlineSpan[]): void {
	let rest = text;
	while (rest) {
		const found = earliestRule(rest);
		if (!found) {
			pushSpan(spans, rest, style);
			return;
		}
		const { rule, match } = found;
		pushSpan(spans, rest.slice(0, match.index), style);
		parseInto(match[1], rule.apply(style), spans);
		rest = rest.slice(match.index + match[0].length);
	}
}

/** Spans of one line of Markdown. */
export function parseInline(line: string): InlineSpan[] {
	const spans: InlineSpan[] = [];
	const plain: Style = { italic: false, bold: false, strike: false };
	parseInto(protectEscapes(line), plain, spans);
	for (const span of spans) span.text = restoreEscapes(span.text);
	return spans;
}

/** The text of the spans without any formatting. */
export function spansText(spans: InlineSpan[]): string {
	return spans.map((span) => span.text).join('');
}
