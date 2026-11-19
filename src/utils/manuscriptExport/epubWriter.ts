import { strToU8, zipSync, type Zippable } from 'fflate';
import type { ExportBook } from '../../types/ManuscriptExport';
import { BOOK_CSS, blocksToXhtml } from './bookText';
import { escapeXml } from './markup';

/**
 * EPUB 3 of the novel, with an EPUB 2 table of contents for older readers.
 * One XHTML file per chapter, one per act title and an optional title page.
 */

export interface EpubOptions {
	/** Stable id of the book, so readers treat a new export as the same book. */
	identifier: string;
	/** Date of this export. */
	modified: Date;
}

interface EpubPage {
	id: string;
	href: string;
	title: string;
	/** Whether it goes into the table of contents. */
	inToc: boolean;
	body: string;
}

function xhtmlPage(book: ExportBook, title: string, body: string): string {
	return [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<!DOCTYPE html>',
		'<html xmlns="http://www.w3.org/1999/xhtml" '
			+ 'xmlns:epub="http://www.idpf.org/2007/ops" '
			+ `xml:lang="${book.language}" lang="${book.language}">`,
		'<head>',
		`<title>${escapeXml(title)}</title>`,
		'<link rel="stylesheet" type="text/css" href="style.css"/>',
		'</head>',
		'<body>',
		body,
		'</body>',
		'</html>',
		'',
	].join('\n');
}

function bookPages(book: ExportBook): EpubPage[] {
	const pages: EpubPage[] = [];
	if (book.titlePage) {
		const author = book.author
			? `<p class="author">${escapeXml(book.author)}</p>`
			: '';
		pages.push({
			id: 'title-page',
			href: 'title.xhtml',
			title: book.title,
			inToc: false,
			body: `<section class="title-page"><h1>${escapeXml(book.title)}</h1>${author}</section>`,
		});
	}
	book.parts.forEach((part, partIndex) => {
		if (book.includeActTitles && part.title) {
			pages.push({
				id: `part-${partIndex + 1}`,
				href: `part-${partIndex + 1}.xhtml`,
				title: part.title,
				inToc: true,
				body: `<h1>${escapeXml(part.title)}</h1>`,
			});
		}
		for (const chapter of part.chapters) {
			pages.push({
				id: `chapter-${chapter.number}`,
				href: `chapter-${chapter.number}.xhtml`,
				title: chapter.heading,
				inToc: true,
				body: [
					`<section epub:type="chapter">`,
					`<h2>${escapeXml(chapter.heading)}</h2>`,
					blocksToXhtml(chapter.blocks, book.sceneBreak),
					'</section>',
				].join('\n'),
			});
		}
	});
	return pages;
}

const CONTAINER_XML = [
	'<?xml version="1.0" encoding="utf-8"?>',
	'<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
	'<rootfiles>',
	'<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>',
	'</rootfiles>',
	'</container>',
	'',
].join('\n');

/** "2026-11-19T10:20:30Z": EPUB wants no milliseconds. */
function epubDate(date: Date): string {
	return `${date.toISOString().slice(0, 19)}Z`;
}

function contentOpf(book: ExportBook, pages: EpubPage[], options: EpubOptions): string {
	const creator = book.author
		? `<dc:creator>${escapeXml(book.author)}</dc:creator>`
		: '';
	const items = pages.map((page) =>
		`<item id="${page.id}" href="${page.href}" media-type="application/xhtml+xml"/>`);
	const spine = pages.map((page) => `<itemref idref="${page.id}"/>`);
	return [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">',
		'<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">',
		`<dc:identifier id="book-id">${escapeXml(options.identifier)}</dc:identifier>`,
		`<dc:title>${escapeXml(book.title)}</dc:title>`,
		creator,
		`<dc:language>${book.language}</dc:language>`,
		`<meta property="dcterms:modified">${epubDate(options.modified)}</meta>`,
		'</metadata>',
		'<manifest>',
		'<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
		'<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>',
		'<item id="css" href="style.css" media-type="text/css"/>',
		...items,
		'</manifest>',
		'<spine toc="ncx">',
		...spine,
		'</spine>',
		'</package>',
		'',
	].filter(Boolean).join('\n');
}

function navXhtml(book: ExportBook, pages: EpubPage[]): string {
	const entries = pages
		.filter((page) => page.inToc)
		.map((page) => `<li><a href="${page.href}">${escapeXml(page.title)}</a></li>`);
	const body = [
		'<nav epub:type="toc" id="toc">',
		`<h1>${escapeXml(book.title)}</h1>`,
		'<ol>',
		...entries,
		'</ol>',
		'</nav>',
	].join('\n');
	return xhtmlPage(book, book.title, body);
}

function tocNcx(book: ExportBook, pages: EpubPage[], options: EpubOptions): string {
	const points = pages
		.filter((page) => page.inToc)
		.map((page, index) => [
			`<navPoint id="nav-${index + 1}" playOrder="${index + 1}">`,
			`<navLabel><text>${escapeXml(page.title)}</text></navLabel>`,
			`<content src="${page.href}"/>`,
			'</navPoint>',
		].join(''));
	return [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">',
		'<head>',
		`<meta name="dtb:uid" content="${escapeXml(options.identifier)}"/>`,
		'</head>',
		`<docTitle><text>${escapeXml(book.title)}</text></docTitle>`,
		'<navMap>',
		...points,
		'</navMap>',
		'</ncx>',
		'',
	].join('\n');
}

/** The EPUB file's bytes. */
export function buildEpub(book: ExportBook, options: EpubOptions): Uint8Array {
	const pages = bookPages(book);
	// "mimetype" must be the first entry and stored without compression.
	const files: Zippable = {
		mimetype: [strToU8('application/epub+zip'), { level: 0 }],
		'META-INF/container.xml': strToU8(CONTAINER_XML),
		'OEBPS/content.opf': strToU8(contentOpf(book, pages, options)),
		'OEBPS/nav.xhtml': strToU8(navXhtml(book, pages)),
		'OEBPS/toc.ncx': strToU8(tocNcx(book, pages, options)),
		'OEBPS/style.css': strToU8(BOOK_CSS),
	};
	for (const page of pages) {
		files[`OEBPS/${page.href}`] = strToU8(xhtmlPage(book, page.title, page.body));
	}
	return zipSync(files, { level: 6 });
}
