import type {
	ExportBook,
	InlineSpan,
	ManuscriptBlock,
} from '../../types/ManuscriptExport';
import { renderChapter } from './chapterRenderers';
import { escapeHtml, escapeMarkdown } from './markup';

/** The whole novel as one Markdown file or one HTML page. */

export function renderBookMarkdown(book: ExportBook): string {
	const parts: string[] = [];
	if (book.titlePage) {
		parts.push(`# ${escapeMarkdown(book.title)}`);
		if (book.author) parts.push(`*${escapeMarkdown(book.author)}*`);
	}
	for (const part of book.parts) {
		if (book.includeActTitles && part.title) {
			parts.push(`# ${escapeMarkdown(part.title)}`);
		}
		for (const chapter of part.chapters) {
			parts.push(renderChapter({
				heading: chapter.heading,
				blocks: chapter.blocks,
				sceneBreak: book.sceneBreak,
			}, 'markdown'));
		}
	}
	return `${parts.join('\n\n')}\n`;
}

/** Inline spans as (X)HTML. Valid in EPUB, which is strict XML. */
export function spansToXhtml(spans: InlineSpan[]): string {
	return spans.map((span) => {
		let text = escapeHtml(span.text);
		if (span.italic) text = `<em>${text}</em>`;
		if (span.bold) text = `<strong>${text}</strong>`;
		if (span.strike) text = `<s>${text}</s>`;
		return text;
	}).join('');
}

/** Blocks of a chapter as (X)HTML, without its heading. */
export function blocksToXhtml(blocks: ManuscriptBlock[], sceneBreak: string): string {
	return blocks.map((block) => {
		switch (block.kind) {
			case 'sceneBreak':
				return `<p class="scene-break">${escapeHtml(sceneBreak)}</p>`;
			case 'heading':
				return `<h3>${spansToXhtml(block.spans)}</h3>`;
			case 'quote':
				return `<blockquote><p>${spansToXhtml(block.spans)}</p></blockquote>`;
			default:
				return `<p>${spansToXhtml(block.spans)}</p>`;
		}
	}).join('\n');
}

/** Stylesheet of the HTML page and of the EPUB. */
export const BOOK_CSS = [
	'body { font-family: Georgia, "Times New Roman", serif; line-height: 1.5; }',
	'.book { max-width: 40em; margin: 0 auto; padding: 1em; }',
	'h1, h2 { text-align: center; font-weight: normal; }',
	'h2 { margin: 3em 0 1.5em; }',
	'p { margin: 0; text-indent: 1.5em; text-align: justify; }',
	'h1 + p, h2 + p, h3 + p, .scene-break + p { text-indent: 0; }',
	'.scene-break { text-align: center; text-indent: 0; margin: 1em 0; }',
	'.title-page { text-align: center; margin: 6em 0; }',
	'.title-page .author { font-style: italic; text-indent: 0; text-align: center; }',
	'.part { page-break-before: always; }',
	'.chapter { page-break-before: always; }',
	'blockquote { margin: 1em 2em; font-style: italic; }',
].join('\n');

export function renderBookHtml(book: ExportBook): string {
	const body: string[] = [];
	if (book.titlePage) {
		body.push('<section class="title-page">');
		body.push(`<h1>${escapeHtml(book.title)}</h1>`);
		if (book.author) body.push(`<p class="author">${escapeHtml(book.author)}</p>`);
		body.push('</section>');
	}
	for (const part of book.parts) {
		if (book.includeActTitles && part.title) {
			body.push(`<h1 class="part">${escapeHtml(part.title)}</h1>`);
		}
		for (const chapter of part.chapters) {
			body.push('<section class="chapter">');
			body.push(`<h2>${escapeHtml(chapter.heading)}</h2>`);
			body.push(blocksToXhtml(chapter.blocks, book.sceneBreak));
			body.push('</section>');
		}
	}
	return [
		'<!DOCTYPE html>',
		`<html lang="${book.language}">`,
		'<head>',
		'<meta charset="utf-8">',
		`<title>${escapeHtml(book.title)}</title>`,
		`<style>\n${BOOK_CSS}\n</style>`,
		'</head>',
		'<body>',
		'<main class="book">',
		...body,
		'</main>',
		'</body>',
		'</html>',
		'',
	].join('\n');
}
