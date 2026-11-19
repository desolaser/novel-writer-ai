const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

// Chapter info (status, point of view, setting, story time): the text the
// prompts receive, its privacy rules, story days and the Metrics breakdown.
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

const {
	chapterInfoFacts,
	chapterInfoPromptLine,
	formatStoryTime,
	parseStoryDay,
} = require('../src/utils/chapterInfo.ts');
const { parseChapterStatus } = require('../src/constants/chapterStatus.ts');
const { computeNovelMetrics } = require('../src/utils/novelMetrics.ts');

const entry = (id, nombre, overrides = {}) => ({
	id_entrada_codex: id,
	nombre,
	alias: '',
	descripcion: '',
	notas: '',
	id_categoria: 'cat-people',
	archivado: false,
	tracking_por_nombre: true,
	case_sensitive: false,
	ai_context_policy: 'on_detect',
	detalles: [],
	color: '',
	...overrides,
});

const entries = [
	entry('e1', 'Elena'),
	entry('e2', 'Shadow', { ai_context_policy: 'never' }),
	entry('e3', 'Old Tower', { id_categoria: 'cat-places' }),
	entry('e4', 'Gone', { archivado: true }),
];

test('the prompt line names the point of view, setting and story time', () => {
	const line = chapterInfoPromptLine({
		status: 'drafted',
		pov_entry_id: 'e1',
		location_entry_id: 'e3',
		story_day: 12,
		story_time: 'third moon',
	}, entries);
	assert.equal(
		line,
		'Chapter info: Point of view: Elena. Setting: Old Tower. '
			+ 'Story time: day 12 (third moon).',
	);
	assert.ok(!line.includes('Drafted'), 'the status says nothing about the story');
});

test('entries hidden from the AI never reach the prompt line', () => {
	assert.equal(chapterInfoPromptLine({ pov_entry_id: 'e2' }, entries), '');
	assert.equal(chapterInfoPromptLine({ pov_entry_id: 'e4' }, entries), '');
	assert.equal(chapterInfoPromptLine({ pov_entry_id: 'missing' }, entries), '');
	assert.equal(chapterInfoPromptLine({}, entries), '');

	// The author's own views show them; only the AI does not see them.
	const facts = chapterInfoFacts({ pov_entry_id: 'e2' }, entries, {
		forAi: false,
		includeStatus: false,
	});
	assert.deepEqual(facts, [{ label: 'Point of view', value: 'Shadow' }]);
});

test('story time and story days', () => {
	assert.equal(formatStoryTime({ story_day: 3 }), 'day 3');
	assert.equal(formatStoryTime({ story_time: ' dawn ' }), 'dawn');
	assert.equal(formatStoryTime({ story_day: 0, story_time: 'eve' }), 'day 0 (eve)');
	assert.equal(formatStoryTime({}), '');

	assert.equal(parseStoryDay('12'), 12);
	assert.equal(parseStoryDay('Day 7'), 7);
	assert.equal(parseStoryDay('-3'), -3);
	assert.equal(parseStoryDay(''), null);
	assert.equal(parseStoryDay('none'), null);
	assert.throws(() => parseStoryDay('1.5'), /whole number/);
	assert.throws(() => parseStoryDay('soon'), /whole number/);
});

test('statuses are parsed by id or label', () => {
	assert.equal(parseChapterStatus('Drafted'), 'drafted');
	assert.equal(parseChapterStatus(' final '), 'final');
	assert.equal(parseChapterStatus('done'), undefined);
});

test('Metrics groups chapters by status and by point of view', () => {
	const acts = [{ id_acto: 'a1', nombre: 'One', orden: 0 }];
	const chapter = (id, orden, info) => ({
		id_capitulo: id,
		nombre: id,
		outline: '',
		archivo: 'x',
		id_acto: 'a1',
		orden,
		...info,
	});
	const chapters = [
		chapter('c1', 0, { status: 'final', pov_entry_id: 'e1' }),
		chapter('c2', 1, { status: 'drafted', pov_entry_id: 'e3' }),
		chapter('c3', 2, { status: 'drafted', pov_entry_id: 'e1' }),
		chapter('c4', 3, {}),
	];
	const texts = new Map([
		['c1', 'one two three'],
		['c2', 'one two'],
		['c3', 'one'],
	]);
	const metrics = computeNovelMetrics({
		acts,
		chapters,
		texts,
		entries,
		categories: [
			{ id_categoria: 'cat-people', nombre: 'Characters', color: '#111' },
			{ id_categoria: 'cat-places', nombre: 'Locations', color: '#222' },
		],
		target: null,
	});

	const byStatus = metrics.chapterInfo.byStatus.map((group) =>
		[group.name, group.chapters, group.words]);
	assert.deepEqual(byStatus, [
		['Drafted', 2, 3],
		['Final', 1, 3],
		['Not set', 1, 0],
	]);

	const byPov = metrics.chapterInfo.byPointOfView.map((group) =>
		[group.name, group.chapters, group.words, group.lastChapter, group.color]);
	assert.deepEqual(byPov, [
		['Elena', 2, 4, 3, '#111'],
		['Old Tower', 1, 2, 2, '#222'],
		['No point of view', 1, 0, 4, ''],
	]);
});

test('Metrics shows no breakdown while nothing is set', () => {
	const metrics = computeNovelMetrics({
		acts: [{ id_acto: 'a1', nombre: 'One', orden: 0 }],
		chapters: [{
			id_capitulo: 'c1', nombre: 'c1', outline: '', archivo: null,
			id_acto: 'a1', orden: 0,
		}],
		texts: new Map(),
		entries,
		categories: [],
		target: null,
	});
	assert.deepEqual(metrics.chapterInfo, { byStatus: [], byPointOfView: [] });
});
