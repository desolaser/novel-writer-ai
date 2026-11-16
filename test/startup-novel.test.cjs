const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
	const source = fs.readFileSync(filename, 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2020,
		},
	});
	module._compile(compiled.outputText, filename);
};

const { resolveStartupNovelId } = require('../src/utils/startupNovel.ts');

function novel(id, updatedAt) {
	return { novela: { id_novela: id, nombre: id, updated_at: updatedAt } };
}

const novels = [
	novel('old', '2026-01-01T00:00:00.000Z'),
	novel('recent', '2026-10-01T00:00:00.000Z'),
	novel('middle', '2026-05-01T00:00:00.000Z'),
];

test('keeps the saved novel while it exists', () => {
	assert.equal(resolveStartupNovelId('old', novels), 'old');
});

test('a deleted saved novel falls back to the most recently updated', () => {
	assert.equal(resolveStartupNovelId('deleted', novels), 'recent');
});

test('nothing saved falls back to the most recently updated', () => {
	assert.equal(resolveStartupNovelId(null, novels), 'recent');
});

test('no novels in the vault opens nothing', () => {
	assert.equal(resolveStartupNovelId('deleted', []), null);
});
