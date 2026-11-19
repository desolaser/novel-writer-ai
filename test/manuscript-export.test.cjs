const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');
const { strFromU8, unzipSync } = require('fflate');

// Export of the manuscript: Obsidian syntax removed, emphasis kept, each
// chapter format, the compiled book (Markdown, HTML, EPUB, DOCX) and the
// chapter-by-chapter publishing helpers.
require.extensions['.ts'] = (module, filename) => {
	const source = fs.readFileSync(filename, 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
			esModuleInterop: true,
		},
	});
	module._compile(compiled.outputText, filename);
};

const dir = '../src/utils/manuscriptExport';
const { parseInline } = require(`${dir}/inlineMarkup.ts`);
const { parseManuscript } = require(`${dir}/manuscriptBlocks.ts`);
const { renderChapter, withoutRepeatedTitle } = require(`${dir}/chapterRenderers.ts`);
const {
	buildExportBook,
	chapterHeading,
	exportChapters,
	languageCode,
} = require(`${dir}/exportBook.ts`);
const { renderBookHtml, renderBookMarkdown } = require(`${dir}/bookText.ts`);
const { buildEpub } = require(`${dir}/epubWriter.ts`);
const { buildDocx } = require(`${dir}/docxWriter.ts`);
const { nextUnpublishedChapter, publishText } = require(`${dir}/publishing.ts`);
const { DEFAULT_EXPORT_PREFERENCES } = require('../src/types/ManuscriptExport.ts');

const plain = (text) => ({ text, italic: false, bold: false, strike: false });

test('inline emphasis becomes spans; escapes and snake_case stay text', () => {
	assert.deepEqual(parseInline('She *ran* and **ran**.'), [
		plain('She '),
		{ text: 'ran', italic: true, bold: false, strike: false },
		plain(' and '),
		{ text: 'ran', italic: false, bold: true, strike: false },
		plain('.'),
	]);
	assert.deepEqual(parseInline('***both*** ~~gone~~ ==mark=='), [
		{ text: 'both', italic: true, bold: true, strike: false },
		plain(' '),
		{ text: 'gone', italic: false, bold: false, strike: true },
		plain(' mark'),
	]);
	assert.deepEqual(parseInline('a \\*star\\* in snake_case_name'), [
		plain('a *star* in snake_case_name'),
	]);
	assert.deepEqual(parseInline('*outer **inner** end*'), [
		{ text: 'outer ', italic: true, bold: false, strike: false },
		{ text: 'inner', italic: true, bold: true, strike: false },
		{ text: ' end', italic: true, bold: false, strike: false },
	]);
});

test('Obsidian syntax is removed; lines are paragraphs; breaks are cleaned', () => {
	const note = [
		'---',
		'memoryContent: secret story so far',
		'---',
		'# Arrival',
		'',
		'Elena met [[Marco|the captain]] at [[Port]]. %%fix this%%',
		'<!-- hidden -->',
		'![[map.png]]',
		'She left. ^block-1',
		'***',
		'* * *',
		'> A letter.',
		'## Later',
		'The end.',
		'---',
		'',
	].join('\r\n');
	const blocks = parseManuscript(note);
	assert.deepEqual(blocks.map((block) => block.kind), [
		'heading', 'paragraph', 'paragraph', 'sceneBreak', 'quote', 'heading', 'paragraph',
	]);
	const text = renderChapter({ heading: '', blocks, sceneBreak: '#' }, 'plain');
	assert.ok(!text.includes('secret'), 'frontmatter never reaches an export');
	assert.ok(!text.includes('fix this'));
	assert.ok(!text.includes('hidden'));
	assert.ok(!text.includes('map.png'));
	assert.ok(!text.includes('^block-1'));
	assert.match(text, /Elena met the captain at Port\./);
	assert.ok(!text.trim().endsWith('#'), 'a trailing break is dropped');
});

test('a heading repeating the chapter name is dropped once', () => {
	const blocks = parseManuscript('# Arrival\n\nText.');
	assert.equal(withoutRepeatedTitle(blocks, ' arrival ').length, 1);
	assert.equal(withoutRepeatedTitle(blocks, 'Other').length, 2);
});

test('each chapter format', () => {
	const blocks = parseManuscript('She *ran* <fast> & far.\n\n***\n\n> Note [b]');
	const input = { heading: 'Chapter 1: Go', blocks, sceneBreak: '* * *' };
	assert.equal(
		renderChapter(input, 'plain'),
		'Chapter 1: Go\n\nShe ran <fast> & far.\n\n* * *\n\nNote [b]',
	);
	assert.equal(
		renderChapter(input, 'html'),
		'<h2>Chapter 1: Go</h2>\n<p>She <em>ran</em> &lt;fast&gt; &amp; far.</p>\n'
			+ '<p style="text-align: center;">* * *</p>\n'
			+ '<blockquote><p>Note [b]</p></blockquote>',
	);
	assert.equal(
		renderChapter(input, 'markdown'),
		'## Chapter 1: Go\n\nShe *ran* <fast> & far.\n\n* * *\n\n> Note \\[b\\]',
	);
	assert.equal(
		renderChapter(input, 'bbcode'),
		'[b]Chapter 1: Go[/b]\n\nShe [i]ran[/i] <fast> & far.\n\n'
			+ '[center]* * *[/center]\n\n[quote]Note [b][/quote]',
	);
});

test('chapter headings and language codes', () => {
	const options = (style, chapterWord = 'Capítulo') => ({ style, chapterWord });
	assert.equal(chapterHeading(options('number-title'), 3, 'El puerto'), 'Capítulo 3: El puerto');
	assert.equal(chapterHeading(options('number'), 3, 'El puerto'), 'Capítulo 3');
	assert.equal(chapterHeading(options('title'), 3, 'El puerto'), 'El puerto');
	assert.equal(chapterHeading(options('title'), 3, ' '), 'Capítulo 3');
	assert.equal(chapterHeading(options('number', ' '), 2, 'x'), 'Chapter 2');

	assert.equal(languageCode('Spanish'), 'es');
	assert.equal(languageCode(' Español '), 'es');
	assert.equal(languageCode('pt-br'), 'pt-br');
	assert.equal(languageCode('Klingon'), 'und');
	assert.equal(languageCode(''), 'und');
});

function novel() {
	const acts = [
		{ id_acto: 'a2', nombre: 'Two', orden: 1 },
		{ id_acto: 'a1', nombre: 'One', orden: 0 },
		{ id_acto: 'a3', nombre: 'Empty', orden: 2 },
	];
	const chapter = (id, act, orden, nombre, info = {}) => ({
		id_capitulo: id, nombre, outline: '', archivo: `${id}.md`,
		id_acto: act, orden, ...info,
	});
	const chapters = [
		chapter('c3', 'a2', 0, 'Storm', { status: 'drafted' }),
		chapter('c1', 'a1', 0, 'Arrival', { status: 'final' }),
		chapter('c2', 'a1', 1, 'Blank', { status: 'final' }),
		chapter('c4', 'a2', 1, 'Calm', { status: 'idea' }),
	];
	const texts = new Map([
		['c1', '# Arrival\n\nElena *arrived* & smiled.\n\n***\n\nNight.'],
		['c2', '---\nmemoryContent: x\n---\n'],
		['c3', 'Rain "fell".'],
		['c4', 'Quiet.'],
	]);
	return {
		title: 'The <Book>',
		author: 'Ana & Co',
		language: 'Spanish',
		acts,
		chapters,
		texts,
	};
}

test('the book keeps reading order, skips empty chapters and filters by stage', () => {
	const prefs = { ...DEFAULT_EXPORT_PREFERENCES, chapterWord: 'Capítulo' };
	const book = buildExportBook(novel(), prefs);
	assert.equal(book.language, 'es');
	assert.deepEqual(book.parts.map((part) => part.title), ['One', 'Two']);
	assert.deepEqual(
		book.parts.flatMap((part) => part.chapters.map((chapter) => chapter.heading)),
		['Capítulo 1: Arrival', 'Capítulo 2: Storm', 'Capítulo 3: Calm'],
	);
	const first = book.parts[0].chapters[0];
	assert.equal(first.blocks[0].kind, 'paragraph', 'the repeated title is gone');

	const drafted = exportChapters(novel(), { ...prefs, minStatus: 'drafted' });
	assert.deepEqual(drafted.map((chapter) => [chapter.number, chapter.name]), [
		[1, 'Arrival'],
		[2, 'Storm'],
	]);
});

test('Markdown and HTML books', () => {
	const prefs = { ...DEFAULT_EXPORT_PREFERENCES, includeActTitles: true };
	const book = buildExportBook(novel(), prefs);
	const markdown = renderBookMarkdown(book);
	assert.match(markdown, /^# The <Book>\n\n\*Ana & Co\*\n\n# One\n\n## Chapter 1: Arrival\n\nElena \*arrived\* & smiled\./);

	const html = renderBookHtml(book);
	assert.match(html, /<html lang="es">/);
	assert.match(html, /<title>The &lt;Book&gt;<\/title>/);
	assert.match(html, /<h1 class="part">One<\/h1>/);
	assert.match(html, /<p class="scene-break">\* \* \*<\/p>/);
	assert.match(html, /Rain "fell"\./);
});

test('EPUB: mimetype first and stored, package, navigation and chapters', () => {
	const book = buildExportBook(novel(), DEFAULT_EXPORT_PREFERENCES);
	const bytes = buildEpub(book, {
		identifier: 'urn:novel-writer:n1',
		modified: new Date('2026-11-19T10:20:30.456Z'),
	});
	// The first local header names "mimetype" and uses method 0 (stored).
	assert.equal(strFromU8(bytes.slice(30, 38)), 'mimetype');
	assert.equal(bytes[8] | (bytes[9] << 8), 0);
	assert.equal(strFromU8(bytes.slice(38, 58)), 'application/epub+zip');

	const files = unzipSync(bytes);
	const names = Object.keys(files);
	for (const name of [
		'META-INF/container.xml', 'OEBPS/content.opf', 'OEBPS/nav.xhtml',
		'OEBPS/toc.ncx', 'OEBPS/style.css', 'OEBPS/title.xhtml',
		'OEBPS/chapter-1.xhtml', 'OEBPS/chapter-2.xhtml', 'OEBPS/chapter-3.xhtml',
	]) {
		assert.ok(names.includes(name), `${name} is in the EPUB`);
	}
	const opf = strFromU8(files['OEBPS/content.opf']);
	assert.match(opf, /<dc:title>The &lt;Book&gt;<\/dc:title>/);
	assert.match(opf, /<dc:creator>Ana &amp; Co<\/dc:creator>/);
	assert.match(opf, /<dc:language>es<\/dc:language>/);
	assert.match(opf, /dcterms:modified">2026-11-19T10:20:30Z</);
	assert.match(opf, /<itemref idref="title-page"\/>\n<itemref idref="chapter-1"\/>/);

	const chapter = strFromU8(files['OEBPS/chapter-1.xhtml']);
	assert.match(chapter, /<h2>Chapter 1: Arrival<\/h2>/);
	assert.match(chapter, /<p>Elena <em>arrived<\/em> &amp; smiled\.<\/p>/);
	const nav = strFromU8(files['OEBPS/nav.xhtml']);
	assert.ok(!nav.includes('title.xhtml'), 'the title page is not in the contents');
	assert.match(nav, /<a href="chapter-3.xhtml">Chapter 3: Calm<\/a>/);
});

test('DOCX: parts, styles, formatted runs and page breaks', () => {
	const book = buildExportBook(novel(), DEFAULT_EXPORT_PREFERENCES);
	const files = unzipSync(buildDocx(book, { created: new Date('2026-11-19T00:00:00Z') }));
	for (const name of [
		'[Content_Types].xml', '_rels/.rels', 'docProps/core.xml',
		'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels',
	]) {
		assert.ok(files[name], `${name} is in the DOCX`);
	}
	const doc = strFromU8(files['word/document.xml']);
	assert.match(doc, /<w:pStyle w:val="Title"\/><\/w:pPr><w:r><w:t xml:space="preserve">The &lt;Book&gt;/);
	assert.match(doc, /<w:pStyle w:val="Heading2"\/><w:pageBreakBefore\/>/);
	assert.match(doc, /<w:r><w:rPr><w:i\/><\/w:rPr><w:t xml:space="preserve">arrived<\/w:t><\/w:r>/);
	// After a heading or a scene break the paragraph is not indented.
	assert.match(doc, /SceneBreak[\s\S]*?FirstParagraph[\s\S]*?Night\./);
	assert.match(strFromU8(files['word/styles.xml']), /<w:lang w:val="es"\/>/);

	const noTitle = buildExportBook(novel(), {
		...DEFAULT_EXPORT_PREFERENCES,
		titlePage: false,
	});
	const first = strFromU8(unzipSync(buildDocx(noTitle, { created: new Date() }))['word/document.xml']);
	const firstHeading = first.indexOf('Heading2');
	assert.ok(!first.slice(firstHeading, firstHeading + 60).includes('pageBreakBefore'),
		'the first page does not start blank');
});

test('next unpublished chapter and the text to paste', () => {
	const ordered = [
		{ id_capitulo: 'c1', nombre: 'A', archivo: 'a.md', published_on: '2026-11-01' },
		{ id_capitulo: 'c2', nombre: 'B', archivo: null },
		{ id_capitulo: 'c3', nombre: 'C', archivo: 'c.md' },
		{ id_capitulo: 'c4', nombre: 'D', archivo: 'd.md' },
	];
	assert.equal(nextUnpublishedChapter(ordered).id_capitulo, 'c3');
	assert.equal(nextUnpublishedChapter(ordered, 'c3').id_capitulo, 'c4');
	assert.equal(nextUnpublishedChapter(ordered, 'c4').id_capitulo, 'c3', 'wraps around');
	assert.equal(nextUnpublishedChapter([ordered[0]]), null);

	const options = {
		format: 'html',
		includeHeading: true,
		style: 'number-title',
		chapterWord: 'Chapter',
		sceneBreak: '',
	};
	const result = publishText(ordered[2], 3, '# C\n\nIt *was* cold, wasn\'t it?', options);
	assert.equal(result.text, '<h2>Chapter 3: C</h2>\n<p>It <em>was</em> cold, wasn\'t it?</p>');
	assert.equal(result.plain, 'Chapter 3: C\n\nIt was cold, wasn\'t it?');
	assert.equal(result.words, 5, 'the heading does not count');

	const bare = publishText(ordered[2], 3, 'Text.', { ...options, includeHeading: false, format: 'plain' });
	assert.equal(bare.text, 'Text.');
});
