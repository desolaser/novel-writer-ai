const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

// Story timeline: day ranges of chapters and scenes, columns per day used,
// lanes by point of view, setting or character, stacked bars, flashbacks, and
// moving a chapter to another day.
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
	chapterDayRange,
	checkDayRange,
	formatStoryTime,
} = require('../src/utils/chapterInfo.ts');
const {
	buildStoryTimeline,
	chapterEntryMentions,
	clearChapterDays,
	moveChapterToDay,
} = require('../src/utils/storyTimeline.ts');

const entry = (id, nombre, categoria = 'cat-people', extra = {}) => ({
	id_entrada_codex: id, nombre, alias: '', descripcion: '', notas: '',
	id_categoria: categoria, archivado: false, tracking_por_nombre: true,
	case_sensitive: false, ai_context_policy: 'on_detect', detalles: [],
	color: '', ...extra,
});

const categories = [
	{ id_categoria: 'cat-people', nombre: 'Characters' },
	{ id_categoria: 'cat-places', nombre: 'Locations' },
];
const entries = [
	entry('elena', 'Elena'), entry('kael', 'Kael'), entry('port', 'Port Vey', 'cat-places'),
];

const chapter = (id, nombre, extra = {}) => ({
	id_capitulo: id, nombre, outline: '', archivo: null, id_acto: 'a1', orden: 0,
	created_at: '', updated_at: '', ...extra,
});

test('a chapter covers its day, its last day and its scenes\' days', () => {
	assert.equal(chapterDayRange({}), null);
	assert.deepEqual(chapterDayRange({ story_day: 3 }), { start: 3, end: 3 });
	assert.deepEqual(chapterDayRange({ story_day: 3, story_day_end: 5 }), { start: 3, end: 5 });
	assert.deepEqual(
		chapterDayRange({ story_day: 3, scenes: [{ story_day: 4 }, {}, { story_day: 7 }] }),
		{ start: 3, end: 7 },
		'scenes widen the range',
	);
	assert.deepEqual(chapterDayRange({ scenes: [{ story_day: 2 }] }), { start: 2, end: 2 });
	assert.equal(formatStoryTime({ story_day: 3, story_day_end: 5, story_time: 'winter' }), 'days 3–5 (winter)');
	assert.equal(formatStoryTime({ story_day: 3 }), 'day 3');
	assert.throws(() => checkDayRange(5, 3), /can't be before/);
	assert.doesNotThrow(() => checkDayRange(5, null));
	assert.doesNotThrow(() => checkDayRange(null, 3));
});

test('one column per day used, with the days skipped before each', () => {
	const timeline = buildStoryTimeline({
		chapters: [
			chapter('c1', 'Arrival', { story_day: 1 }),
			chapter('c2', 'Storm', { story_day: 2, story_day_end: 3 }),
			chapter('c3', 'Later', { story_day: 43 }),
			chapter('c4', 'Someday'),
		],
		entries, categories, mode: 'none',
	});
	assert.deepEqual(timeline.columns, [
		{ day: 1, gapBefore: 0 }, { day: 2, gapBefore: 0 },
		{ day: 3, gapBefore: 0 }, { day: 43, gapBefore: 39 },
	]);
	assert.deepEqual(timeline.undated, [{ chapterId: 'c4', number: 4, name: 'Someday' }]);
	const storm = timeline.lanes[0].cards.find((card) => card.chapterId === 'c2');
	assert.equal(storm.startColumn, 1);
	assert.equal(storm.endColumn, 2);
});

test('lanes by point of view and setting, in book order, the empty one last', () => {
	const chapters = [
		chapter('c1', 'One', { story_day: 1 }),
		chapter('c2', 'Two', { story_day: 2, pov_entry_id: 'kael', location_entry_id: 'port' }),
		chapter('c3', 'Three', { story_day: 3, pov_entry_id: 'elena' }),
		chapter('c4', 'Four', { story_day: 4, pov_entry_id: 'kael' }),
	];
	const byPov = buildStoryTimeline({ chapters, entries, categories, mode: 'pov' });
	assert.deepEqual(byPov.lanes.map((lane) => lane.name), ['Kael', 'Elena', 'No point of view']);
	assert.deepEqual(byPov.lanes[0].cards.map((card) => card.number), [2, 4]);
	assert.equal(byPov.lanes[0].entryId, 'kael');
	assert.equal(byPov.lanes[2].entryId, null);

	const bySetting = buildStoryTimeline({ chapters, entries, categories, mode: 'setting' });
	assert.deepEqual(bySetting.lanes.map((lane) => lane.name), ['Port Vey', 'No setting']);
});

test('character lanes: a chapter shows in the lane of every character it names', () => {
	const chapters = [
		chapter('c1', 'One', { story_day: 1 }),
		chapter('c2', 'Two', { story_day: 2 }),
		chapter('c3', 'Three', { story_day: 3 }),
	];
	const mentions = chapterEntryMentions(new Map([
		['c1', '---\nmemoryContent: Kael\n---\nElena and Kael reach Port Vey.'],
		['c2', 'Kael waits.'],
		['c3', 'Nobody is here.'],
	]), entries);
	assert.deepEqual([...mentions.get('c1')].sort(), ['elena', 'kael', 'port']);
	const timeline = buildStoryTimeline({ chapters, entries, categories, mode: 'characters', mentions });
	assert.deepEqual(
		timeline.lanes.map((lane) => [lane.name, lane.cards.map((card) => card.number)]),
		[['Elena', [1]], ['Kael', [1, 2]], ['No character named', [3]]],
		'places are not character lanes',
	);
});

test('overlapping chapters in a lane stack in rows; flashbacks are marked', () => {
	const chapters = [
		chapter('c1', 'Long', { story_day: 1, story_day_end: 5 }),
		chapter('c2', 'Inside', { story_day: 3 }),
		chapter('c3', 'After', { story_day: 6 }),
		chapter('c4', 'Back', { story_day: 2 }),
	];
	const lane = buildStoryTimeline({ chapters, entries, categories, mode: 'none' }).lanes[0];
	const rowOf = (number) => lane.cards.find((card) => card.number === number).row;
	assert.equal(rowOf(1), 0);
	assert.equal(rowOf(2), 1, 'overlaps chapter 1');
	assert.equal(rowOf(3), 0, 'fits after chapter 1');
	assert.equal(lane.rows, 2);
	const flashbacks = lane.cards.filter((card) => card.flashback).map((card) => card.number);
	assert.deepEqual(flashbacks, [4], 'starts before chapters read earlier; overlapping is not going back');
});

test('dated scenes are marks on their chapter\'s bar', () => {
	const timeline = buildStoryTimeline({
		chapters: [chapter('c1', 'Trip', {
			story_day: 3,
			scenes: [
				{ id: 's1', title: 'Docks', summary: '', story_day: 3 },
				{ id: 's2', title: '', summary: '' },
				{ id: 's3', title: 'Inn', summary: '', story_day: 5 },
			],
		})],
		entries, categories, mode: 'none',
	});
	const card = timeline.lanes[0].cards[0];
	assert.equal(card.endColumn, 1, 'the scene on day 5 widens the bar');
	assert.deepEqual(card.scenes.map((mark) => [mark.column, mark.label, mark.title]), [
		[0, '1', 'Scene 1: Docks (day 3)'],
		[1, '3', 'Scene 3: Inn (day 5)'],
	]);
});

test('moving a chapter keeps how long it lasts, scenes included', () => {
	const moved = moveChapterToDay(chapter('c1', 'Trip', {
		story_day: 3,
		story_day_end: 5,
		scenes: [{ id: 's1', story_day: 4 }, { id: 's2' }],
	}), 10);
	assert.deepEqual(moved.patch, { story_day: 10, story_day_end: 12 });
	assert.deepEqual(moved.scenes.map((scene) => scene.story_day), [11, null]);

	const fromScenes = moveChapterToDay(chapter('c2', 'Only scenes', {
		scenes: [{ id: 's1', story_day: 7 }, { id: 's2', story_day: 9 }],
	}), 20);
	assert.deepEqual(fromScenes.patch, { story_day: 20, story_day_end: null });
	assert.deepEqual(fromScenes.scenes.map((scene) => scene.story_day), [20, 22]);

	assert.deepEqual(moveChapterToDay(chapter('c3', 'Undated'), 4), {
		patch: { story_day: 4 }, scenes: null,
	});
	const cleared = clearChapterDays(chapter('c1', 'Trip', {
		story_day: 3, scenes: [{ id: 's1', story_day: 4 }],
	}));
	assert.deepEqual(cleared.patch, { story_day: null, story_day_end: null });
	assert.equal(cleared.scenes[0].story_day, null);
	assert.equal(clearChapterDays(chapter('c4', 'Plain', { story_day: 1 })).scenes, null);
});
