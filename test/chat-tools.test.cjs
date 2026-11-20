const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// The chat tools against an in-memory novel: privacy rules of the codex,
// structure moves, custom details, memory and the catalogue itself.
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

const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name === 'obsidian') return {};
	return originalLoad.call(this, name, parent, isMain);
};

const { executeToolCall } = require('../src/tools/executor.ts');
const {
	ALL_TOOLS_AVAILABLE,
	TOOL_DEFINITIONS,
	availableTools,
} = require('../src/tools/registry.ts');
const { parsePlanSteps } = require('../src/utils/planSteps.ts');
const { resolveCallTargets } = require('../src/tools/callTargets.ts');
const {
	MEMORY_MARKER_END,
	MEMORY_MARKER_START,
} = require('../src/utils/generatedMemory.ts');

const entry = (id, nombre, overrides = {}) => ({
	id_entrada_codex: id,
	nombre,
	alias: '',
	descripcion: '',
	first_message: '',
	notas: 'SECRET NOTE',
	id_categoria: 'cat-people',
	archivado: false,
	tracking_por_nombre: true,
	case_sensitive: false,
	ai_context_policy: 'on_detect',
	detalles: [],
	tags: [],
	...overrides,
});

/** A small novel held in memory, implementing every ToolContext method. */
function fakeNovel() {
	const data = {
		acts: [
			{ id_acto: 'a1', nombre: 'Beginning', resumen: '', orden: 0 },
			{ id_acto: 'a2', nombre: 'Middle', resumen: 'Old summary.', orden: 1 },
		],
		chapters: [
			{ id_capitulo: 'c1', nombre: 'Arrival', outline: 'They arrive.', id_acto: 'a1', orden: 0, archivo: 'x' },
			{ id_capitulo: 'c2', nombre: 'The Storm', outline: '', id_acto: 'a1', orden: 1, archivo: 'x' },
			{ id_capitulo: 'c3', nombre: 'Aftermath', outline: '', id_acto: 'a2', orden: 0, archivo: 'x' },
		],
		texts: {
			c1: 'Elena walked in.\n\nThe door creaked.\n\nShadow watched from afar.',
			c2: 'Rain fell on Elena and on the town.',
			c3: '',
		},
		entries: [
			entry('e1', 'Elena', {
				alias: 'Lena',
				detalles: [
					{ id_detalle: 'd-secret', valor: 'Is a spy' },
					{ id_detalle: 'd-mentor', valor: 'e3' },
				],
			}),
			entry('e2', 'Shadow', { ai_context_policy: 'never', descripcion: 'Hidden villain' }),
			entry('e3', 'Marco', {
				detalles: [{ id_detalle: 'd-mentor', valor: 'e1' }],
			}),
		],
		categories: [
			{ id_categoria: 'cat-people', nombre: 'Characters' },
			{ id_categoria: 'cat-places', nombre: 'Places' },
			{ id_categoria: 'cat-other', nombre: 'Others' },
		],
		details: [
			{ id_detalle: 'd-faction', nombre: 'Faction', tipo_detalle: 'dropdown', incluir_ia: true },
			{ id_detalle: 'd-mentor', nombre: 'Mentor', tipo_detalle: 'codex_ref', incluir_ia: true },
			{ id_detalle: 'd-age', nombre: 'Age', tipo_detalle: 'line', incluir_ia: true },
			{ id_detalle: 'd-secret', nombre: 'Secret', tipo_detalle: 'text', incluir_ia: false },
		],
		options: {
			'd-faction': [
				{ id_opcion_detalle: 'o-red', nombre: 'Red Guard' },
				{ id_opcion_detalle: 'o-blue', nombre: 'Blue Order' },
			],
		},
		tags: [{ id_tag: 't1', nombre: 'main' }],
		blueprint: { wordsPerChapter: { min: 5, max: 7 }, tense: 'unset', narrativeTime: 'linear', audience: 'undefined', structure: 'three-act', chapterCount: 3, title: 'Test' },
		meta: { chapter: {}, novel: {} },
		opened: [],
		selection: { notePath: 'Notes/Draft.md', selection: '', cursorParagraph: 'A paragraph.' },
		notes: { 'Research/Ships.md': 'Galleons have three masts.' },
	};
	const findEntry = (id) => data.entries.find((item) => item.id_entrada_codex === id);
	let tagSeq = 1;

	const context = {
		listChapters: () => data.chapters,
		listActs: () => data.acts,
		readChapterText: async (id) => data.texts[id] ?? '',
		createAct: async (nombre) => {
			const act = { id_acto: `a${data.acts.length + 1}`, nombre, resumen: '', orden: data.acts.length };
			data.acts = [...data.acts, act];
			return act;
		},
		updateAct: async (id, patch) => {
			data.acts = data.acts.map((act) => (act.id_acto === id ? { ...act, ...patch } : act));
		},
		createChapter: async () => undefined,
		updateChapter: async (id, patch) => {
			data.chapters = data.chapters.map((item) => (item.id_capitulo === id ? { ...item, ...patch } : item));
		},
		changeChapterScenes: async (id, change) => {
			const owner = data.chapters.find((item) => item.id_capitulo === id);
			const scenes = change(owner.scenes ?? []);
			await context.updateChapter(id, { scenes });
			return scenes;
		},
		writeChapterText: async (id, content) => {
			data.texts[id] = content;
			return 'path';
		},

		listCodexEntries: () => data.entries,
		listCategories: () => data.categories,
		listDetalles: () => data.details,
		listOptions: async (id) => data.options[id] ?? [],
		listDetailsOfCategory: async (id) => (id === 'cat-people'
			? data.details
			: []),
		listTags: () => data.tags,
		createCodexEntry: async (idCategoria, nombre) => {
			const created = entry(`e${data.entries.length + 1}`, nombre, { id_categoria: idCategoria });
			data.entries = [...data.entries, created];
			return created;
		},
		updateCodexEntry: async (updated) => {
			data.entries = data.entries.map((item) =>
				(item.id_entrada_codex === updated.id_entrada_codex ? updated : item));
		},
		archiveCodexEntry: async (id) => {
			findEntry(id).archivado = true;
		},
		setDetailValue: async (idEntry, idDetalle, valor) => {
			const target = findEntry(idEntry);
			const others = target.detalles.filter((item) => item.id_detalle !== idDetalle);
			target.detalles = [...others, { id_detalle: idDetalle, valor }];
		},
		findOrCreateTag: async (nombre) => {
			const found = data.tags.find((tag) => tag.nombre === nombre);
			if (found) return found;
			const tag = { id_tag: `new${tagSeq++}`, nombre };
			data.tags = [...data.tags, tag];
			return tag;
		},
		setEntryTags: async (idEntry, ids) => {
			findEntry(idEntry).tags = ids;
		},
		readBlueprint: async () => data.blueprint,
		updateBlueprint: async (patch) => {
			data.blueprint = { ...data.blueprint, ...patch };
		},
		deleteChapter: async (id) => {
			data.chapters = data.chapters.filter((item) => item.id_capitulo !== id);
			delete data.texts[id];
		},

		generated: [],
		generateOutline: async (id, source) => {
			if (source === 'manuscript' && !data.texts[id]) return null;
			const outline = `Generated from ${source}.`;
			await context.updateChapter(id, { outline });
			return outline;
		},
		summarizeAct: async (id) => {
			await context.updateAct(id, { resumen: 'Generated summary.' });
			return 'Generated summary.';
		},
		draftChapter: async (id, words) => {
			// Without words, the Story Bible's range (100-140 in this fake novel).
			const length = words
				? { min: Math.round(words * 0.9), max: Math.round(words * 1.1), target: words }
				: { min: 100, max: 140, target: 120 };
			const text = Array.from({ length: length.target }, () => 'word').join(' ');
			data.texts[id] = text;
			return { text, length };
		},
		refreshStoryContext: async (id) => (id ? 1 : data.chapters.length),
		continuityIssues: [],
		checkContinuity: async (id) => ({
			report: {
				checked_at: 'now', text_hash: 'h', facts_checked: 4,
				issues: context.continuityIssues,
			},
			skipped: id === 'c3' ? ['Arrival'] : [],
		}),

		portraitPrompts: [],
		generatePortrait: async (id, prompt) => {
			context.portraitPrompts.push(prompt);
			const target = findEntry(id);
			const replaced = Boolean(target.thumbnail);
			target.thumbnail = 'data:image/png;base64,AAAA';
			return { replaced };
		},

		openChapterFile: async (id) => {
			data.opened.push(`file:${id}`);
			return true;
		},
		openChapterOutline: async (id) => {
			data.opened.push(`outline:${id}`);
		},
		openCodexEntry: async (id) => {
			data.opened.push(`entry:${id}`);
		},
		readEditorSelection: () => data.selection,
		findNote: (reference) => {
			const path = Object.keys(data.notes).find((key) => key.toLowerCase().includes(reference.toLowerCase()));
			return path ? { path, suggestions: [] } : { path: null, suggestions: ['Research/Ships.md'] };
		},
		readNote: async (path) => data.notes[path],
		readPromptMeta: async (chapterId, key) => {
			const level = chapterId ? data.meta.chapter[chapterId] ?? {} : data.meta.novel;
			return { own: level[key] ?? null, inherited: 'global value' };
		},
		writePromptMeta: async (chapterId, key, value) => {
			if (chapterId) {
				data.meta.chapter[chapterId] = { ...(data.meta.chapter[chapterId] ?? {}), [key]: value };
			} else {
				data.meta.novel[key] = value;
			}
		},
	};
	return { data, context };
}

let callSeq = 0;
async function run(context, name, args = {}, approved = true) {
	callSeq += 1;
	return executeToolCall({ id: `t${callSeq}`, name, args, raw: '' }, context, approved);
}

test('every catalogued tool has a handler, and write tools need approval', async () => {
	const { context } = fakeNovel();
	for (const definition of TOOL_DEFINITIONS) {
		const result = await run(context, definition.name, {}, false);
		assert.ok(!result.output.startsWith('Unknown tool'), `${definition.name} has no handler`);
		if (definition.kind === 'write') {
			assert.equal(result.ok, false);
			assert.match(result.output, /requires the author's approval/);
		}
	}
	const names = TOOL_DEFINITIONS.map((definition) => definition.name);
	assert.equal(new Set(names).size, names.length, 'tool names are unique');
});

test('codex entries marked Never are invisible to every tool', async () => {
	const { context } = fakeNovel();
	const list = await run(context, 'list_codex');
	assert.ok(!list.output.includes('Shadow'));

	const read = await run(context, 'read_codex_entry', { entry: 'Shadow' });
	assert.equal(read.ok, false);

	const search = await run(context, 'search_novel', { query: 'villain', scope: 'codex' });
	assert.match(search.output, /No matches/);

	const mentions = await run(context, 'find_mentions', { entry: 'Shadow' });
	assert.equal(mentions.ok, false);

	const duplicate = await run(context, 'create_codex_entry', { name: 'Shadow' });
	assert.equal(duplicate.ok, false);
	assert.ok(!duplicate.output.includes('villain'));
});

test('details hidden from the AI and private notes never reach the output', async () => {
	const { context } = fakeNovel();
	const read = await run(context, 'read_codex_entry', { entry: 'Elena' });
	assert.ok(read.ok);
	assert.ok(!read.output.includes('Is a spy'));
	assert.ok(!read.output.includes('SECRET NOTE'));
	assert.match(read.output, /Mentor: Marco/);
	assert.match(read.output, /Referenced by: Marco \(as Mentor\)/);

	const fields = await run(context, 'list_codex_fields', { category: 'Characters' });
	assert.ok(!fields.output.includes('Secret'));
	assert.match(fields.output, /Faction \(one of: Red Guard \| Blue Order\)/);

	const write = await run(context, 'set_codex_detail', { entry: 'Elena', detail: 'Secret', value: 'x' });
	assert.equal(write.ok, false);
});

test('set_codex_detail stores option and entry ids, and rejects unknown options', async () => {
	const { data, context } = fakeNovel();
	const faction = await run(context, 'set_codex_detail', { entry: 'Lena', detail: 'Faction', value: 'blue order' });
	assert.ok(faction.ok, faction.output);
	const elena = data.entries.find((item) => item.nombre === 'Elena');
	assert.equal(elena.detalles.find((item) => item.id_detalle === 'd-faction').valor, 'o-blue');

	const mentor = await run(context, 'set_codex_detail', { entry: 'Marco', detail: 'Mentor', value: 'Elena' });
	assert.ok(mentor.ok, mentor.output);

	const hiddenRef = await run(context, 'set_codex_detail', { entry: 'Marco', detail: 'Mentor', value: 'Shadow' });
	assert.equal(hiddenRef.ok, false);

	const bad = await run(context, 'set_codex_detail', { entry: 'Elena', detail: 'Faction', value: 'Green' });
	assert.equal(bad.ok, false);
	assert.match(bad.output, /Options: Red Guard, Blue Order/);

	await run(context, 'set_codex_detail', { entry: 'Elena', detail: 'Age', value: '31' });
	const cleared = await run(context, 'set_codex_detail', { entry: 'Elena', detail: 'Age', value: '' });
	assert.match(cleared.output, /Cleared Age/);
	assert.equal(elena.detalles.find((item) => item.id_detalle === 'd-age').valor, null);
});

test('update_codex_entry changes category, tags and first message', async () => {
	const { data, context } = fakeNovel();
	const result = await run(context, 'update_codex_entry', {
		entry: 'Marco',
		category: 'Places',
		tags: 'main, rival',
		first_message: 'Hello, {{user}}.',
	});
	assert.ok(result.ok, result.output);
	const marco = data.entries.find((item) => item.nombre === 'Marco');
	assert.equal(marco.id_categoria, 'cat-places');
	assert.equal(marco.first_message, 'Hello, {{user}}.');
	assert.deepEqual(marco.tags, ['t1', 'new1']);

	await run(context, 'update_codex_entry', { entry: 'Marco', tags: 'extra', mode: 'append' });
	assert.equal(data.entries.find((item) => item.nombre === 'Marco').tags.length, 3);

	const archived = await run(context, 'archive_codex_entry', { entry: 'Marco' });
	assert.ok(archived.ok);
	assert.equal((await run(context, 'read_codex_entry', { entry: 'Marco' })).ok, false);
});

test('read_chapter reads a range of paragraphs', async () => {
	const { context } = fakeNovel();
	const whole = await run(context, 'read_chapter', { chapter: '#1' });
	assert.match(whole.output, /\(3 paragraphs\)/);

	const part = await run(context, 'read_chapter', { chapter: 'Arrival', from: '2', to: '3' });
	assert.match(part.output, /paragraphs 2-3 of 3/);
	assert.ok(!part.output.includes('Elena walked in.'));
	assert.ok(part.output.includes('The door creaked.'));

	const bad = await run(context, 'read_chapter', { chapter: 'Arrival', from: 'zero' });
	assert.equal(bad.ok, false);
});

test('move_chapter reorders inside an act and across acts', async () => {
	const { data, context } = fakeNovel();
	const order = () => data.chapters
		.map((item) => `${item.id_acto}:${item.orden}:${item.id_capitulo}`)
		.sort();

	await run(context, 'move_chapter', { chapter: 'The Storm', position: '1' });
	assert.deepEqual(order(), ['a1:0:c2', 'a1:1:c1', 'a2:0:c3']);

	await run(context, 'move_chapter', { chapter: 'Arrival', act: 'Middle', position: '2' });
	assert.deepEqual(order(), ['a1:0:c2', 'a2:0:c3', 'a2:1:c1']);

	const renamed = await run(context, 'rename_chapter', { chapter: 'Aftermath', name: 'After the Rain' });
	assert.ok(renamed.ok);
	assert.equal(data.chapters.find((item) => item.id_capitulo === 'c3').nombre, 'After the Rain');
});

test('acts: read, create and update the summary', async () => {
	const { data, context } = fakeNovel();
	const read = await run(context, 'read_act', { act: '#2' });
	assert.match(read.output, /Summary: Old summary\./);
	assert.match(read.output, /#3 Aftermath/);

	await run(context, 'update_act', { act: 'Middle', summary: 'More.', mode: 'append' });
	assert.equal(data.acts[1].resumen, 'Old summary.\n\nMore.');

	const duplicate = await run(context, 'create_act', { name: 'beginning' });
	assert.equal(duplicate.ok, false);
	const created = await run(context, 'create_act', { name: 'End', summary: 'It ends.' });
	assert.ok(created.ok);
	assert.equal(data.acts[2].resumen, 'It ends.');
});

test('novel_status reports gaps and lengths against the blueprint target', async () => {
	const { context } = fakeNovel();
	const status = await run(context, 'novel_status');
	assert.match(status.output, /3 chapters in 2 acts/);
	assert.match(status.output, /Chapters without text: #3 Aftermath/);
	assert.match(status.output, /Acts without summary: Beginning/);
	assert.match(status.output, /Under target: none/);
	assert.match(status.output, /Over target: #1 Arrival \(10\), #2 The Storm \(8\)/);

	const blueprint = await run(context, 'read_blueprint');
	assert.match(blueprint.output, /Tense: not set \(defaults to past\)/);
});

test('find_mentions finds names and aliases across chapters', async () => {
	const { context } = fakeNovel();
	const result = await run(context, 'find_mentions', { entry: 'Elena' });
	assert.match(result.output, /mentioned 2 times in 2 chapters/);
});

test('write_memory keeps the generated story context', async () => {
	const { data, context } = fakeNovel();
	const generated = `${MEMORY_MARKER_START}\nEarlier: a storm.\n${MEMORY_MARKER_END}`;
	data.meta.chapter.c2 = { memoryContent: `Old note.\n\n${generated}` };

	const write = await run(context, 'write_memory', { chapter: 'The Storm', content: 'Elena fears water.' });
	assert.ok(write.ok, write.output);
	assert.equal(data.meta.chapter.c2.memoryContent, `Elena fears water.\n\n${generated}`);

	const read = await run(context, 'read_memory', { chapter: 'The Storm' });
	assert.match(read.output, /Memory of chapter "The Storm": Elena fears water\./);
	assert.match(read.output, /Generated story context/);

	await run(context, 'write_memory', { field: 'author_note', content: 'Short sentences.' });
	assert.equal(data.meta.novel.authorNote, 'Short sentences.');
	const bad = await run(context, 'write_memory', { field: 'other', content: 'x' });
	assert.equal(bad.ok, false);
});

test('workspace tools open views and read the selection and notes', async () => {
	const { data, context } = fakeNovel();
	await run(context, 'open_chapter', { chapter: '#2', view: 'outline' });
	await run(context, 'open_codex_entry', { entry: 'Lena' });
	assert.deepEqual(data.opened, ['outline:c2', 'entry:e1']);

	const selection = await run(context, 'read_selection');
	assert.match(selection.output, /Paragraph at the cursor:\n\nA paragraph\./);

	const note = await run(context, 'read_note', { note: 'ships' });
	assert.match(note.output, /three masts/);
	const missing = await run(context, 'read_note', { note: 'dragons' });
	assert.equal(missing.ok, false);
	assert.match(missing.output, /Close matches: Research\/Ships\.md/);
});

test('update_plan parses the checklist', async () => {
	const steps = parsePlanSteps('1. [x] Read chapters\n- [>] Fix names\n[ ] Summarize\nloose step');
	assert.deepEqual(steps.map((step) => step.status), ['done', 'active', 'pending', 'pending']);
	assert.equal(steps[1].text, 'Fix names');

	const { context } = fakeNovel();
	const result = await run(context, 'update_plan', { steps: '[x] One\n[>] Two\n[ ] Three' }, false);
	assert.ok(result.ok, 'update_plan runs without approval');
	assert.equal(result.output, 'Plan updated: 1/3 done. Next: Two');
});

test('tool groups turned off in Settings leave the catalogue, and so can read_note', () => {
	const names = (availability) => availableTools(availability).map((tool) => tool.name);
	assert.equal(names(ALL_TOOLS_AVAILABLE).length, TOOL_DEFINITIONS.length);

	const noCodex = { ...ALL_TOOLS_AVAILABLE, groups: { ...ALL_TOOLS_AVAILABLE.groups, codex: false } };
	assert.ok(!names(noCodex).includes('read_codex_entry'));
	assert.ok(names(noCodex).includes('read_chapter'));

	const noNotes = { ...ALL_TOOLS_AVAILABLE, noteAccess: 'off' };
	assert.ok(!names(noNotes).includes('read_note'));
	assert.ok(names(noNotes).includes('read_selection'));
});

test('delete_chapter always asks, and removes the chapter', async () => {
	const definition = TOOL_DEFINITIONS.find((tool) => tool.name === 'delete_chapter');
	assert.equal(definition.alwaysAsk, true);
	const { data, context } = fakeNovel();
	const result = await run(context, 'delete_chapter', { chapter: 'Arrival' });
	assert.ok(result.ok, result.output);
	assert.ok(!data.chapters.some((item) => item.id_capitulo === 'c1'));
});

test('update_blueprint changes only the given fields and marks them as deduced', async () => {
	const { data, context } = fakeNovel();
	const result = await run(context, 'update_blueprint', {
		genre: 'Space opera',
		tense: 'Present',
		words_per_chapter: '1500 - 2500',
	});
	assert.ok(result.ok, result.output);
	assert.equal(data.blueprint.genre, 'Space opera');
	assert.equal(data.blueprint.tense, 'present');
	assert.deepEqual(data.blueprint.wordsPerChapter, { min: 1500, max: 2500 });
	assert.equal(data.blueprint.title, 'Test');
	assert.deepEqual([...data.blueprint.inferred].sort(), ['genre', 'wordsPerChapter']);

	const wrong = await run(context, 'update_blueprint', { tense: 'pluperfect' });
	assert.equal(wrong.ok, false);
	assert.match(wrong.output, /past, present, future/);
	const empty = await run(context, 'update_blueprint', {});
	assert.equal(empty.ok, false);
});

test('generator tools: outlines, act summaries and drafts', async () => {
	const { data, context } = fakeNovel();
	data.texts.c1 = '';
	const noText = await run(context, 'generate_outline', { chapter: 'Arrival' });
	assert.equal(noText.ok, false);
	assert.match(noText.output, /story_so_far/);

	const fromStory = await run(context, 'generate_outline', { chapter: 'Arrival', source: 'story_so_far' });
	assert.ok(fromStory.ok, fromStory.output);
	assert.equal(data.chapters.find((item) => item.id_capitulo === 'c1').outline, 'Generated from story_so_far.');

	const summary = await run(context, 'summarize_act', { act: 'Beginning' });
	assert.ok(summary.ok, summary.output);
	assert.equal(data.acts[0].resumen, 'Generated summary.');

	const draft = await run(context, 'draft_chapter', { chapter: 'Arrival' });
	assert.ok(draft.ok, draft.output);
	assert.match(draft.output, /120 words \(accepted range 100-140\)/);

	const again = await run(context, 'draft_chapter', { chapter: 'Arrival', words: '200' });
	assert.equal(again.ok, false, 'a chapter with text needs overwrite yes');
	assert.match(again.output, /overwrite yes/);
	const replaced = await run(context, 'draft_chapter', { chapter: 'Arrival', words: '200', overwrite: 'yes' });
	assert.ok(replaced.ok, replaced.output);

	const all = await run(context, 'refresh_story_context', {});
	assert.match(all.output, /memory of \d+ chapters/);
});

test('references like #2 are resolved to names for the approval card', () => {
	const { context } = fakeNovel();
	const call = (args) => ({ id: 'x', name: 'delete_chapter', args, raw: '' });
	assert.deepEqual(resolveCallTargets(call({ chapter: '#2' }), context), { chapter: '#2 The Storm' });
	assert.deepEqual(resolveCallTargets(call({ chapter: 'storm' }), context), { chapter: '#2 The Storm' });
	assert.deepEqual(resolveCallTargets(call({ act: '#2' }), context), { act: '#2 Middle' });
	assert.deepEqual(resolveCallTargets(call({ chapter: 'Arrival' }), context), {},
		'nothing to add when the model already wrote the exact name');
	assert.deepEqual(resolveCallTargets(call({ chapter: '#99' }), context), {},
		'an unknown reference is left for the tool to report');
});

test('generate_portrait sends only what the AI may see, and sets the image', async () => {
	const { data, context } = fakeNovel();
	const elena = data.entries.find((item) => item.id_entrada_codex === 'e1');
	elena.descripcion = 'Tall, red hair, a scar on her chin.';

	const first = await run(context, 'generate_portrait', { entry: 'Lena', style: 'oil painting' });
	assert.ok(first.ok, first.output);
	assert.equal(elena.thumbnail, 'data:image/png;base64,AAAA');
	assert.doesNotMatch(first.output, /replaced/);

	const prompt = context.portraitPrompts[0];
	assert.match(prompt, /Subject: Elena \(Characters\)/);
	assert.match(prompt, /red hair/);
	assert.match(prompt, /Mentor: Marco/);
	assert.match(prompt, /Style: oil painting/);
	assert.doesNotMatch(prompt, /spy/, 'a detail hidden from the AI stays out');
	assert.doesNotMatch(prompt, /SECRET NOTE/, 'private notes stay out');

	const again = await run(context, 'generate_portrait', { entry: 'Elena' });
	assert.match(again.output, /replaced the previous portrait/);

	const hidden = await run(context, 'generate_portrait', { entry: 'Shadow' });
	assert.equal(hidden.ok, false, 'an entry set to Never cannot be drawn');
});

test('generate_portrait is offered only with an images model in Settings', () => {
	const names = (availability) => availableTools(availability).map((tool) => tool.name);
	assert.ok(names(ALL_TOOLS_AVAILABLE).includes('generate_portrait'));
	const noImages = { ...ALL_TOOLS_AVAILABLE, canGenerateImages: false };
	assert.ok(!names(noImages).includes('generate_portrait'));
	assert.ok(names(noImages).includes('draft_chapter'));
});

test('set_chapter_info sets, keeps and clears chapter info', async () => {
	const { data, context } = fakeNovel();
	const set = await run(context, 'set_chapter_info', {
		chapter: 'Arrival',
		status: 'Drafted',
		pov: 'Lena',
		setting: 'Marco',
		day: '12',
		when: 'third moon',
	});
	assert.ok(set.ok, set.output);
	const chapter = () => data.chapters.find((item) => item.id_capitulo === 'c1');
	assert.equal(chapter().status, 'drafted');
	assert.equal(chapter().pov_entry_id, 'e1');
	assert.equal(chapter().location_entry_id, 'e3');
	assert.equal(chapter().story_day, 12);
	assert.equal(chapter().story_time, 'third moon');

	const list = await run(context, 'list_chapters');
	assert.match(
		list.output,
		/#1 Arrival .*\| status: Drafted \| point of view: Elena \| setting: Marco \| story time: day 12 \(third moon\)/,
	);

	const partial = await run(context, 'set_chapter_info', { chapter: '#1', setting: 'none' });
	assert.ok(partial.ok, partial.output);
	assert.equal(chapter().location_entry_id, null);
	assert.equal(chapter().pov_entry_id, 'e1', 'omitted fields stay');
});

test('set_chapter_info rejects hidden entries, bad values and empty calls', async () => {
	const { data, context } = fakeNovel();
	const hidden = await run(context, 'set_chapter_info', { chapter: 'Arrival', pov: 'Shadow' });
	assert.equal(hidden.ok, false);

	const status = await run(context, 'set_chapter_info', { chapter: 'Arrival', status: 'done' });
	assert.equal(status.ok, false);
	assert.match(status.output, /idea, outlined, drafted, revised, final/);

	const day = await run(context, 'set_chapter_info', { chapter: 'Arrival', day: 'soon' });
	assert.equal(day.ok, false);

	const nothing = await run(context, 'set_chapter_info', { chapter: 'Arrival' });
	assert.equal(nothing.ok, false);
	assert.equal(data.chapters[0].status, undefined);
});

test('list_chapters never names a point of view hidden from the AI', async () => {
	const { data, context } = fakeNovel();
	data.chapters[0] = { ...data.chapters[0], pov_entry_id: 'e2' };
	const list = await run(context, 'list_chapters');
	assert.ok(!list.output.includes('Shadow'));
	assert.ok(!list.output.includes('point of view'));
});

test('set_scene adds scenes and changes them; read_outline shows the plan', async () => {
	const { data, context } = fakeNovel();
	const scenes = () => data.chapters.find((item) => item.id_capitulo === 'c1').scenes;

	const first = await run(context, 'set_scene', {
		chapter: 'Arrival', title: 'Docks', summary: 'They land.', pov: 'Lena',
	});
	assert.ok(first.ok, first.output);
	const second = await run(context, 'set_scene', {
		chapter: 'Arrival', scene: 'new', title: 'Inn', goal: 'Find a bed', words: '800',
	});
	assert.ok(second.ok, second.output);
	const before = await run(context, 'set_scene', {
		chapter: 'Arrival', title: 'Storm at sea', position: '1',
	});
	assert.ok(before.ok, before.output);
	assert.deepEqual(scenes().map((item) => item.title), ['Storm at sea', 'Docks', 'Inn']);
	assert.equal(scenes()[1].pov_entry_id, 'e1');
	assert.equal(scenes()[2].target_words, 800);

	const changed = await run(context, 'set_scene', {
		chapter: 'Arrival', scene: '2', pov: 'none', outcome: 'Marco waits.', position: '3',
	});
	assert.ok(changed.ok, changed.output);
	assert.deepEqual(scenes().map((item) => item.title), ['Storm at sea', 'Inn', 'Docks']);
	assert.equal(scenes()[2].pov_entry_id, null);
	assert.equal(scenes()[2].summary, 'They land.', 'omitted fields stay');

	const outline = await run(context, 'read_outline', { chapter: 'Arrival' });
	assert.match(outline.output, /They arrive\.\n\nScenes:\n1\. Storm at sea\n2\. Inn\n   goal: Find a bed \| words: 800\n3\. Docks — They land\.\n   outcome: Marco waits\./);

	const list = await run(context, 'list_chapters');
	assert.match(list.output, /#1 Arrival .*\| scenes: 3/);
});

test('set_scene and delete_scene reject what they cannot resolve', async () => {
	const { data, context } = fakeNovel();
	const hidden = await run(context, 'set_scene', {
		chapter: 'Arrival', title: 'Night', pov: 'Shadow',
	});
	assert.equal(hidden.ok, false, 'an entry hidden from the AI is not accepted');
	const empty = await run(context, 'set_scene', { chapter: 'Arrival', goal: 'x' });
	assert.equal(empty.ok, false);
	assert.match(empty.output, /title or a summary/);
	const missing = await run(context, 'set_scene', { chapter: 'Arrival', scene: '4', title: 'x' });
	assert.equal(missing.ok, false);
	const words = await run(context, 'set_scene', { chapter: 'Arrival', title: 'x', words: 'many' });
	assert.equal(words.ok, false);
	assert.equal(data.chapters[0].scenes, undefined, 'nothing was written');
});

test('delete_scene removes a scene from the plan and leaves the manuscript', async () => {
	const { data, context } = fakeNovel();
	await run(context, 'set_scene', { chapter: 'Arrival', title: 'Docks' });
	await run(context, 'set_scene', { chapter: 'Arrival', title: 'Inn' });
	const text = data.texts.c1;
	const deleted = await run(context, 'delete_scene', { chapter: 'Arrival', scene: '1' });
	assert.ok(deleted.ok, deleted.output);
	assert.deepEqual(data.chapters[0].scenes.map((item) => item.title), ['Inn']);
	assert.equal(data.texts.c1, text);
	const unapproved = await run(context, 'delete_scene', { chapter: 'Arrival', scene: '1' }, false);
	assert.equal(unapproved.ok, false, 'a write tool needs approval');
	assert.equal(data.chapters[0].scenes.length, 1);
});

test('draft_chapter accepts a chapter with scenes and no outline', async () => {
	const { data, context } = fakeNovel();
	await run(context, 'set_scene', { chapter: 'Aftermath', title: 'Ruins', summary: 'They count the dead.' });
	const drafted = await run(context, 'draft_chapter', { chapter: 'Aftermath' });
	assert.ok(drafted.ok, drafted.output);
	assert.ok(data.texts.c3.length > 0);
});

test('check_continuity reports issues with the chapter each fact came from', async () => {
	const { context } = fakeNovel();
	context.continuityIssues = [{
		id: 'i1', title: 'Eye color', quote: 'her brown eyes', explanation: 'Green before.',
		fact: 'Elena has green eyes', fact_chapter_id: 'c1',
	}];
	const result = await run(context, 'check_continuity', { chapter: 'The Storm' });
	assert.ok(result.ok, result.output);
	assert.match(result.output, /Checked "The Storm" against 4 facts/);
	assert.match(result.output, /1\. Eye color\n   Quote: "her brown eyes"\n   Contradicts: Elena has green eyes \(#1 Arrival\)\n   Why: Green before\./);
	assert.match(result.output, /Check continuity\.\.\./);
});

test('check_continuity: no issues, a chapter without text, and approval', async () => {
	const { context } = fakeNovel();
	const clean = await run(context, 'check_continuity', { chapter: 'Arrival' });
	assert.match(clean.output, /No contradictions found\./);
	const empty = await run(context, 'check_continuity', { chapter: 'Aftermath' });
	assert.equal(empty.ok, false);
	assert.match(empty.output, /no text to check/);
	const unapproved = await run(context, 'check_continuity', { chapter: 'Arrival' }, false);
	assert.equal(unapproved.ok, false, 'it spends the utilities model: needs approval');
});

test('set_chapter_info takes a range of days; set_scene a day per scene', async () => {
	const { data, context } = fakeNovel();
	const ranged = await run(context, 'set_chapter_info', { chapter: 'Arrival', day: '3', to_day: '5' });
	assert.ok(ranged.ok, ranged.output);
	assert.equal(data.chapters[0].story_day_end, 5);
	assert.match(ranged.output, /story time: days 3–5/);

	const backwards = await run(context, 'set_chapter_info', { chapter: 'Arrival', to_day: '1' });
	assert.equal(backwards.ok, false);
	assert.match(backwards.output, /can't be before/);
	assert.equal(data.chapters[0].story_day_end, 5, 'nothing was written');

	const scene = await run(context, 'set_scene', { chapter: 'Arrival', title: 'Inn', day: '7' });
	assert.ok(scene.ok, scene.output);
	assert.match(scene.output, /day: 7/);
	const list = await run(context, 'list_chapters');
	assert.match(list.output, /#1 Arrival .*story time: days 3–7/, 'the scene widens the range');
});
