const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// The chat agent: the loop that keeps calling tools until the model is done,
// and the session that runs it outside of any view. Real tools and parser,
// fake model and fake storage.
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

const { runAgentLoop, createLoopState } = require(
	'../src/ui/react/features/chat/session/agentLoop.ts'
);
const { compactToolResults } = require(
	'../src/ui/react/features/chat/session/toolHistory.ts'
);
const { ChatSession } = require(
	'../src/ui/react/features/chat/session/ChatSession.ts'
);
const { parseToolAnswer } = require('../src/tools/parseToolAnswer.ts');
const { findToolDefinition, TOOL_DEFINITIONS } = require('../src/tools/registry.ts');
const { planRevert } = require('../src/utils/fileChanges.ts');

const call = (name, args = '') => `[[tool: ${name}]]\n${args}[[/tool]]`;

/** Loop dependencies with a scripted model and tools that always succeed. */
function loopDeps(answers, overrides = {}) {
	const executed = [];
	return {
		executed,
		deps: {
			buildPrompt: (turns, pending) => `${turns.length}|${pending}`,
			complete: async () => ({ text: answers.shift() ?? 'Done.', images: [] }),
			parse: (answer, round) => parseToolAnswer(answer, `r${round}`),
			runCalls: async (calls, skipped) => calls.map((item) => {
				if (skipped[item.id]) {
					return { callId: item.id, name: item.name, ok: false, output: skipped[item.id] };
				}
				executed.push(item.name);
				return { callId: item.id, name: item.name, ok: true, output: 'ok' };
			}),
			isWriteTool: (name) => findToolDefinition(name)?.kind === 'write',
			shouldStop: () => false,
			onProgress: () => {},
			...overrides,
		},
	};
}

test('the loop keeps calling tools across rounds until the model answers', async () => {
	const answers = [
		`Plan first.\n${call('list_chapters')}`,
		call('read_chapter', '[[chapter]] #1\n'),
		call('read_chapter', '[[chapter]] #2\n'),
		'All done.',
	];
	const { deps, executed } = loopDeps(answers);
	const state = createLoopState([], 'Review my chapters');
	const outcome = await runAgentLoop(state, deps, 25);
	assert.deepEqual(outcome, { kind: 'done' });
	assert.deepEqual(executed, ['list_chapters', 'read_chapter', 'read_chapter']);
	assert.deepEqual(state.visible, ['Plan first.', 'All done.']);
});

test('the loop pauses at the round limit and resumes where it was', async () => {
	const answers = Array.from({ length: 5 }, (_, index) =>
		call('read_chapter', `[[chapter]] #${index + 1}\n`));
	const { deps, executed } = loopDeps(answers);
	const state = createLoopState([], 'Read everything');
	assert.deepEqual(await runAgentLoop(state, deps, 3), { kind: 'paused', reason: 'limit' });
	assert.equal(executed.length, 3);
	assert.deepEqual(await runAgentLoop(state, deps, 3), { kind: 'done' });
	assert.equal(executed.length, 5);
});

test('identical calls are refused after two runs and a repeating model is paused', async () => {
	const same = call('read_chapter', '[[chapter]] #1\n');
	const { deps, executed } = loopDeps([same, same, same, same, same]);
	const state = createLoopState([], 'Read chapter one');
	const outcome = await runAgentLoop(state, deps, 25);
	assert.deepEqual(outcome, { kind: 'paused', reason: 'repeating' });
	assert.equal(executed.length, 2);
});

test('a successful write lets the model read the same thing again', async () => {
	const read = call('read_chapter', '[[chapter]] #1\n');
	const write = call('write_chapter', '[[chapter]] #1\n[[content]]\nNew text\n');
	const { deps, executed } = loopDeps([read, read, write, read, 'Done.']);
	const outcome = await runAgentLoop(createLoopState([], 'Rewrite'), deps, 25);
	assert.deepEqual(outcome, { kind: 'done' });
	assert.deepEqual(executed, ['read_chapter', 'read_chapter', 'write_chapter', 'read_chapter']);
});

test('the loop stops when the author asks, without running further calls', async () => {
	let stop = false;
	const { deps, executed } = loopDeps(
		[call('list_chapters'), call('list_codex')],
		{ onProgress: () => { stop = true; }, shouldStop: () => stop },
	);
	const outcome = await runAgentLoop(createLoopState([], 'Go'), deps, 25);
	assert.deepEqual(outcome, { kind: 'stopped' });
	assert.deepEqual(executed, []);
});

test('only the latest tool results stay whole in the history', () => {
	const long = 'x'.repeat(2000);
	const turns = compactToolResults([
		{ role: 'user', mensaje: 'question' },
		{ role: 'user', mensaje: long, toolResults: true },
		{ role: 'user', mensaje: long, toolResults: true },
		{ role: 'user', mensaje: long, toolResults: true },
	]);
	assert.equal(turns[0].mensaje, 'question');
	assert.ok(turns[1].mensaje.length < 1000);
	assert.equal(turns[2].mensaje, long);
	assert.equal(turns[3].mensaje, long);
});

// ---- ChatSession -----------------------------------------------------------

function fakePersistence() {
	const chats = new Map([['chat', []]]);
	let id = 0;
	return {
		chats,
		readChat: async (chatId) => ({ mensajes: [...(chats.get(chatId) ?? [])] }),
		appendMessage: async (chatId, role, text, extras = {}) => {
			const message = { id_mensaje: `m${++id}`, role, mensaje: text, ...extras };
			chats.get(chatId).push(message);
			return message;
		},
		patchMessage: async (chatId, messageId, patch) => {
			const list = chats.get(chatId);
			const index = list.findIndex((item) => item.id_mensaje === messageId);
			list[index] = { ...list[index], ...patch };
		},
		deleteMessage: async (chatId, messageId) => {
			chats.set(chatId, chats.get(chatId).filter((item) => item.id_mensaje !== messageId));
		},
	};
}

function fakeNovel() {
	const texts = { c1: 'The cat sat on the mat.' };
	return {
		texts,
		context: {
			listChapters: () => [{ id_capitulo: 'c1', id_acto: 'a1', nombre: 'Opening', orden: 0 }],
			listActs: () => [{ id_acto: 'a1', nombre: 'Act 1', orden: 0 }],
			readChapterText: async (chapterId) => texts[chapterId] ?? '',
			writeChapterText: async (chapterId, content) => {
				texts[chapterId] = content;
				return `${chapterId}.md`;
			},
			listCodexEntries: () => [],
			listCategories: () => [],
			listDetalles: () => [],
			deleteChapter: async (chapterId) => {
				delete texts[chapterId];
			},
		},
	};
}

/** The fake novel's texts as files, with the real revert plan. */
function fakeFiles(novel) {
	const pathOf = (id) => `novel/${id}.md`;
	return {
		snapshot: async () => Object.fromEntries(
			Object.entries(novel.texts).map(([id, text]) => [pathOf(id), text])),
		revert: async (changes) => {
			const current = {};
			for (const change of changes) {
				const id = change.path.slice('novel/'.length, -'.md'.length);
				current[change.path] = novel.texts[id] ?? null;
			}
			const plan = planRevert(changes, current);
			for (const change of plan.apply) {
				const id = change.path.slice('novel/'.length, -'.md'.length);
				if (change.before === null) delete novel.texts[id];
				else novel.texts[id] = change.before;
			}
			return { reverted: plan.apply.length, conflicts: plan.conflicts };
		},
	};
}

function session(answers, { autoApprove = false } = {}) {
	const persistence = fakePersistence();
	const novel = fakeNovel();
	const chat = new ChatSession('chat', {
		files: fakeFiles(novel),
		persistence,
		createToolContext: () => novel.context,
		novelId: 'n1',
		activeNovelId: () => 'n1',
		autoApproveWrites: () => autoApprove,
		roundsBeforePause: () => 25,
	});
	const config = {
		toolsEnabled: true,
		buildPrompt: (turns, pending) => `${turns.map((t) => t.mensaje).join('\n')}\n${pending}`,
		complete: async () => ({ text: answers.shift() ?? 'Done.', images: [] }),
	};
	return { chat, config, persistence, novel };
}

const until = async (predicate) => {
	for (let attempt = 0; attempt < 200; attempt++) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 1));
	}
	throw new Error('condition never became true');
};

test('a write waits for approval, then the answer is saved with its tool trace', async () => {
	const edit = call('edit_chapter', '[[chapter]] Opening\n[[find]]\ncat\n[[replace]]\ndog\n');
	const { chat, config, persistence, novel } = session([`Fixing it.\n${edit}`, 'Changed cat to dog.']);
	const turn = chat.send('Use a dog', [], config);

	await until(() => chat.getSnapshot().awaiting);
	assert.equal(novel.texts.c1, 'The cat sat on the mat.');
	const pending = chat.getSnapshot().calls[0];
	chat.approve(pending.call.id);
	await turn;

	assert.equal(novel.texts.c1, 'The dog sat on the mat.');
	const messages = persistence.chats.get('chat');
	assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant']);
	assert.equal(messages[1].mensaje, 'Fixing it.\n\nChanged cat to dog.');
	assert.equal(messages[1].toolCalls[0].name, 'edit_chapter');
	assert.equal(messages[1].toolCalls[0].status, 'done');
	assert.equal(chat.getSnapshot().status, 'idle');
});

test('auto-approve runs writes without asking', async () => {
	const edit = call('edit_chapter', '[[chapter]] Opening\n[[find]]\nmat\n[[replace]]\nrug\n');
	const { chat, config, novel } = session([edit, 'Done.'], { autoApprove: true });
	await chat.send('Change the mat', [], config);
	assert.equal(novel.texts.c1, 'The cat sat on the rug.');
});

test('stopping rejects the pending write and ends the turn', async () => {
	const edit = call('edit_chapter', '[[chapter]] Opening\n[[find]]\ncat\n[[replace]]\nowl\n');
	const { chat, config, persistence, novel } = session([edit, 'Should not be asked.']);
	const turn = chat.send('Use an owl', [], config);
	await until(() => chat.getSnapshot().awaiting);
	chat.stop();
	await turn;

	assert.equal(novel.texts.c1, 'The cat sat on the mat.');
	const answer = persistence.chats.get('chat')[1];
	assert.equal(answer.toolCalls[0].status, 'rejected');
	assert.equal(chat.getSnapshot().notice, 'Stopped by you.');
});

test('plan steps marked [x] stay inside the steps value', () => {
	const answer = call('update_plan', '[[steps]]\n[x] Read chapter 1\n[>] Rewrite it\n[ ] Update the act\n');
	const [parsed] = parseToolAnswer(answer, 'p').calls;
	assert.deepEqual(Object.keys(parsed.args), ['steps']);
	assert.equal(parsed.args.steps, '[x] Read chapter 1\n[>] Rewrite it\n[ ] Update the act');
});

test('a plan written without the [[steps]] header still has its steps', () => {
	const answer = call('update_plan', '[x] Read chapter 1\n[ ] Rewrite it\n');
	const [parsed] = parseToolAnswer(answer, 'p').calls;
	assert.equal(parsed.args.steps, '[x] Read chapter 1\n[ ] Rewrite it');
});

test('a known argument still opens after a multi-line value', () => {
	const answer = call('edit_chapter', '[[chapter]] Opening\n[[find]]\n[x] cat\n[[replace]]\ndog\n');
	const [parsed] = parseToolAnswer(answer, 'p').calls;
	assert.equal(parsed.args.find, '[x] cat');
	assert.equal(parsed.args.replace, 'dog');
});

test('stopping ends the turn while the model has not answered yet', async () => {
	const { chat, config, persistence } = session([]);
	let asked = false;
	config.complete = () => {
		asked = true;
		return new Promise(() => {});
	};
	const turn = chat.send('Hello', [], config);
	await until(() => asked);
	chat.stop();
	await turn;

	assert.equal(chat.getSnapshot().status, 'idle');
	assert.equal(chat.getSnapshot().notice, 'Stopped by you.');
	assert.deepEqual(persistence.chats.get('chat').map((m) => m.role), ['user', 'assistant']);
});

test('stopping ends the turn while a tool is still running', async () => {
	const read = call('read_chapter', '[[chapter]] Opening\n');
	const { chat, config, novel } = session([read, 'Should not be asked.']);
	let started = false;
	novel.context.readChapterText = () => {
		started = true;
		return new Promise(() => {});
	};
	const turn = chat.send('Read it', [], config);
	await until(() => started);
	chat.stop();
	await turn;

	assert.equal(chat.getSnapshot().status, 'idle');
	assert.equal(chat.getSnapshot().notice, 'Stopped by you.');
});

test('the saved answer remembers where each call was made', async () => {
	const read = call('read_chapter', '[[chapter]] Opening\n');
	const { chat, config, persistence } = session([`Let me read it.\n${read}`, 'It is about a cat.']);
	await chat.send('What happens?', [], config);

	const answer = persistence.chats.get('chat')[1];
	assert.equal(answer.mensaje, 'Let me read it.\n\nIt is about a cat.');
	assert.equal(answer.toolCalls[0].textOffset, 'Let me read it.'.length);
});

test('a tool turned off in Settings is refused even if the model calls it', async () => {
	const edit = call('edit_chapter', '[[chapter]] Opening\n[[find]]\ncat\n[[replace]]\nfox\n');
	const { chat, config, novel, persistence } = session([edit, 'Done.'], { autoApprove: true });
	config.tools = TOOL_DEFINITIONS.filter((tool) => tool.name !== 'edit_chapter');
	await chat.send('Use a fox', [], config);

	assert.equal(novel.texts.c1, 'The cat sat on the mat.');
	const [record] = persistence.chats.get('chat')[1].toolCalls;
	assert.equal(record.status, 'error');
	assert.match(record.output, /turned off in Settings/);
});

test('a destructive tool asks even with auto-approve on', async () => {
	const remove = call('delete_chapter', '[[chapter]] Opening\n');
	const { chat, config, novel } = session([remove, 'Deleted.'], { autoApprove: true });
	const turn = chat.send('Delete the opening', [], config);
	await until(() => chat.getSnapshot().awaiting);
	assert.ok(novel.texts.c1, 'nothing deleted before the author approves');
	chat.approveAll(chat.getSnapshot().calls[0].call.id);
	await turn;
	assert.equal(novel.texts.c1, undefined);
});

test('an answer can be undone, keeping files changed again since', async () => {
	const edit = call('edit_chapter', '[[chapter]] Opening\n[[find]]\ncat\n[[replace]]\nowl\n');
	const { chat, config, persistence, novel } = session([edit, 'Done.'], { autoApprove: true });
	await chat.send('Use an owl', [], config);
	const answerId = persistence.chats.get('chat')[1].id_mensaje;
	assert.equal(novel.texts.c1, 'The owl sat on the mat.');
	assert.deepEqual(chat.getSnapshot().undoable, [answerId]);

	const result = await chat.undo(answerId);
	assert.deepEqual(result, { reverted: 1, conflicts: [] });
	assert.equal(novel.texts.c1, 'The cat sat on the mat.');
	assert.deepEqual(chat.getSnapshot().undoable, []);
});

test('undo leaves alone a file the author edited after the answer', async () => {
	const edit = call('edit_chapter', '[[chapter]] Opening\n[[find]]\ncat\n[[replace]]\nowl\n');
	const { chat, config, persistence, novel } = session([edit, 'Done.'], { autoApprove: true });
	await chat.send('Use an owl', [], config);
	novel.texts.c1 = 'The author rewrote this.';

	const result = await chat.undo(persistence.chats.get('chat')[1].id_mensaje);
	assert.deepEqual(result, { reverted: 0, conflicts: ['novel/c1.md'] });
	assert.equal(novel.texts.c1, 'The author rewrote this.');
});

test('an answer that only read has nothing to undo', async () => {
	const read = call('read_chapter', '[[chapter]] Opening\n');
	const { chat, config } = session([read, 'It is about a cat.']);
	await chat.send('What happens?', [], config);
	assert.deepEqual(chat.getSnapshot().undoable, []);
});
