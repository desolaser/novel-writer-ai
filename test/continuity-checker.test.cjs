const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// ContinuityChecker against a fake store, vault and model: facts are only
// extracted where the text changed, the author's facts survive, a chapter
// whose facts can't be read doesn't stop the check, and the report is saved.
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

let prompts = [];
let answerFor = () => '[]';
let novelState;
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name === 'obsidian') return { TFile, TFolder: class {}, normalizePath: (p) => p };
	if (name.endsWith('/context/aiCompletion')) {
		return {
			createUtilityCompletion: () => ({
				complete: async (prompt) => {
					prompts.push(prompt);
					return answerFor(prompt);
				},
			}),
		};
	}
	if (name.endsWith('/context/promptBuilder')) {
		return { buildCodexYaml: async () => '- nombre: Elena' };
	}
	if (name.endsWith('/novelWriterStore')) {
		const useNovelWriter = () => novelState;
		useNovelWriter.getState = () => novelState;
		return { useNovelWriter };
	}
	return originalLoad.call(this, name, parent, isMain);
};

const { ContinuityChecker } = require('../src/ui/react/features/continuity/continuityChecker.ts');

function fakeApp() {
	const files = new Map();
	return {
		files,
		vault: {
			getAbstractFileByPath: (path) => (files.has(path) ? new TFile(path) : null),
			read: async (file) => files.get(file.path),
			modify: async (file, content) => files.set(file.path, content),
			create: async (path, content) => files.set(path, content),
			createFolder: async () => {},
		},
	};
}

const chapter = (id, nombre, orden) => ({
	id_capitulo: id, nombre, outline: '', archivo: `${id}.md`, id_acto: 'a1',
	orden, created_at: '', updated_at: '',
});

let texts;
let app;
let checker;

beforeEach(() => {
	prompts = [];
	texts = {
		c1: 'Elena has green eyes. Marco owes the guild.',
		c2: '',
		c3: 'Her brown eyes narrowed.',
	};
	novelState = {
		actos: [{ id_acto: 'a1', nombre: 'Act', orden: 0 }],
		capitulos: [chapter('c1', 'Arrival', 0), chapter('c2', 'Empty', 1), chapter('c3', 'Return', 2)],
		entradas: [],
		store: { activeFolderPath: 'Novel', readBlueprint: async () => null },
		readCapituloTexto: async (id) => texts[id] ?? '',
	};
	answerFor = (prompt) => {
		if (prompt.includes('continuity editor')) {
			return JSON.stringify([{
				title: 'Eye color', quote: 'Her brown eyes narrowed', fact: 'Elena has green eyes',
				chapter: 1, explanation: 'Green in chapter 1.',
			}]);
		}
		if (prompt.includes('Chapter title: Arrival')) {
			return '["Elena has green eyes", "Marco owes the guild"]';
		}
		return '["Elena frowns"]';
	};
	app = fakeApp();
	checker = new ContinuityChecker({ app, settings: { data: {} } });
});

const extractions = () => prompts.filter((prompt) => prompt.includes('continuity record'));
const checks = () => prompts.filter((prompt) => prompt.includes('continuity editor'));

test('a check reads earlier facts, saves its report and maps the source chapter', async () => {
	const statuses = [];
	const { report, skipped } = await checker.check(
		novelState.capitulos[2], (status) => statuses.push(status),
	);
	assert.equal(extractions().length, 2, 'chapter 1 and the checked one; the empty one is skipped');
	assert.equal(checks().length, 1);
	assert.match(checks()[0], /Ch\. 1 "Arrival":\n- Elena has green eyes\n- Marco owes the guild/);
	assert.match(checks()[0], /--- CHAPTER 3: Return ---/);
	assert.match(checks()[0], /- nombre: Elena/);
	assert.deepEqual(skipped, []);
	assert.equal(report.facts_checked, 2);
	assert.equal(report.issues[0].fact_chapter_id, 'c1');
	assert.ok(statuses.includes('Checking: Return'));

	const ledger = await checker.readLedger();
	assert.equal(ledger.chapters.c3.report.issues.length, 1, 'the report is saved');
	assert.deepEqual(ledger.chapters.c3.facts.map((fact) => fact.text), ['Elena frowns']);
});

test('facts are extracted again only for chapters whose text changed', async () => {
	await checker.check(novelState.capitulos[2]);
	prompts = [];
	await checker.check(novelState.capitulos[2]);
	assert.equal(extractions().length, 0, 'nothing changed: no extraction');
	assert.equal(checks().length, 1);

	prompts = [];
	texts.c1 = 'Elena has green eyes. Marco paid the guild.';
	await checker.check(novelState.capitulos[2]);
	assert.equal(extractions().length, 1);
	assert.match(extractions()[0], /Marco paid the guild/);
});

test('the author\'s facts survive a new extraction and reach the check', async () => {
	await checker.check(novelState.capitulos[2]);
	await checker.updateEntry('c1', (entry) => ({
		...entry,
		facts: [...entry.facts, { id: 'mine', text: 'The bridge is out', source: 'author' }],
	}));
	texts.c1 = 'Elena has green eyes. Something else happens.';
	prompts = [];
	await checker.check(novelState.capitulos[2]);
	const ledger = await checker.readLedger();
	assert.ok(ledger.chapters.c1.facts.some((fact) => fact.text === 'The bridge is out'));
	assert.match(checks()[0], /- The bridge is out/);
});

test('an earlier chapter whose facts cannot be read is skipped, not fatal', async () => {
	const answer = answerFor;
	answerFor = (prompt) => (prompt.includes('Chapter title: Arrival') ? 'Sorry, no.' : answer(prompt));
	const { report, skipped } = await checker.check(novelState.capitulos[2]);
	assert.deepEqual(skipped, ['Arrival']);
	assert.equal(report.facts_checked, 0);
	assert.equal(checks().length, 1);
});

test('a chapter without text is not checked and costs nothing', async () => {
	await assert.rejects(checker.check(novelState.capitulos[1]), /has no text to check/);
	assert.equal(prompts.length, 0);
});

test('entries of deleted chapters are pruned on the next check', async () => {
	await checker.updateEntry('gone', (entry) => ({ ...entry, facts: [{ id: 'x', text: 'Old', source: 'author' }] }));
	await checker.check(novelState.capitulos[2]);
	const ledger = await checker.readLedger();
	assert.equal(ledger.chapters.gone, undefined);
});
