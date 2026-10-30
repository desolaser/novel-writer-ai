const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

// Exercise the actual TS repos against an in-memory vault whose reads and
// writes take a random time, so overlapping read-modify-write cycles happen.
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
		this.extension = 'md';
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

const repos = path.join(__dirname, '../src/infrastructure/storage/repos');
const EstRepo = require(path.join(repos, 'EstructuraRepo.ts'));
const storage = require(path.join(repos, 'estructuraStorage.ts'));

const randomDelay = () => new Promise(resolve => {
	setTimeout(resolve, Math.random() * 5);
});

function fakeApp() {
	const files = new Map();
	return {
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
			getMarkdownFiles: () => [],
		},
	};
}

async function seed(app, folder) {
	const acto = await EstRepo.createActo(app, folder, 'novel', 'Act 1');
	const caps = [];
	for (let i = 0; i < 20; i++) {
		const cap = await EstRepo.createCapitulo(
			app, folder, acto.id_acto, `Ch ${i}`, i
		);
		caps.push(cap);
	}
	return { acto, caps };
}

test('concurrent updates to the act and every chapter are all kept', async () => {
	const app = fakeApp();
	const folder = 'Novel';
	const { acto, caps } = await seed(app, folder);

	await Promise.all([
		EstRepo.updateActo(app, folder, acto.id_acto, { resumen: 'act summary' }),
		...caps.map((cap, i) => EstRepo.updateCapitulo(
			app, folder, cap.id_capitulo, { outline: `outline ${i}` }
		)),
		EstRepo.reconcileCapituloArchivos(app, folder),
	]);

	const actos = await EstRepo.listActos(app, folder);
	const capitulos = await EstRepo.listCapitulos(app, folder);
	assert.equal(actos[0].resumen, 'act summary');
	capitulos.forEach((cap, i) => assert.equal(cap.outline, `outline ${i}`));
});

test('the same writes without the lock lose data', async () => {
	// Control case: proves the scenario above really overlaps, so its passing
	// means the lock works rather than the writes never colliding.
	const app = fakeApp();
	const folder = 'Novel';
	const { caps } = await seed(app, folder);

	await Promise.all(caps.map(async (cap, i) => {
		const data = await storage.readEstructuraFile(app, folder);
		const stored = data.capitulos.find(c => c.id_capitulo === cap.id_capitulo);
		stored.outline = `outline ${i}`;
		await storage.writeEstructuraFile(app, folder, data);
	}));

	const capitulos = await EstRepo.listCapitulos(app, folder);
	const kept = capitulos.filter((cap, i) => cap.outline === `outline ${i}`);
	assert.ok(kept.length < caps.length, `expected lost writes, kept ${kept.length}`);
});

test('a failing task does not block the ones queued after it', async () => {
	const failing = storage.withEstructuraLock('Novel', async () => {
		throw new Error('boom');
	});
	const next = storage.withEstructuraLock('Novel', async () => 42);

	await assert.rejects(failing, /boom/);
	assert.equal(await next, 42);
});

test('errors raised inside the lock still reach the caller', async () => {
	const app = fakeApp();
	const { acto } = await seed(app, 'Novel');

	await assert.rejects(
		EstRepo.deleteActo(app, 'Novel', acto.id_acto),
		/still contains chapters/
	);
});
