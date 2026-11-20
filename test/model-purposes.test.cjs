const assert = require('node:assert/strict');
const { test, beforeEach } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the actual TS modules without bundling Obsidian or contacting APIs.
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

let requests = [];
let responses = [];
// Arguments of each buildScenePrompt call: [app, folder, settings, outline,
// text, length, meta].
let scenePrompts = [];
let novelState;
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name.endsWith('/api-factory')) {
		return { ApiFactory: class {
			createApi(provider, token) {
				return { generateCompletion: async (prompt, model, options) => {
					requests.push({ provider, token, prompt, model, options });
					const response = responses.shift() ?? 'Generated text.';
					if (response instanceof Error) {
						throw response;
					}
					return { text: response };
				} };
			}
		} };
	}
	if (name === 'react') {
		return {
			useState: (value) => [value, () => {}],
			useCallback: (callback) => callback,
			useMemo: (factory) => factory(),
		};
	}
	if (name.endsWith('/context/promptMeta')) {
		// OutlineGenerator reads the drafted chapter's own memory from its note.
		return {
			readFrontmatterValue: async () => null,
			readInheritedPromptMeta: async () => '',
		};
	}
	if (name.endsWith('/novelWriterStore')) {
		// The hook reads the store through React; OutlineGenerator through getState().
		const useNovelWriter = () => novelState;
		useNovelWriter.getState = () => novelState;
		return { useNovelWriter };
	}
	if (name.endsWith('/context/promptBuilder')
		|| (name === './promptBuilder' && parent.filename.includes('context'))) {
		return {
			buildScenePrompt: async (...args) => {
				scenePrompts.push(args);
				return 'Write the chapter.';
			},
			estimateTokens: (text) => Math.ceil(text.length / 4),
		};
	}
	if (name.endsWith('/repos/EstructuraRepo')) {
		return { resolveChapterFile: async () => null };
	}
	if (name.endsWith('/modals/ConfirmModal')) {
		return { confirmDialog: async () => true };
	}
	return originalLoad.call(this, name, parent, isMain);
};

const { DEFAULT_SETTINGS } = require('../src/infrastructure/settings/plugin-settings.ts');
const { SettingsService } = require('../src/infrastructure/settings/settings-service.ts');
const { ModelRepository } = require('../src/infrastructure/settings/model-repository.ts');
const { getActiveModelConfig } = require('../src/infrastructure/settings/active-model.ts');
const { chapterOutputBudget } = require('../src/utils/chapterOutputBudget.ts');
const {
	generateChapterDraftText, requestDraftCompletion,
} = require('../src/ui/react/outline/outlineGenerators.ts');
const { useOutlineActions } = require('../src/ui/react/outline/useOutlineActions.ts');
const { OutlineGenerator } = require('../src/ui/react/outline/outlineGenerator.ts');
const { createChatCompletion } = require(
	'../src/ui/react/features/chat/session/chatCompletion.ts'
);
const { generateChatName } = require('../src/utils/chatNameGeneration.ts');
const {
	runModelCompletion, createUtilityCompletion,
} = require('../src/context/aiCompletion.ts');

const clone = (value) => JSON.parse(JSON.stringify(value));
const words = (count) => Array(count).fill('story').join(' ');
function profile(id, provider, extra = {}) {
	return {
		id_modelo: id, nombre_modelo: id, nombre_listado: id,
		id_proveedor: provider, max_context: 32768,
		max_output: 250, max_output_chat: 8000, temperature: 0.7,
		top_p: 0.8, stream: true, effort: 'high', thinking: true,
		...extra,
	};
}
function configuration() {
	return {
		...clone(DEFAULT_SETTINGS),
		modelos: [
			profile('chat', 1, { supports_image_generation: true }),
			profile('writing', 4),
			profile('utilities', 2, { max_output: 6000 }),
		],
		modeloPredeterminadoId: 'writing',
		modelAssignments: {
			chat: 'chat', writing: 'writing', utilities: 'utilities',
		},
		apiToken: { openrouter: 'chat-key', ollama: '', deepseek: 'utility-key' },
	};
}
async function serviceFor(raw) {
	let saved = raw;
	const service = new SettingsService({
		loadData: async () => saved,
		saveData: async (value) => { saved = clone(value); },
	});
	await service.load();
	return service;
}
beforeEach(() => {
	requests = [];
	scenePrompts = [];
	responses = [];
});

test('existing settings inherit the same model without sharing mutable defaults',
	async () => {
		const raw = configuration();
		delete raw.modelAssignments;
		const settings = await serviceFor(raw);
		for (const purpose of ['chat', 'writing', 'utilities']) {
			assert.equal(getActiveModelConfig(settings.data, purpose).modelName,
				'writing');
		}
		await new ModelRepository(settings).setForPurpose('chat', 'chat');
		assert.equal(DEFAULT_SETTINGS.modelAssignments.chat, '');
		assert.equal(getActiveModelConfig(settings.data, 'writing').modelName,
			'writing');
		await settings.load();
		assert.equal(settings.data.modelAssignments.chat, 'chat');
	});

test('legacy provider migration preserves all sampling and chat options',
	async () => {
		const raw = clone(DEFAULT_SETTINGS);
		delete raw.modelAssignments;
		raw.proveedor = { id: 'ollama', modelo: 'legacy' };
		raw.aiOptions.effort = 'high';
		const settings = await serviceFor(raw);
		const active = getActiveModelConfig(settings.data, 'chat');
		assert.equal(active.modelName, 'legacy');
		assert.equal(active.options.max_tokens, raw.aiOptions.maxOutputChat);
		assert.equal(active.options.min_p, raw.aiOptions.minP);
		assert.equal(active.options.effort, 'high');
	});

test('explicit profiles resolve provider, output budget and capabilities', () => {
	const settings = configuration();
	const chat = getActiveModelConfig(settings, 'chat');
	assert.equal(chat.providerId, 'openrouter');
	assert.equal(chat.options.max_tokens, 8000);
	assert.equal(chat.profile.supports_image_generation, true);
	assert.equal(getActiveModelConfig(settings, 'writing').options.max_tokens, 250);
	assert.equal(getActiveModelConfig(settings, 'utilities').providerId, 'deepseek');
	settings.modelAssignments.chat = 'deleted';
	assert.throws(() => getActiveModelConfig(settings, 'chat'), /no longer exists/);
});

test('deletion clears assignments, notifies subscribers and cannot revive legacy',
	async () => {
		const raw = configuration();
		raw.proveedor = { id: 'ollama', modelo: 'old-legacy' };
		const settings = await serviceFor(raw);
		const models = new ModelRepository(settings);
		let revisions = 0;
		const unsubscribe = settings.subscribe(() => revisions++);
		await models.remove('chat');
		assert.equal(settings.data.modelAssignments.chat, '');
		assert.equal(getActiveModelConfig(settings.data, 'chat').modelName, 'writing');
		assert.equal(settings.data.modelAssignments.utilities, 'utilities');
		assert.equal(revisions, 1);
		unsubscribe();
		await models.remove('writing');
		assert.equal(getActiveModelConfig(settings.data, 'writing').modelName,
			'utilities');
		await models.remove('utilities');
		await settings.load();
		assert.equal(settings.data.modelos.length, 0);
		assert.equal(getActiveModelConfig(settings.data, 'chat').modelName, '');
		assert.equal(revisions, 1);
	});

test('utilities and chat titles use the utilities provider and credentials',
	async () => {
		const plugin = { settings: { data: configuration() } };
		assert.equal(createUtilityCompletion(plugin).outputBudget, 6000);
		await runModelCompletion(plugin, 'Summarize the act.', 800);
		await generateChatName('A new conversation', 'active_model', plugin);
		assert.deepEqual(requests.map((r) => r.model), ['utilities', 'utilities']);
		assert.deepEqual(requests.map((r) => r.options.max_tokens), [800, 30]);
		assert.ok(requests.every((r) => r.token === 'utility-key'));
	});

test('chat uses its own capabilities rather than the default writing profile',
	async () => {
		const complete = createChatCompletion({ settings: { data: configuration() } });
		await complete('Hello', []);
		assert.equal(requests[0].model, 'chat');
		assert.equal(requests[0].token, 'chat-key');
		assert.deepEqual(requests[0].options.modalities, ['image', 'text']);
	});

test('chapter budget scales beyond the old cap and validates word targets', () => {
	assert.equal(chapterOutputBudget(2000), 3750);
	assert.equal(chapterOutputBudget(5000), 9375);
	for (const invalid of [0, -1, NaN, Infinity]) {
		assert.throws(() => chapterOutputBudget(invalid), /positive number/);
	}
});

test('a utility batch keeps its profile when settings change between requests',
	async () => {
		const plugin = { settings: { data: configuration() } };
		const completion = createUtilityCompletion(plugin);
		assert.equal(completion.outputBudget, 6000);
		plugin.settings.data.modelAssignments.utilities = 'chat';
		plugin.settings.data.apiToken.deepseek = 'changed-key';
		await completion.complete('Next outline batch.', 1000);
		assert.equal(requests[0].model, 'utilities');
		assert.equal(requests[0].token, 'utility-key');
		await runModelCompletion(plugin, 'New operation.', 1000);
		assert.equal(requests[1].model, 'chat');
	});

test('chapter continuations recalculate output while preserving profile options',
	async () => {
		const active = getActiveModelConfig(configuration(), 'writing');
		const calls = [];
		const api = { generateCompletion: async (_, __, options) => {
			calls.push(options);
			return { text: words(1000) };
		} };
		const draft = await generateChapterDraftText(
			{
				app: {}, activeFolderPath: '', api, model: active.modelName,
				options: active.options, settings: configuration(),
			},
			'An outline', { min: 1900, max: 2200, target: 2000 }, () => 'Finish the chapter.'
		);
		assert.equal(draft.split(/\s+/).length, 2000);
		assert.deepEqual(calls.map((c) => c.max_tokens), [3750, 1875]);
		assert.ok(calls.every((c) => c.thinking && c.effort === 'high'));
		assert.ok(calls.every((c) => c.stream === false));
		assert.equal(active.options.max_tokens, 250);
	});

test('a draft cut mid-sentence is trimmed and closed with a short request',
	async () => {
		const active = getActiveModelConfig(configuration(), 'writing');
		const prompts = [];
		const budgets = [];
		const answers = [`${words(1990)}. She opened the door and`, 'Seth waited outside. The end.'];
		const api = { generateCompletion: async (prompt, _, options) => {
			prompts.push(prompt);
			budgets.push(options.max_tokens);
			return { text: answers.shift() ?? '' };
		} };
		const draft = await generateChapterDraftText(
			{
				app: {}, activeFolderPath: '', api, model: active.modelName,
				options: active.options, settings: configuration(),
			},
			'An outline', { min: 1900, max: 2200, target: 2000 }, () => 'Write the chapter.'
		);
		assert.ok(!draft.includes('opened the door and'), 'the half sentence is cut');
		assert.ok(draft.endsWith('Seth waited outside. The end.'));
		assert.equal(prompts.length, 2);
		assert.match(prompts[1], /cut off before its ending/);
		assert.equal(budgets[1], 375, 'the closing gets a small budget');
	});

test('provider budget retries retain the selected profile parameters', async () => {
	const calls = [];
	const api = { generateCompletion: async (_, __, options) => {
		calls.push(options);
		if (options.max_tokens > 2048) {
			throw new Error('max_tokens exceeds provider limit');
		}
		return { text: 'Accepted.' };
	} };
	const options = getActiveModelConfig(configuration(), 'writing').options;
	await requestDraftCompletion(api, 'Draft', 'writing', 4500, options);
	assert.deepEqual(calls.map((c) => c.max_tokens), [4500, 2048]);
	assert.equal(calls[1].effort, 'high');
	assert.equal(calls[1].top_p, 0.8);
});

test('a draft workflow summarizes with utilities then writes with writing',
	async () => {
		const settings = configuration();
		settings.historyOptions.olderChapters = 'ai-summary';
		settings.historyOptions.recentChapters = 0;
		const act = { id_acto: 'a', nombre: 'Act', orden: 1, resumen: '' };
		const chapter = {
			id_capitulo: 'c', id_acto: 'a', nombre: 'Chapter', orden: 1,
			archivo: 'chapter.md', outline: 'The protagonist leaves home.',
		};
		let manuscript = '';
		novelState = {
			actos: [act], capitulos: [chapter],
			store: { activeFolderPath: 'novel', readBlueprint: async () => null },
			ensureCapituloArchivo: async () => 'chapter.md',
			readCapituloTexto: async () => manuscript,
			writeCapituloTexto: async (_, text) => { manuscript = text; },
			updateActo: async (_, patch) => Object.assign(act, patch),
			updateCapitulo: async () => {},
		};
		responses = ['The protagonist leaves home.', words(2000)];
		// No blueprint: the default range 2000-4000, aiming at 3000.
		const actions = useOutlineActions({ settings: { data: settings }, app: {} });
		await actions.generateSingleDraft(chapter);
		assert.deepEqual(requests.map((r) => r.model), ['utilities', 'writing']);
		assert.deepEqual(requests.map((r) => r.options.max_tokens), [800, 5625]);
		assert.equal(manuscript.split(/\s+/).length, 2000);
	});

/** A novel in memory whose chapter has three scenes. */
function sceneNovel(initialText = '') {
	const chapter = {
		id_capitulo: 'c', id_acto: 'a', nombre: 'Chapter', orden: 1,
		archivo: 'chapter.md', outline: 'Kael steals the map.',
		scenes: [
			{ id: 's1', title: 'Market', summary: 'Kael arrives.' },
			{ id: 's2', title: 'The deal', summary: 'It goes wrong.' },
			{ id: 's3', title: 'Sewers', summary: 'He escapes.' },
		],
	};
	const novel = { chapter, manuscript: initialText };
	novelState = {
		actos: [{ id_acto: 'a', nombre: 'Act', orden: 1, resumen: '' }],
		capitulos: [chapter],
		entradas: [],
		store: { activeFolderPath: 'novel', readBlueprint: async () => null },
		ensureCapituloArchivo: async () => 'chapter.md',
		readCapituloTexto: async () => novel.manuscript,
		writeCapituloTexto: async (_, text) => { novel.manuscript = text; },
		updateCapitulo: async () => {},
	};
	return novel;
}

test('a chapter with scenes is drafted one scene at a time', async () => {
	const novel = sceneNovel();
	// Default range 2000-4000 aiming at 3000: 1000 words for each scene.
	responses = [words(1000), words(1000), words(1000)];
	const generator = new OutlineGenerator({
		settings: { data: configuration() },
		app: { vault: { process: async () => {} } },
	});
	const progress = [];
	const text = await generator.draftText(
		novel.chapter,
		await generator.draftLength(),
		() => 'unused for scenes',
		() => {},
		(index, count) => progress.push(`${index + 1}/${count}`),
	);
	assert.deepEqual(progress, ['1/3', '2/3', '3/3']);
	assert.equal(requests.length, 3, 'one request per scene');
	assert.equal(text.split('* * *').length, 3, 'scenes joined by breaks');
	assert.match(requests[0].prompt, /This scene has 0 words so far; it must end between 667 and 1333/);
	assert.ok(!/the chapter must end between/.test(requests[0].prompt));
	// The second scene reads the first one, ending in the break, and gets
	// only its own block; no chapter length rule.
	const second = scenePrompts[1];
	assert.ok(second[4].endsWith('* * *'));
	assert.equal(second[5], undefined);
	assert.match(second[6].scene, /Now write scene 2 of 3, "The deal"/);
	assert.match(second[6].scene, /What happens: It goes wrong\./);
});

test('drafting one scene adds it after the scenes already written', async () => {
	const novel = sceneNovel('Kael arrives at the market.');
	responses = [`### The deal\n\n${words(1000)}\n\n***`];
	const generator = new OutlineGenerator({
		settings: { data: configuration() },
		app: { vault: { process: async () => {} } },
	});
	assert.equal(await generator.isSceneWritten(novel.chapter, 's1'), true);
	assert.equal(await generator.isSceneWritten(novel.chapter, 's2'), false);
	const count = await generator.draftScene(novel.chapter, 's2', () => {});
	assert.equal(count, 1000);
	assert.equal(
		novel.manuscript,
		`Kael arrives at the market.\n\n* * *\n\n${words(1000)}`,
		'heading and trailing break of the answer are dropped',
	);
	assert.equal(scenePrompts[0][4], 'Kael arrives at the market.\n\n* * *');
});

test('a scene can be redone, keeping the author\'s breaks around it', async () => {
	const novel = sceneNovel('Old first scene.\n\n#\n\nSecond scene.');
	responses = [words(1000)];
	const generator = new OutlineGenerator({
		settings: { data: configuration() },
		app: { vault: { process: async () => {} } },
	});
	await generator.draftScene(novel.chapter, 's1', () => {});
	assert.equal(novel.manuscript, `${words(1000)}\n\n#\n\nSecond scene.`);
	assert.equal(scenePrompts[0][4], '', 'nothing comes before the first scene');
});

test('a scene further ahead than the next one fails before any request', async () => {
	const novel = sceneNovel('Only the first scene.');
	const generator = new OutlineGenerator({
		settings: { data: configuration() },
		app: { vault: { process: async () => {} } },
	});
	await assert.rejects(
		generator.draftScene(novel.chapter, 's3', () => {}),
		/Write scene 2 first/,
	);
	assert.equal(requests.length, 0);
});
