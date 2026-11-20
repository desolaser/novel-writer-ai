const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

// "Names without an entry" in Metrics: proper names found locally in the
// manuscript, without the false alarms of sentence starts, dialogue, titles,
// words also used in lowercase and names already in the codex.
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
const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name === 'obsidian') return { TFile, TFolder: class {}, normalizePath: (p) => p };
	return originalLoad.call(this, name, parent, isMain);
};

const { findNameCandidates } = require('../src/utils/nameCandidates.ts');
const configRepo = require('../src/infrastructure/storage/repos/NovelConfigRepo.ts');
const { computeNovelMetrics } = require('../src/utils/novelMetrics.ts');

const entry = (id, nombre, alias = '', extra = {}) => ({
	id_entrada_codex: id, nombre, alias, descripcion: '', notas: '',
	id_categoria: 'cat', archivado: false, tracking_por_nombre: true,
	case_sensitive: false, ai_context_policy: 'on_detect', detalles: [], color: '',
	...extra,
});

const CHAPTER_1 = [
	'Marta abrió la puerta del taller.',
	'—Vamos —dijo Marta—. Kael nos espera en Port Vey.',
	'Cuando Marta llegó a Port Vey, el Rey la esperaba. El rey sonrió.',
	'Elena saludó a Kael con frialdad.',
].join('\n');

const CHAPTER_2 = [
	'Port Vey olía a sal. Kael y Marta caminaron hasta el muelle.',
	'El Señor Okonkwo los recibió. Saludaron al Señor Okonkwo y a Okonkwo le gustó.',
	'Mañana Marta volvería. Vamos, pensó.',
].join('\n');

const names = (candidates) => candidates.map((candidate) => candidate.name);

function find(extra = {}) {
	return findNameCandidates({
		chapters: [{ number: 1, text: CHAPTER_1 }, { number: 2, text: CHAPTER_2 }],
		entries: [entry('e1', 'Elena Vargas')],
		ignored: [],
		...extra,
	});
}

test('frequent names mid-sentence are suggested, most mentioned first', () => {
	const candidates = find();
	assert.deepEqual(names(candidates), ['Marta', 'Kael', 'Okonkwo', 'Port Vey']);
	const marta = candidates[0];
	assert.equal(marta.mentions, 5);
	assert.equal(marta.chapters, 2);
	assert.equal(marta.firstChapter, 1);
	assert.match(marta.example, /dijo Marta/);
});

test('sentence and dialogue starts, titles and lowercase words are not names', () => {
	const found = names(find());
	assert.ok(!found.includes('Vamos'), 'starts a line of dialogue every time');
	assert.ok(!found.includes('Cuando'));
	assert.ok(!found.includes('Rey'), 'a title, and also used as "rey"');
	assert.ok(!found.includes('Señor Okonkwo'), 'the title is not part of the name');
	assert.ok(!found.includes('Vey'), 'only appears inside "Port Vey"');
	assert.ok(!found.includes('Mañana Marta'));
});

test('names already in the codex, or part of one, are left out', () => {
	assert.ok(!names(find()).includes('Elena'), 'first name of "Elena Vargas"');
	const withAlias = find({ entries: [entry('e1', 'Kael Dorn', 'el Cuervo')] });
	assert.ok(!names(withAlias).includes('Kael'));
	const signs = find({ entries: [entry('e1', 'R0X4N3 (Kael)'), entry('e3', 'Dr. Okonkwo')] });
	assert.ok(!names(signs).includes('Kael'), 'a word between parentheses');
	assert.ok(!names(signs).includes('Okonkwo'), 'after "Dr."');
	const archived = find({ entries: [entry('e2', 'Marta', '', { archivado: true })] });
	assert.ok(!names(archived).includes('Marta'), 'an archived entry still exists');
});

test('ignored names are not suggested, whatever their case or accents', () => {
	const found = names(find({ ignored: ['marta', 'PORT VEY'] }));
	assert.deepEqual(found, ['Kael', 'Okonkwo']);
});

test('a word used in lowercase as often as capitalized is a common word', () => {
	const text = 'Juró por Dios. Que Dios los ayude. Ningún dios responde. '
		+ 'Los dioses callan, y el dios del mar duerme. Otro dios mira.';
	const candidates = findNameCandidates({
		chapters: [{ number: 1, text }], entries: [], ignored: [],
	});
	assert.ok(!names(candidates).includes('Dios'));
});

test('English: titles, weekdays and connectors inside names', () => {
	const text = [
		'On Monday, Captain Reyes sailed to the Isle of Mists.',
		'The crew feared the Isle of Mists. Reyes did not.',
		'By Monday night Reyes saw the Isle of Mists again.',
	].join('\n');
	const candidates = findNameCandidates({
		chapters: [{ number: 1, text }], entries: [], ignored: [],
	});
	assert.deepEqual(names(candidates), ['Isle of Mists', 'Reyes']);
});

test('Metrics reports the candidates and takes the ignored names', () => {
	const metrics = computeNovelMetrics({
		acts: [{ id_acto: 'a1', nombre: 'Act', orden: 0 }],
		chapters: [
			{ id_capitulo: 'c1', nombre: 'One', id_acto: 'a1', orden: 0, archivo: 'x', outline: '' },
			{ id_capitulo: 'c2', nombre: 'Two', id_acto: 'a1', orden: 1, archivo: 'x', outline: '' },
		],
		texts: new Map([['c1', `---\na: b\n---\n${CHAPTER_1}`], ['c2', CHAPTER_2]]),
		entries: [entry('e1', 'Elena Vargas')],
		categories: [],
		target: null,
		ignoredNames: ['Okonkwo'],
	});
	assert.deepEqual(names(metrics.nameCandidates), ['Marta', 'Kael', 'Port Vey']);
});

test('ignored names live in the novel config, next to its memory', async () => {
	const path = 'Novel/__config.json';
	const files = new Map([[path, JSON.stringify({ memoryContent: 'The story so far.' })]]);
	const app = { vault: {
		getAbstractFileByPath: (filePath) => (files.has(filePath) ? new TFile(filePath) : null),
		read: async (file) => files.get(file.path),
		modify: async (file, content) => files.set(file.path, content),
		create: async (filePath, content) => files.set(filePath, content),
		createFolder: async () => {},
	} };
	await Promise.all(['Marta', 'Kael', 'Port Vey'].map((name) =>
		configRepo.changeIgnoredNames(app, 'Novel', (names) => [...names, name])));
	assert.deepEqual(
		(await configRepo.readIgnoredNames(app, 'Novel')).sort(),
		['Kael', 'Marta', 'Port Vey'],
	);
	await configRepo.changeIgnoredNames(app, 'Novel', () => []);
	const config = JSON.parse(files.get(path));
	assert.equal(config.ignoredNames, undefined, 'an empty list removes the key');
	assert.equal(config.memoryContent, 'The story so far.');
});
