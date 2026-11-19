import { strToU8, zipSync } from 'fflate';
import type {
	ExportBook,
	InlineSpan,
	ManuscriptBlock,
} from '../../types/ManuscriptExport';
import { escapeXml } from './markup';

/**
 * Word document (DOCX) of the novel: the smallest set of parts Word, Google
 * Docs and LibreOffice open. Formatting lives in named styles (Title, Heading
 * 1 and 2, Body Text, First Paragraph, Scene Break, Quote), so the author can
 * change the whole book's look from Word in one place.
 */

export interface DocxOptions {
	/** Date of this export, for the document properties. */
	created: Date;
}

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function run(span: InlineSpan): string {
	const props = [
		span.italic ? '<w:i/>' : '',
		span.bold ? '<w:b/>' : '',
		span.strike ? '<w:strike/>' : '',
	].join('');
	const rPr = props ? `<w:rPr>${props}</w:rPr>` : '';
	return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(span.text)}</w:t></w:r>`;
}

function textRun(text: string): string {
	return run({ text, italic: false, bold: false, strike: false });
}

function paragraph(style: string, runs: string, pageBreak = false): string {
	const breakBefore = pageBreak ? '<w:pageBreakBefore/>' : '';
	return `<w:p><w:pPr><w:pStyle w:val="${style}"/>${breakBefore}</w:pPr>${runs}</w:p>`;
}

/** Writes the body, tracking whether the next paragraph opens a section. */
class BodyWriter {
	readonly parts: string[] = [];
	private opensSection = true;
	private hasContent = false;

	heading(style: string, text: string): void {
		// The first heading of a book without a title page starts page one.
		this.parts.push(paragraph(style, textRun(text), this.hasContent));
		this.hasContent = true;
		this.opensSection = true;
	}

	raw(xml: string): void {
		this.parts.push(xml);
		this.hasContent = true;
	}

	block(block: ManuscriptBlock, sceneBreak: string): void {
		if (block.kind === 'sceneBreak') {
			this.parts.push(paragraph('SceneBreak', textRun(sceneBreak)));
			this.opensSection = true;
			return;
		}
		const runs = block.spans.map(run).join('');
		if (block.kind === 'heading') {
			this.parts.push(paragraph('Heading3', runs));
			this.opensSection = true;
		} else if (block.kind === 'quote') {
			this.parts.push(paragraph('Quote', runs));
		} else {
			const style = this.opensSection ? 'FirstParagraph' : 'BodyText';
			this.parts.push(paragraph(style, runs));
			this.opensSection = false;
		}
	}
}

function documentXml(book: ExportBook): string {
	const body = new BodyWriter();
	if (book.titlePage) {
		body.raw(paragraph('Title', textRun(book.title)));
		if (book.author) body.raw(paragraph('Subtitle', textRun(book.author)));
	}
	for (const part of book.parts) {
		if (book.includeActTitles && part.title) body.heading('Heading1', part.title);
		for (const chapter of part.chapters) {
			body.heading('Heading2', chapter.heading);
			for (const block of chapter.blocks) body.block(block, book.sceneBreak);
		}
	}
	return [
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		`<w:document ${W_NS}>`,
		'<w:body>',
		...body.parts,
		'<w:sectPr>',
		'<w:pgSz w:w="11906" w:h="16838"/>',
		'<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
			+ 'w:header="708" w:footer="708" w:gutter="0"/>',
		'</w:sectPr>',
		'</w:body>',
		'</w:document>',
	].join('');
}

function paragraphStyle(
	id: string,
	name: string,
	pPr: string,
	rPr = '',
	basedOn = 'Normal',
): string {
	const base = id === 'Normal' ? '' : `<w:basedOn w:val="${basedOn}"/>`;
	const runProps = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';
	return `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/>`
		+ `${base}<w:qFormat/><w:pPr>${pPr}</w:pPr>${runProps}</w:style>`;
}

function stylesXml(book: ExportBook): string {
	const lang = book.language !== 'und' ? `<w:lang w:val="${book.language}"/>` : '';
	const font = '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>';
	const centered = '<w:jc w:val="center"/>';
	const keepNext = '<w:keepNext/>';
	return [
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		`<w:styles ${W_NS}>`,
		'<w:docDefaults>',
		`<w:rPrDefault><w:rPr>${font}<w:sz w:val="24"/>${lang}</w:rPr></w:rPrDefault>`,
		'<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="360" w:lineRule="auto"/>'
			+ '</w:pPr></w:pPrDefault>',
		'</w:docDefaults>',
		paragraphStyle('Normal', 'Normal', ''),
		paragraphStyle('BodyText', 'Body Text',
			'<w:ind w:firstLine="425"/><w:jc w:val="both"/>'),
		paragraphStyle('FirstParagraph', 'First Paragraph',
			'<w:jc w:val="both"/>', '', 'BodyText'),
		paragraphStyle('SceneBreak', 'Scene Break',
			`${centered}<w:spacing w:before="240" w:after="240"/>`),
		paragraphStyle('Quote', 'Quote',
			'<w:ind w:left="720" w:right="720"/><w:spacing w:before="120" w:after="120"/>',
			'<w:i/>'),
		paragraphStyle('Title', 'Title',
			`${centered}<w:spacing w:before="2880" w:after="480"/>`,
			'<w:sz w:val="56"/>'),
		paragraphStyle('Subtitle', 'Subtitle', centered, '<w:i/><w:sz w:val="32"/>'),
		paragraphStyle('Heading1', 'heading 1',
			`${keepNext}${centered}<w:spacing w:before="2400" w:after="480"/>`
				+ '<w:outlineLvl w:val="0"/>',
			'<w:sz w:val="40"/>'),
		paragraphStyle('Heading2', 'heading 2',
			`${keepNext}${centered}<w:spacing w:before="1440" w:after="480"/>`
				+ '<w:outlineLvl w:val="1"/>',
			'<w:sz w:val="32"/>'),
		paragraphStyle('Heading3', 'heading 3',
			`${keepNext}<w:spacing w:before="240" w:after="120"/><w:outlineLvl w:val="2"/>`,
			'<w:b/>'),
		'</w:styles>',
	].join('');
}

const CONTENT_TYPES = [
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
	'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
	'<Default Extension="rels" '
		+ 'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
	'<Default Extension="xml" ContentType="application/xml"/>',
	'<Override PartName="/word/document.xml" ContentType="application/'
		+ 'vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
	'<Override PartName="/word/styles.xml" ContentType="application/'
		+ 'vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
	'<Override PartName="/docProps/core.xml" '
		+ 'ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>',
	'</Types>',
].join('');

const ROOT_RELS = [
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
	'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
	'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/'
		+ '2006/relationships/officeDocument" Target="word/document.xml"/>',
	'<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/'
		+ 'relationships/metadata/core-properties" Target="docProps/core.xml"/>',
	'</Relationships>',
].join('');

const DOCUMENT_RELS = [
	'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
	'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
	'<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/'
		+ '2006/relationships/styles" Target="styles.xml"/>',
	'</Relationships>',
].join('');

function coreXml(book: ExportBook, options: DocxOptions): string {
	const date = `${options.created.toISOString().slice(0, 19)}Z`;
	const creator = book.author
		? `<dc:creator>${escapeXml(book.author)}</dc:creator>`
		: '';
	return [
		'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
		'<cp:coreProperties '
			+ 'xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
			+ 'xmlns:dc="http://purl.org/dc/elements/1.1/" '
			+ 'xmlns:dcterms="http://purl.org/dc/terms/" '
			+ 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
		`<dc:title>${escapeXml(book.title)}</dc:title>`,
		creator,
		`<dcterms:created xsi:type="dcterms:W3CDTF">${date}</dcterms:created>`,
		`<dcterms:modified xsi:type="dcterms:W3CDTF">${date}</dcterms:modified>`,
		'</cp:coreProperties>',
	].join('');
}

/** The DOCX file's bytes. */
export function buildDocx(book: ExportBook, options: DocxOptions): Uint8Array {
	return zipSync({
		'[Content_Types].xml': strToU8(CONTENT_TYPES),
		'_rels/.rels': strToU8(ROOT_RELS),
		'docProps/core.xml': strToU8(coreXml(book, options)),
		'word/document.xml': strToU8(documentXml(book)),
		'word/styles.xml': strToU8(stylesXml(book)),
		'word/_rels/document.xml.rels': strToU8(DOCUMENT_RELS),
	}, { level: 6 });
}
