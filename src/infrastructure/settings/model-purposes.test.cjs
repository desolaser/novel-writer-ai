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
		};
	}
	if (name.endsWith('/novelWriterStore')) {
		return { useNovelWriter: () => novelState };
	}
	if (name.endsWith('/context/promptBuilder')
		|| (name === './promptBuilder' && parent.filename.includes('context'))) {
		return {
			buildScenePrompt: async () => 'Write the chapter.',
			estimateTokens: (text) => Math.ceil(text.length / 4),
		};
	}
	if (name.endsWith('/repos/EstructuraRepo')) {
		return { resolveChapterFile: async () => null };
	}
	return originalLoad.call(this, name, parent, isMain);
};

const { DEFAULT_SETTINGS } = require('./plugin-settings.ts');
const { SettingsService } = require('./settings-service.ts');
const { ModelRepository } = require('./model-repository.ts');
const { getActiveModelConfig } = require('./active-model.ts');
const { chapterOutputBudget } = require('../../utils/chapterOutputBudget.ts');
const {
	generateChapterDraftText, requestDraftCompletion,
} = require('../../ui/react/outline/outlineGenerators.ts');
const { useOutlineActions } = require('../../ui/react/outline/useOutlineActions.ts');
const { useChatAiTurn } = require(
	'../../ui/react/features/chat/hooks/useChatAiTurn.ts'
);
const { generateChatName } = require('../../utils/chatNameGeneration.ts');
const {
	runModelCompletion, createUtilityCompletion,
} = require('../../context/aiCompletion.ts');

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
		const turn = useChatAiTurn({
			plugin: { settings: { data: configuration() } },
			contextItems: [], characterContext: null, impersonateContext: null,
			activeNoteItem: null, runner: {}, toolsEnabled: false,
			activeStoryBible: '',
		});
		await turn.runAiTurn({ history: [], userText: 'Hello', images: [] });
		assert.equal(requests[0].model, 'chat');
		assert.equal(requests[0].token, 'chat-key');
		assert.deepEqual(requests[0].options.modalities, ['image', 'text']);
	});

test('chapter budget scales beyond the old cap and validates word targets', () => {
	assert.equal(chapterOutputBudget(2000), 4500);
	assert.equal(chapterOutputBudget(5000), 11250);
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
			{}, '', api, active.modelName, active.options, configuration(),
			'An outline', 2000, () => 'Finish the chapter.'
		);
		assert.equal(draft.split(/\s+/).length, 2000);
		assert.deepEqual(calls.map((c) => c.max_tokens), [4500, 2250]);
		assert.ok(calls.every((c) => c.thinking && c.effort === 'high'));
		assert.ok(calls.every((c) => c.stream === false));
		assert.equal(active.options.max_tokens, 250);
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
		const actions = useOutlineActions({ settings: { data: settings }, app: {} },
			2000);
		await actions.generateSingleDraft(chapter);
		assert.deepEqual(requests.map((r) => r.model), ['utilities', 'writing']);
		assert.deepEqual(requests.map((r) => r.options.max_tokens), [800, 4500]);
		assert.equal(manuscript.split(/\s+/).length, 2000);
	});
