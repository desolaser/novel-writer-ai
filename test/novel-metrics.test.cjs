const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

// Statistics of the Metrics tab: text analysis and the whole-novel report.
require.extensions['.ts'] = (module, filename) => {
	const source = fs.readFileSync(filename, 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
	});
	module._compile(compiled.outputText, filename);
};

const {
	cleanMarkdown,
	countWords,
	dialogueWords,
	splitParagraphs,
	splitSentences,
	vocabularyVariety,
} = require('../src/utils/textStats.ts');
const { computeNovelMetrics, chaptersInOrder } = require('../src/utils/novelMetrics.ts');

function act(id, orden, nombre = `Act ${id}`) {
	return { id_acto: id, nombre, resumen: '', orden };
}

function chapter(id, idActo, orden, extra = {}) {
	return {
		id_capitulo: id,
		nombre: `Chapter ${id}`,
		outline: '',
		archivo: `escritura/capitulos/${id}.md`,
		id_acto: idActo,
		orden,
		...extra,
	};
}

function entry(id, nombre, extra = {}) {
	return {
		id_entrada_codex: id,
		nombre,
		alias: '',
		id_categoria: 'chars',
		color: null,
		archivado: false,
		case_sensitive: false,
		tracking_por_nombre: true,
		...extra,
	};
}

const categories = [{ id_categoria: 'chars', nombre: 'Characters', color: '#f00' }];

test('words skip punctuation, dashes and markdown that is not prose', () => {
	assert.equal(countWords('—Hola —dijo Ana—. ¿Vienes?'), 4);
	assert.equal(countWords("It's a well-known fact."), 5);
	const clean = cleanMarkdown('---\ntags: x\n---\nSee [[Ana Pérez|Ana]] %%note%% ![[map.png]]');
	assert.equal(countWords(clean), 2);
});

test('paragraphs leave out headings and separators; sentences split on their ending', () => {
	const paragraphs = splitParagraphs('# Title\n\nOne line.\n***\nTwo. Three!\n');
	assert.deepEqual(paragraphs, ['One line.', 'Two. Three!']);
	assert.equal(splitSentences('Two. Three! And four... yes?').length, 4);
	assert.equal(splitSentences('No ending').length, 1);
});

test('dialogue is counted in dash paragraphs and between quotes', () => {
	assert.equal(dialogueWords('—Hola —dijo Ana—. ¿Vienes?'), 2);
	assert.equal(dialogueWords('She said "come here now" and left.'), 3);
	assert.equal(dialogueWords('Plain narration.'), 0);
});

test('vocabulary variety does not drop just because the text is longer', () => {
	const varied = Array.from({ length: 2000 }, (_, index) => `w${index % 400}`);
	const repetitive = Array.from({ length: 2000 }, (_, index) => `w${index % 20}`);
	assert.ok(vocabularyVariety(varied) > vocabularyVariety(repetitive));
	assert.equal(vocabularyVariety(['a', 'b', 'a', 'b']), 0.5);
	assert.equal(vocabularyVariety([]), 0);
});

test('chapters are read in act order, then chapter order', () => {
	const acts = [act('b', 2), act('a', 1)];
	const ordered = chaptersInOrder(acts, [chapter('3', 'b', 1), chapter('2', 'a', 2), chapter('1', 'a', 1)]);
	assert.deepEqual(ordered.map((item) => item.id_capitulo), ['1', '2', '3']);
});

test('the report counts words per chapter, act and target', () => {
	const metrics = computeNovelMetrics({
		acts: [act('a', 1), act('b', 2)],
		chapters: [
			chapter('1', 'a', 1, { outline: 'Plan' }),
			chapter('2', 'a', 2),
			chapter('3', 'b', 1),
			chapter('4', 'b', 2, { archivo: null }),
		],
		texts: new Map([
			['1', 'one two three four five'],
			['2', 'one two three'],
			['3', 'one two three four five six seven eight nine ten'],
		]),
		entries: [],
		categories,
		target: { min: 4, max: 8 },
	});
	assert.deepEqual(metrics.chapters.map((item) => item.words), [5, 3, 10, 0]);
	assert.equal(metrics.totals.words, 18);
	assert.equal(metrics.totals.writtenChapters, 3);
	assert.equal(metrics.totals.outlinedChapters, 1);
	assert.equal(metrics.chapterLength.average, 6);
	assert.equal(metrics.chapterLength.median, 5);
	assert.equal(metrics.chapterLength.shortest.id, '2');
	assert.equal(metrics.chapterLength.longest.id, '3');
	assert.equal(metrics.chapterLength.underTarget, 1);
	assert.equal(metrics.chapterLength.withinTarget, 1);
	assert.equal(metrics.chapterLength.overTarget, 1);
	assert.deepEqual(metrics.acts.map((item) => item.words), [8, 10]);
	assert.equal(metrics.chapters[3].hasFile, false);
	// Four chapters at the middle of 4-8 words.
	assert.equal(metrics.totals.targetWords, 24);
});

test('a novel without text gives zeros, not NaN', () => {
	const metrics = computeNovelMetrics({
		acts: [], chapters: [], texts: new Map(), entries: [], categories, target: null,
	});
	assert.equal(metrics.totals.words, 0);
	assert.equal(metrics.chapterLength.average, 0);
	assert.equal(metrics.chapterLength.shortest, null);
	assert.equal(metrics.totals.targetWords, null);
	assert.equal(metrics.style.averageSentenceWords, 0);
	assert.equal(metrics.style.dialogueShare, 0);
});

test('codex mentions, entries never mentioned and entries gone quiet', () => {
	const chapters = Array.from({ length: 6 }, (_, index) => chapter(String(index + 1), 'a', index + 1));
	const texts = new Map([
		['1', 'Ana met Bruno. Ana smiled.'],
		['2', 'Ana and Bruno walked.'],
		['3', 'Ana ran.'],
		['4', 'Bruno slept.'],
		['5', 'Bruno woke.'],
		['6', 'Bruno ate.'],
	]);
	const metrics = computeNovelMetrics({
		acts: [act('a', 1)],
		chapters,
		texts,
		entries: [
			entry('ana', 'Ana'),
			entry('bruno', 'Bruno'),
			entry('ghost', 'Ghost'),
			entry('old', 'Bruno', { archivado: true }),
		],
		categories,
		target: null,
	});
	const codex = metrics.codex;
	assert.equal(codex.activeEntries, 3);
	assert.equal(codex.archivedEntries, 1);
	assert.deepEqual(codex.byCategory.map((item) => [item.name, item.entries]), [['Characters', 3]]);
	assert.deepEqual(codex.mentioned.map((item) => [item.id, item.mentions]), [['bruno', 5], ['ana', 4]]);
	const ana = codex.mentioned.find((item) => item.id === 'ana');
	assert.equal(ana.chapters, 3);
	assert.equal(ana.firstChapter, 1);
	assert.equal(ana.lastChapter, 3);
	assert.deepEqual(ana.perChapter, [2, 1, 1, 0, 0, 0]);
	assert.equal(ana.silentChapters, 3);
	assert.deepEqual(codex.neverMentioned.map((item) => item.id), ['ghost']);
	assert.deepEqual(codex.goneQuiet.map((item) => item.id), ['ana']);
	assert.equal(metrics.chapters[0].distinctEntries, 2);
});

test('top words skip function words and can skip codex names; phrases repeat', () => {
	const text = [
		'Ana se encogió de hombros. La puerta estaba cerrada.',
		'Ana se encogió de hombros otra vez. La puerta crujió.',
		'—Vete —dijo Ana.',
	].join('\n');
	const metrics = computeNovelMetrics({
		acts: [act('a', 1)],
		chapters: [chapter('1', 'a', 1)],
		texts: new Map([['1', text]]),
		entries: [entry('ana', 'Ana')],
		categories,
		target: null,
	});
	const words = metrics.topWords.map((item) => item.term);
	assert.equal(words[0], 'ana');
	assert.ok(!words.includes('la') && !words.includes('estaba'));
	assert.ok(!metrics.topWordsWithoutCodex.some((item) => item.term === 'ana'));
	assert.ok(metrics.repeatedPhrases.some((item) => item.term === 'encogió de hombros' && item.count === 2));
	assert.ok(metrics.style.dialogueShare > 0);
	assert.equal(metrics.style.paragraphs, 3);
});
