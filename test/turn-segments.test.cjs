const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// Order of text and tool calls in an answer of the chat, live and stored.
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

const { splitTurn } = load('../src/utils/turnSegments.ts');

const shape = (segments) => segments.map((segment) => segment.kind === 'text'
	? segment.text
	: segment.calls.map((call) => call.name));

test('text and calls come out in the order they happened', () => {
	const text = 'Let me read it.\n\nNow I fix it.\n\nDone.';
	const calls = [
		{ name: 'read', textOffset: 'Let me read it.'.length },
		{ name: 'plan', textOffset: 'Let me read it.'.length },
		{ name: 'edit', textOffset: 'Let me read it.\n\nNow I fix it.'.length },
	];
	assert.deepEqual(shape(splitTurn(text, calls)), [
		'Let me read it.', ['read', 'plan'], 'Now I fix it.', ['edit'], 'Done.',
	]);
});

test('calls made before any text go first', () => {
	const calls = [{ name: 'read', textOffset: 0 }];
	assert.deepEqual(shape(splitTurn('All done.', calls)), [['read'], 'All done.']);
});

test('rounds with no text in between share one group of calls', () => {
	const calls = [{ name: 'a', textOffset: 3 }, { name: 'b', textOffset: 3 }];
	assert.deepEqual(shape(splitTurn('Hi.\n\nBye.', calls)), ['Hi.', ['a', 'b'], 'Bye.']);
});

test('answers saved without offsets keep the calls at the end', () => {
	const calls = [{ name: 'read' }, { name: 'edit' }];
	assert.deepEqual(shape(splitTurn('One.\n\nTwo.', calls)), ['One.\n\nTwo.', ['read', 'edit']]);
});

test('an edited answer never splits a paragraph in half', () => {
	const calls = [{ name: 'read', textOffset: 6 }];
	assert.deepEqual(shape(splitTurn('First part.\n\nSecond.', calls)), [
		'First part.', ['read'], 'Second.',
	]);
});
