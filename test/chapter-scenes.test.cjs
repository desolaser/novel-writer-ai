const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

// Scenes of a chapter: list operations, the length of each scene, the
// manuscript as scenes, the prompt blocks (with their privacy rules) and the
// "Split into scenes" answer.
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
	createScene,
	insertScene,
	moveScene,
	parseSceneWords,
	patchScene,
	removeScene,
	sceneLengths,
} = require('../src/utils/chapterScenes.ts');
const {
	joinSceneSections,
	placeScene,
	sceneIndexAt,
	splitSceneSections,
	trimSceneEdges,
} = require('../src/utils/sceneSections.ts');
const {
	buildSplitScenesPrompt,
	parseScenesResponse,
	sceneDraftBlock,
	sceneEditorBlock,
} = require('../src/context/scenePrompt.ts');

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
	entry('e1', 'Elena', { alias: 'Lena' }),
	entry('e2', 'Shadow', { ai_context_policy: 'never' }),
	entry('e3', 'Old Tower', { id_categoria: 'cat-places' }),
	entry('e4', 'Gone', { archivado: true }),
	entry('e5', 'Kael'),
];

const scene = (id, title, summary, extra = {}) =>
	({ id, title, summary, ...extra });

const chapter = (scenes, extra = {}) => ({
	id_capitulo: 'c1',
	nombre: 'The meeting',
	outline: 'Kael meets Elena and steals the map.',
	archivo: null,
	id_acto: 'a1',
	orden: 0,
	created_at: '',
	updated_at: '',
	scenes,
	...extra,
});

test('scenes are added, changed, moved and removed without mutating', () => {
	const first = createScene({ title: ' Market ', summary: 'Kael arrives.' });
	assert.ok(first.id, 'a new scene gets an id');
	assert.equal(first.title, 'Market');
	const second = createScene({ title: 'Deal' });
	const list = insertScene(insertScene([], first), second, 0);
	assert.deepEqual(list.map((item) => item.title), ['Deal', 'Market']);

	const moved = moveScene(list, second.id, 1);
	assert.deepEqual(moved.map((item) => item.title), ['Market', 'Deal']);
	assert.equal(moveScene(moved, second.id, 1), moved, 'past the end: no change');

	const patched = patchScene(moved, first.id, { goal: 'Get the map', id: 'x' });
	assert.equal(patched[0].goal, 'Get the map');
	assert.equal(patched[0].id, first.id, 'a patch never changes the id');
	assert.equal(moved[0].goal, undefined, 'the original list is untouched');

	assert.deepEqual(removeScene(patched, first.id).map((item) => item.title), ['Deal']);
});

test('scene words: empty clears, anything else must be a positive whole number', () => {
	assert.equal(parseSceneWords(''), null);
	assert.equal(parseSceneWords('none'), null);
	assert.equal(parseSceneWords('800'), 800);
	assert.equal(parseSceneWords('800 words'), 800);
	assert.throws(() => parseSceneWords('-5'), /positive whole number/);
	assert.throws(() => parseSceneWords('a lot'), /positive whole number/);
});

test('each scene gets an even share of the chapter, or its own words', () => {
	const chapterLength = { min: 2000, max: 4000, target: 3000 };
	const even = sceneLengths(
		[scene('a', '', ''), scene('b', '', ''), scene('c', '', '')],
		chapterLength,
	);
	assert.deepEqual(even[0], { min: 667, max: 1333, target: 1000 });

	const mixed = sceneLengths(
		[scene('a', '', '', { target_words: 2000 }), scene('b', '', ''), scene('c', '', '')],
		chapterLength,
	);
	assert.equal(mixed[0].target, 2000);
	assert.equal(mixed[1].target, 500, 'the rest is shared by the others');

	// Fixed scenes that eat the whole chapter still leave a usable scene.
	const tight = sceneLengths(
		[scene('a', '', '', { target_words: 3000 }), scene('b', '', '')],
		chapterLength,
	);
	assert.equal(tight[1].target, 150);
});

test('a manuscript splits into scenes at its breaks, frontmatter aside', () => {
	const text = '---\nmemoryContent: x\n---\n\nOne.\n\n***\n\nTwo.\n\n#\n\nThree.';
	const parts = splitSceneSections(text);
	assert.deepEqual(parts.sections, ['One.', 'Two.', 'Three.']);
	assert.deepEqual(parts.breaks, ['***', '#']);
	assert.equal(joinSceneSections(parts), 'One.\n\n***\n\nTwo.\n\n#\n\nThree.');
	assert.deepEqual(splitSceneSections('').sections, []);
	assert.deepEqual(splitSceneSections('---\na: b\n---\n').sections, []);
});

test('a drafted scene replaces its section or goes after the last one', () => {
	const parts = splitSceneSections('One.\n\n***\n\nTwo.');
	assert.equal(
		joinSceneSections(placeScene(parts, 2, 'Three.')),
		'One.\n\n***\n\nTwo.\n\n* * *\n\nThree.',
	);
	assert.equal(
		joinSceneSections(placeScene(parts, 0, 'New one.')),
		'New one.\n\n***\n\nTwo.',
	);
	assert.throws(() => placeScene(parts, 3, 'Four.'), /Write scene 3 first/);
});

test('the scene at the cursor counts the breaks before it', () => {
	assert.equal(sceneIndexAt(''), 0);
	assert.equal(sceneIndexAt('---\ntitle: x\n---\nOne.'), 0, 'frontmatter is not a break');
	assert.equal(sceneIndexAt('One.\n\n* * *\n\nTwo'), 1);
	assert.equal(sceneIndexAt('One.\n---\nTwo.\n⁂\nThree'), 2);
});

test('headings and breaks at the edges of a drafted scene are dropped', () => {
	assert.equal(trimSceneEdges('## Scene 2\n\n***\n\nText.\n\n* * *\n'), 'Text.');
	assert.equal(trimSceneEdges('Text.\n\n***\n\nMore.'), 'Text.\n\n***\n\nMore.');
});

test('the draft block gives the plan, the scene to write and where to stop', () => {
	const scenes = [
		scene('s1', 'Market', 'Kael arrives.'),
		scene('s2', '', 'The deal goes wrong.', {
			pov_entry_id: 'e1',
			location_entry_id: 'e3',
			goal: 'Get the map.',
			conflict: 'The seller knows him.',
			outcome: 'Guards arrive.',
		}),
	];
	const block = sceneDraftBlock(chapter(scenes), 1, entries);
	assert.match(block, /1\. Market: Kael arrives\./);
	assert.match(block, /Now write scene 2 of 2, "Scene 2"\./);
	assert.match(block, /Point of view: Elena\. Setting: Old Tower\./);
	assert.match(block, /Goal: Get the map\. Conflict: The seller knows him\. Outcome: Guards arrive\./);
	assert.match(block, /earlier scenes are already written/);
	assert.match(block, /last scene: close the chapter/);

	const first = sceneDraftBlock(chapter(scenes), 0, entries);
	assert.ok(!/earlier scenes/.test(first));
	assert.match(first, /next scene can pick up/);
	assert.equal(sceneDraftBlock(chapter(scenes), 5, entries), '');
});

test('scene entries hidden from the AI are never named', () => {
	const scenes = [
		scene('s1', 'Night', 'Someone watches.', {
			pov_entry_id: 'e2',
			location_entry_id: 'e4',
		}),
	];
	const block = sceneDraftBlock(chapter(scenes), 0, entries);
	assert.ok(!block.includes('Shadow'));
	assert.ok(!block.includes('Gone'));
	assert.ok(!block.includes('Point of view'));
});

test('the editor block names the scene at the cursor, or nothing past the plan', () => {
	const scenes = [scene('s1', 'Market', 'Kael arrives.'), scene('s2', 'Deal', 'It fails.')];
	const block = sceneEditorBlock(chapter(scenes), 1, entries);
	assert.match(block, /The text at the cursor is in scene 2 of 2, "Deal"\./);
	assert.match(block, /What happens: It fails\./);
	assert.ok(!/Write only this scene/.test(block), 'no stop rule while autocompleting');
	assert.equal(sceneEditorBlock(chapter(scenes), 2, entries), '');
	assert.equal(sceneEditorBlock(chapter([]), 0, entries), '');
});

test('the split prompt has the outline, the chapter info and the language rule', () => {
	const prompt = buildSplitScenesPrompt({
		chapter: chapter([]),
		chapterInfo: 'Chapter info: Point of view: Kael.',
		history: 'Chapter 1: Kael is a thief.',
		storyBible: '',
		blueprint: { language: 'Spanish' },
	});
	assert.match(prompt, /Chapter outline: Kael meets Elena and steals the map\./);
	assert.match(prompt, /Chapter info: Point of view: Kael\./);
	assert.match(prompt, /--- PREVIOUS CHAPTERS ---\nChapter 1: Kael is a thief\./);
	assert.match(prompt, /Spanish/);
	assert.match(prompt, /Return only a JSON array/);
});

test('the split answer becomes scenes, with entries resolved and hidden ones dropped', () => {
	const answer = 'Here you go:\n```json\n[\n'
		+ '{"title": "Market", "summary": "Kael arrives.", "goal": "Find Elena",'
		+ ' "conflict": "", "outcome": "He sees her", "pov": "kael", "setting": ""},\n'
		+ '{"title": "Deal", "summary": "It goes wrong.", "pov": "Lena",'
		+ ' "setting": "Old Tower"},\n'
		+ '{"title": "Night", "summary": "", "pov": "Shadow", "setting": "Gone"},\n'
		+ '{"title": "", "summary": ""}\n]\n```';
	const scenes = parseScenesResponse(answer, chapter([], { pov_entry_id: 'e5' }), entries);
	assert.equal(scenes.length, 3, 'a scene with no title or summary is dropped');
	assert.equal(scenes[0].pov_entry_id, undefined, 'same as the chapter: inherits');
	assert.equal(scenes[0].goal, 'Find Elena');
	assert.equal(scenes[0].conflict, undefined);
	assert.equal(scenes[1].pov_entry_id, 'e1', 'resolved by alias');
	assert.equal(scenes[1].location_entry_id, 'e3');
	assert.equal(scenes[2].pov_entry_id, undefined, '"Never" entry not accepted');
	assert.equal(scenes[2].location_entry_id, undefined, 'archived entry not accepted');
	assert.ok(scenes.every((item) => item.id));
});

test('an answer without a readable scene list is an error', () => {
	const owner = chapter([]);
	assert.throws(() => parseScenesResponse('No scenes here.', owner, entries), /did not return/);
	assert.throws(() => parseScenesResponse('[{"title": }]', owner, entries), /could not be read/);
	assert.throws(() => parseScenesResponse('[]', owner, entries), /no scenes/);
});
