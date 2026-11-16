const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Runs the real ChatRepo against an in-memory vault whose reads and writes take
// a random time, so overlapping read-modify-write cycles on one chat happen.
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
		this.extension = 'json';
	}
}
class TFolder {}

let idCounter = 0;
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name === 'obsidian') {
		return { TFile, TFolder, TAbstractFile: class {} };
	}
	if (name.endsWith('/domain')) {
		return { nowISO: () => new Date().toISOString() };
	}
	if (name.endsWith('/utils/ids')) {
		return { genId: () => `id${++idCounter}` };
	}
	if (name.endsWith('/constants/novel')) {
		return { NOVELA_SUBFOLDERS: [] };
	}
	return originalLoad.call(this, name, parent, isMain);
};

const ChatRepo = require(
	path.join(__dirname, '../src/infrastructure/storage/repos/ChatRepo.ts')
);

const randomDelay = () => new Promise(resolve => {
	setTimeout(resolve, Math.random() * 5);
});

function fakeApp() {
	const files = new Map();
	return {
		files,
		vault: {
			getAbstractFileByPath: (filePath) => {
				return files.has(filePath) ? new TFile(filePath) : null;
			},
			read: async (file) => {
				await randomDelay();
				return files.get(file.path);
			},
			modify: async (file, content) => {
				await randomDelay();
				files.set(file.path, content);
			},
			create: async (filePath, content) => {
				await randomDelay();
				files.set(filePath, content);
			},
			createFolder: async () => {},
		},
	};
}

test('a rename, new messages and patches on one chat are all kept', async () => {
	const app = fakeApp();
	const folder = 'Novel';
	const chat = await ChatRepo.createChat(app, folder, 'novel', 'Unnamed chat');
	const first = await ChatRepo.appendMensaje(
		app, folder, chat.id_chat, 'assistant', 'draft',
	);

	await Promise.all([
		ChatRepo.renameChat(app, folder, chat.id_chat, 'Named chat'),
		ChatRepo.patchMensaje(app, folder, chat.id_chat, first.id_mensaje, {
			mensaje: 'final', toolCalls: [{ id: 'c1', name: 'read_chapter', kind: 'read', args: {}, status: 'done' }],
		}),
		...Array.from({ length: 10 }, (_, index) => ChatRepo.appendMensaje(
			app, folder, chat.id_chat, 'user', `message ${index}`,
		)),
	]);

	const stored = await ChatRepo.readChat(app, folder, chat.id_chat);
	assert.equal(stored.nombre, 'Named chat');
	assert.equal(stored.mensajes.length, 11);
	assert.equal(stored.mensajes[0].mensaje, 'final');
	assert.equal(stored.mensajes[0].toolCalls[0].name, 'read_chapter');
});

test('the same updates without the lock lose data', async () => {
	// Control case: the old read-modify-write without coordination. If this
	// stopped losing messages, the test above would prove nothing.
	const app = fakeApp();
	const folder = 'Novel';
	const chat = await ChatRepo.createChat(app, folder, 'novel', 'Unnamed chat');
	const filePath = `${folder}/chats/chat_${chat.id_chat}.json`;
	const unlockedAppend = async (text) => {
		const file = new TFile(filePath);
		const data = JSON.parse(await app.vault.read(file));
		data.mensajes.push({ id_mensaje: text, mensaje: text });
		await app.vault.modify(file, JSON.stringify(data));
	};

	await Promise.all(
		Array.from({ length: 10 }, (_, index) => unlockedAppend(`message ${index}`)),
	);

	const stored = JSON.parse(app.files.get(filePath));
	assert.ok(stored.mensajes.length < 10, 'unsynchronized appends should collide');
});

test('patching a message keeps the fields it does not mention', async () => {
	const app = fakeApp();
	const folder = 'Novel';
	const chat = await ChatRepo.createChat(app, folder, 'novel', 'Chat');
	const message = await ChatRepo.appendMensaje(
		app, folder, chat.id_chat, 'assistant', 'text', ['img.png'],
	);
	await ChatRepo.patchMensaje(app, folder, chat.id_chat, message.id_mensaje, {
		toolCalls: [{ id: 'c1', name: 'list_codex', kind: 'read', args: {}, status: 'done' }],
	});
	const stored = await ChatRepo.readChat(app, folder, chat.id_chat);
	assert.equal(stored.mensajes[0].mensaje, 'text');
	assert.deepEqual(stored.mensajes[0].imagenes, ['img.png']);
	assert.equal(stored.mensajes[0].toolCalls.length, 1);
});
