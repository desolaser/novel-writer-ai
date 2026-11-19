import type {
	ChapterFormat,
	InlineSpan,
	ManuscriptBlock,
} from '../../types/ManuscriptExport';
import { spansText } from './inlineMarkup';
import { escapeHtml, escapeMarkdown } from './markup';

/**
 * One chapter as plain text, HTML, Markdown or BBCode: what the author pastes
 * into a web-novel site. Paragraphs are separated by a blank line, which every
 * site's editor keeps.
 */

export interface ChapterRenderInput {
	/** Heading at the top; empty for none. */
	heading: string;
	blocks: ManuscriptBlock[];
	sceneBreak: string;
}

interface Markers {
	/** Wraps formatted text; `text` is already escaped. */
	span: (span: InlineSpan, text: string) => string;
	escape: (text: string) => string;
	heading: (text: string) => string;
	/** A heading written inside the chapter's own text. */
	subheading: (text: string) => string;
	paragraph: (text: string) => string;
	quote: (text: string) => string;
	sceneBreak: (symbol: string) => string;
	join: string;
}

function wrap(text: string, open: string, close: string, on: boolean): string {
	return on ? `${open}${text}${close}` : text;
}

const PLAIN: Markers = {
	span: (_span, text) => text,
	escape: (text) => text,
	heading: (text) => text,
	subheading: (text) => text,
	paragraph: (text) => text,
	quote: (text) => text,
	sceneBreak: (symbol) => symbol,
	join: '\n\n',
};

const HTML: Markers = {
	span: (span, text) => {
		let out = wrap(text, '<em>', '</em>', span.italic);
		out = wrap(out, '<strong>', '</strong>', span.bold);
		return wrap(out, '<s>', '</s>', span.strike);
	},
	escape: escapeHtml,
	heading: (text) => `<h2>${text}</h2>`,
	subheading: (text) => `<h3>${text}</h3>`,
	paragraph: (text) => `<p>${text}</p>`,
	quote: (text) => `<blockquote><p>${text}</p></blockquote>`,
	sceneBreak: (symbol) => `<p style="text-align: center;">${escapeHtml(symbol)}</p>`,
	join: '\n',
};

const MARKDOWN: Markers = {
	span: (span, text) => {
		let out = wrap(text, '*', '*', span.italic);
		out = wrap(out, '**', '**', span.bold);
		return wrap(out, '~~', '~~', span.strike);
	},
	escape: escapeMarkdown,
	heading: (text) => `## ${text}`,
	subheading: (text) => `### ${text}`,
	paragraph: (text) => text,
	quote: (text) => `> ${text}`,
	// A bare "* * *" is a horizontal rule in Markdown, which is what a scene
	// break should become; any other symbol is kept as text.
	sceneBreak: (symbol) => symbol,
	join: '\n\n',
};

const BBCODE: Markers = {
	span: (span, text) => {
		let out = wrap(text, '[i]', '[/i]', span.italic);
		out = wrap(out, '[b]', '[/b]', span.bold);
		return wrap(out, '[s]', '[/s]', span.strike);
	},
	escape: (text) => text,
	heading: (text) => `[b]${text}[/b]`,
	subheading: (text) => `[b]${text}[/b]`,
	paragraph: (text) => text,
	quote: (text) => `[quote]${text}[/quote]`,
	sceneBreak: (symbol) => `[center]${symbol}[/center]`,
	join: '\n\n',
};

const MARKERS: Record<ChapterFormat, Markers> = {
	plain: PLAIN,
	html: HTML,
	markdown: MARKDOWN,
	bbcode: BBCODE,
};

function renderSpans(spans: InlineSpan[], markers: Markers): string {
	return spans
		.map((span) => markers.span(span, markers.escape(span.text)))
		.join('');
}

function renderBlock(block: ManuscriptBlock, markers: Markers, sceneBreak: string): string {
	switch (block.kind) {
		case 'sceneBreak':
			return markers.sceneBreak(sceneBreak);
		case 'heading':
			return markers.subheading(renderSpans(block.spans, markers));
		case 'quote':
			return markers.quote(renderSpans(block.spans, markers));
		default:
			return markers.paragraph(renderSpans(block.spans, markers));
	}
}

export function renderChapter(input: ChapterRenderInput, format: ChapterFormat): string {
	const markers = MARKERS[format];
	const parts: string[] = [];
	if (input.heading.trim()) {
		parts.push(markers.heading(markers.escape(input.heading.trim())));
	}
	for (const block of input.blocks) {
		parts.push(renderBlock(block, markers, input.sceneBreak));
	}
	return parts.join(markers.join);
}

/** File extension of a chapter saved in a format. */
export function chapterFileExtension(format: ChapterFormat): string {
	if (format === 'html') return 'html';
	if (format === 'markdown') return 'md';
	return 'txt';
}

/**
 * Drops a heading at the very top that repeats the chapter's own name, so an
 * export that adds its heading does not show the title twice.
 */
export function withoutRepeatedTitle(
	blocks: ManuscriptBlock[],
	chapterName: string,
): ManuscriptBlock[] {
	const first = blocks[0];
	if (!first || first.kind !== 'heading') return blocks;
	const normalize = (text: string) => text.trim().toLowerCase();
	if (normalize(spansText(first.spans)) !== normalize(chapterName)) return blocks;
	return blocks.slice(1);
}
