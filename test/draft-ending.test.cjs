const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// Drafts cut by the output limit: detecting the half sentence and cutting it back.
function load(relative) {
	const filename = require.resolve(relative);
	const source = fs.readFileSync(filename, 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
	});
	const module = new Module(filename, null);
	module.filename = filename;
	module._compile(compiled.outputText, filename);
	return module.exports;
}

const {
	endsWithCompleteSentence,
	trimToCompleteSentence,
	wasCutMidSentence,
} = load('../src/utils/draftEnding.ts');

test('sentences closed by punctuation, quotes or dialogue dashes count as complete', () => {
	assert.ok(endsWithCompleteSentence('Se fue.'));
	assert.ok(endsWithCompleteSentence('¿Vienes?»'));
	assert.ok(endsWithCompleteSentence('"Ya basta."  '));
	assert.ok(endsWithCompleteSentence('—No. —'));
	assert.ok(!endsWithCompleteSentence('El androide herido no esperó a que'));
});

test('a cut draft goes back to its last complete sentence', () => {
	const text = 'Primera frase. «Segunda», dijo.\n\nY entonces el androide';
	assert.equal(trimToCompleteSentence(text), 'Primera frase. «Segunda», dijo.');
	assert.ok(wasCutMidSentence(text));
});

test('a text without any sentence end is left alone', () => {
	assert.equal(trimToCompleteSentence('word word word'), 'word word word');
	assert.ok(!wasCutMidSentence('word word word'));
});
