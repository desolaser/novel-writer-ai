const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');

// What a chat answer changed in the novel, and the plan to take it back.
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

const { diffSnapshots, planRevert } = load('../src/utils/fileChanges.ts');

test('the diff lists edited, created and deleted files', () => {
	const before = { 'a.md': 'one', 'b.json': '{}', 'gone.md': 'bye' };
	const after = { 'a.md': 'two', 'b.json': '{}', 'new.md': 'hi' };
	assert.deepEqual(diffSnapshots(before, after), [
		{ path: 'a.md', before: 'one', after: 'two' },
		{ path: 'gone.md', before: 'bye', after: null },
		{ path: 'new.md', before: null, after: 'hi' },
	]);
});

test('files still as the answer left them are reverted, others are conflicts', () => {
	const changes = [
		{ path: 'a.md', before: 'one', after: 'two' },
		{ path: 'b.md', before: 'x', after: 'y' },
		{ path: 'new.md', before: null, after: 'hi' },
		{ path: 'gone.md', before: 'bye', after: null },
	];
	const current = { 'a.md': 'two', 'b.md': 'edited by the author', 'new.md': 'hi', 'gone.md': null };
	const plan = planRevert(changes, current);
	assert.deepEqual(plan.apply.map((change) => change.path), ['a.md', 'new.md', 'gone.md']);
	assert.deepEqual(plan.conflicts, ['b.md']);
});

test('a deleted file that came back since is a conflict too', () => {
	const changes = [{ path: 'gone.md', before: 'bye', after: null }];
	const plan = planRevert(changes, { 'gone.md': 'recreated' });
	assert.deepEqual(plan.conflicts, ['gone.md']);
});
