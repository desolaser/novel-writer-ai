const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// Continuity check, the pure parts and the file: text hashes, merging facts,
// the facts a prompt gets, finding a quote, prompts and answers, and the
// continuity file under its lock (with a control case).
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

class TFile {
	constructor(filePath) {
		this.path = filePath;
	}
}
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name === 'obsidian') return { TFile, TFolder: class {}, normalizePath: (p) => p };
	return originalLoad.call(this, name, parent, isMain);
};

const {
	addFact,
	dismissIssue,
	earlierFactsBlock,
	editFact,
	emptyChapterContinuity,
	factsAreStale,
	mergeExtractedFacts,
	removeFact,
	storyTextHash,
} = require('../src/utils/storyFacts.ts');
const { findQuote } = require('../src/utils/quoteLocation.ts');
const {
	buildContinuityPrompt,
	buildExtractFactsPrompt,
	parseFactsResponse,
	parseIssuesResponse,
} = require('../src/context/continuityPrompt.ts');
const repo = require('../src/infrastructure/storage/repos/ContinuityRepo.ts');

const chapter = (id, nombre, extra = {}) => ({
	id_capitulo: id, nombre, outline: '', archivo: null, id_acto: 'a1', orden: 0,
	created_at: '', updated_at: '', ...extra,
});

test('the text hash ignores frontmatter and spacing, not words', () => {
	const base = storyTextHash('Elena walked in.\n\nThe door creaked.');
	assert.equal(storyTextHash('---\nmemoryContent: x\n---\nElena walked in. The door creaked.'), base);
	assert.equal(storyTextHash('Elena  walked in.\nThe door creaked.  '), base);
	assert.notEqual(storyTextHash('Elena ran in. The door creaked.'), base);
	assert.match(base, /^[0-9a-f]{8}$/);
});

test('facts are stale until extracted from this exact text', () => {
	assert.equal(factsAreStale(undefined, 'abc'), true);
	assert.equal(factsAreStale({ ...emptyChapterContinuity(), text_hash: 'abc' }, 'abc'), false);
	assert.equal(factsAreStale({ ...emptyChapterContinuity(), text_hash: 'abc' }, 'xyz'), true);
});

test('extracting again replaces the AI facts and keeps the author\'s', () => {
	let entry = mergeExtractedFacts(undefined, ['Elena has green eyes', 'Marco owes the guild'], 'h1', 'now');
	assert.deepEqual(entry.facts.map((fact) => fact.source), ['ai', 'ai']);
	entry = editFact(entry, entry.facts[1].id, 'Marco owes the guild 300 coins');
	entry = addFact(entry, 'The bridge is out');
	entry = mergeExtractedFacts(
		entry,
		['Elena has green eyes', 'the bridge is out!', '  '],
		'h2',
		'later',
	);
	assert.deepEqual(entry.facts.map((fact) => [fact.text, fact.source]), [
		['Marco owes the guild 300 coins', 'author'],
		['The bridge is out', 'author'],
		['Elena has green eyes', 'ai'],
	], 'no duplicate of an author fact, nothing empty');
	assert.equal(entry.text_hash, 'h2');
	assert.equal(entry.extracted_at, 'later');
});

test('editing a fact to nothing removes it; dismissing drops one issue', () => {
	let entry = addFact(emptyChapterContinuity(), 'A fact');
	assert.equal(addFact(entry, '   '), entry);
	entry = editFact(entry, entry.facts[0].id, '  ');
	assert.equal(entry.facts.length, 0);
	entry = addFact(entry, 'Another');
	assert.equal(removeFact(entry, entry.facts[0].id).facts.length, 0);

	const report = {
		checked_at: 'now', text_hash: 'h', facts_checked: 3,
		issues: [{ id: 'i1', title: 'A' }, { id: 'i2', title: 'B' }],
	};
	const dismissed = dismissIssue({ ...entry, report }, 'i1');
	assert.deepEqual(dismissed.report.issues.map((issue) => issue.id), ['i2']);
	assert.equal(dismissIssue(emptyChapterContinuity(), 'i1').report, null);
});

test('earlier facts are numbered by place in the novel, with story time', () => {
	const chapters = [
		chapter('c1', 'Arrival', { story_day: 3 }),
		chapter('c2', 'Quiet'),
		chapter('c3', 'Storm', { story_time: 'winter' }),
	];
	const ledger = {
		version: 1,
		chapters: {
			c1: { facts: [{ text: 'Elena has green eyes' }, { text: 'They reach Port Vey' }] },
			c3: { facts: [{ text: 'Marco dies in the fire' }] },
		},
	};
	const block = earlierFactsBlock(chapters, ledger, (item) => chapters.indexOf(item) + 1);
	assert.equal(block.text, 'Ch. 1 "Arrival" (day 3):\n- Elena has green eyes\n- They reach Port Vey'
		+ '\n\nCh. 3 "Storm" (winter):\n- Marco dies in the fire');
	assert.equal(block.count, 3);
	assert.equal(block.chapterByNumber.get(3), 'c3');
	assert.equal(block.chapterByNumber.has(2), false);
});

test('a quote is found despite spacing, case and curly quotes', () => {
	const text = 'She smiled.\n\n“Her BROWN eyes   narrowed,” he said — slowly.';
	const range = findQuote(text, '"her brown eyes narrowed," he said - slowly');
	assert.ok(range);
	assert.equal(text.slice(range.start, range.end), 'Her BROWN eyes   narrowed,” he said — slowly');
	assert.equal(findQuote(text, 'green eyes'), null);
	assert.equal(findQuote(text, 'a'), null, 'too short to mean anything');
});

test('the facts prompt has the chapter, the limit and the language rule', () => {
	const prompt = buildExtractFactsPrompt(chapter('c1', 'Arrival'), 'Elena walked in.', { language: 'Spanish' });
	assert.match(prompt, /Chapter title: Arrival/);
	assert.match(prompt, /--- CHAPTER TEXT ---\nElena walked in\.\n--- END CHAPTER TEXT ---/);
	assert.match(prompt, /At most 12/);
	assert.match(prompt, /Spanish/);
});

test('the check prompt has earlier facts, codex, the chapter and its number', () => {
	const prompt = buildContinuityPrompt({
		chapter: chapter('c4', 'Return'),
		chapterNumber: 4,
		manuscript: 'Marco laughed.',
		chapterInfo: 'Chapter info: Point of view: Elena.',
		earlierFacts: 'Ch. 3 "Storm":\n- Marco dies in the fire',
		codex: '- nombre: Elena',
		storyBible: '',
		blueprint: null,
	});
	assert.match(prompt, /--- FACTS FROM EARLIER CHAPTERS ---\nCh\. 3 "Storm":\n- Marco dies in the fire/);
	assert.match(prompt, /--- CODEX \(reference entries\) ---\n- nombre: Elena/);
	assert.match(prompt, /--- CHAPTER 4: Return ---\nChapter info: Point of view: Elena\.\nMarco laughed\./);
	assert.match(prompt, /If there are none, return \[\]/);

	const first = buildContinuityPrompt({
		chapter: chapter('c1', 'Arrival'), chapterNumber: 1, manuscript: 'x',
		chapterInfo: '', earlierFacts: '', codex: '', storyBible: '', blueprint: null,
	});
	assert.match(first, /\(none: this is the first chapter with facts\)/);
	assert.ok(!first.includes('--- CODEX'));
});

test('fact answers: fences and chatter tolerated, non-strings dropped, capped', () => {
	const facts = parseFactsResponse('Sure!\n```json\n["Elena has green eyes", 4, "", " Marco owes money "]\n```');
	assert.deepEqual(facts, ['Elena has green eyes', 'Marco owes money']);
	const many = JSON.stringify(Array.from({ length: 20 }, (_, i) => `Fact ${i}`));
	assert.equal(parseFactsResponse(many).length, 12);
	assert.throws(() => parseFactsResponse('No facts.'), /did not return a list of facts/);
	assert.throws(() => parseFactsResponse('["a", }]'), /could not be read/);
});

test('issue answers map chapter numbers; incomplete issues are dropped', () => {
	const answer = JSON.stringify([
		{ title: 'Marco speaks', quote: 'Marco laughed', fact: 'Marco dies', chapter: 3, explanation: 'He died.' },
		{ title: 'Eyes', quote: 'brown eyes', fact: 'Green eyes in the codex', chapter: 0 },
		{ title: 'Unknown', quote: 'something', chapter: 9 },
		{ title: '', quote: 'no title' },
		{ title: 'No quote', quote: '' },
	]);
	const issues = parseIssuesResponse(answer, new Map([[3, 'c3']]));
	assert.equal(issues.length, 3);
	assert.equal(issues[0].fact_chapter_id, 'c3');
	assert.equal(issues[1].fact_chapter_id, null, '0 is the codex');
	assert.equal(issues[2].fact_chapter_id, null, 'unknown chapter');
	assert.ok(issues.every((issue) => issue.id));
	assert.deepEqual(parseIssuesResponse('[]', new Map()), []);
});

// ---- the file and its lock ----

const randomDelay = () => new Promise((resolve) => setTimeout(resolve, Math.random() * 5));

function fakeApp(initial = {}) {
	const files = new Map(Object.entries(initial));
	return {
		files,
		vault: {
			getAbstractFileByPath: (path) => (files.has(path) ? new TFile(path) : null),
			read: async (file) => {
				await randomDelay();
				return files.get(file.path);
			},
			modify: async (file, content) => {
				await randomDelay();
				files.set(file.path, content);
			},
			create: async (path, content) => {
				await randomDelay();
				files.set(path, content);
			},
			createFolder: async () => {},
		},
	};
}

const CHAPTERS = 15;

test('concurrent fact updates to many chapters are all kept', async () => {
	const app = fakeApp();
	await Promise.all(Array.from({ length: CHAPTERS }, (_, i) =>
		repo.updateChapterContinuity(app, 'Novel', `c${i}`, (entry) =>
			addFact(entry, `Fact ${i}`))));
	const ledger = await repo.readContinuity(app, 'Novel');
	assert.equal(Object.keys(ledger.chapters).length, CHAPTERS);
});

test('the same updates without the lock lose chapters', async () => {
	// Control case: read, change and write the whole file without the lock.
	const app = fakeApp();
	const path = 'Novel/escritura/continuity.json';
	await Promise.all(Array.from({ length: CHAPTERS }, async (_, i) => {
		const file = app.vault.getAbstractFileByPath(path);
		const data = file ? JSON.parse(await app.vault.read(file)) : { version: 1, chapters: {} };
		data.chapters[`c${i}`] = addFact(emptyChapterContinuity(), `Fact ${i}`);
		if (file) await app.vault.modify(file, JSON.stringify(data));
		else await app.vault.create(path, JSON.stringify(data));
	}));
	const ledger = await repo.readContinuity(app, 'Novel');
	const kept = Object.keys(ledger.chapters).length;
	assert.ok(kept < CHAPTERS, `expected lost chapters, kept ${kept}`);
});

test('a damaged file is never overwritten', async () => {
	const path = 'Novel/escritura/continuity.json';
	const app = fakeApp({ [path]: '{ "chapters": { broken' });
	await assert.rejects(repo.readContinuity(app, 'Novel'), /is damaged/);
	await assert.rejects(
		repo.updateChapterContinuity(app, 'Novel', 'c1', (entry) => addFact(entry, 'x')),
		/is damaged/,
	);
	assert.equal(app.files.get(path), '{ "chapters": { broken');
});

test('listeners hear every write; pruning drops deleted chapters', async () => {
	const app = fakeApp();
	const heard = [];
	const stop = repo.onContinuityChange((folder) => heard.push(folder));
	await repo.updateChapterContinuity(app, 'Novel', 'c1', (entry) => addFact(entry, 'a'));
	await repo.updateChapterContinuity(app, 'Novel', 'c2', (entry) => addFact(entry, 'b'));
	stop();
	await repo.updateChapterContinuity(app, 'Novel', 'c3', (entry) => addFact(entry, 'c'));
	assert.deepEqual(heard, ['Novel', 'Novel']);

	await repo.pruneContinuity(app, 'Novel', ['c1', 'c3']);
	const ledger = await repo.readContinuity(app, 'Novel');
	assert.deepEqual(Object.keys(ledger.chapters).sort(), ['c1', 'c3']);
});
