const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

// Length of a chapter draft: the Story Bible's range, aiming at its midpoint.
require.extensions['.ts'] = (module, filename) => {
	const source = fs.readFileSync(filename, 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
	});
	module._compile(compiled.outputText, filename);
};

const { draftLengthFromRange, draftLengthFromWords } = require('../src/utils/draftLength.ts');
const { draftLengthRule } = loadRule();

/** draftLengthRule lives in promptBuilder, which needs Obsidian: test its text through a stub. */
function loadRule() {
	const Module = require('node:module');
	const originalLoad = Module._load;
	Module._load = function (name, parent, isMain) {
		if (name === 'obsidian') return {};
		if (name.endsWith('/repos/CodexEntryRepo') || name.endsWith('/repos/BlueprintRepo')) return {};
		return originalLoad.call(this, name, parent, isMain);
	};
	return require('../src/context/promptBuilder.ts');
}

test('the range of the Story Bible is accepted, aiming at its midpoint', () => {
	assert.deepEqual(draftLengthFromRange({ min: 2000, max: 4000 }), { min: 2000, max: 4000, target: 3000 });
	assert.deepEqual(draftLengthFromRange({ min: 1500, max: 2500 }), { min: 1500, max: 2500, target: 2000 });
});

test('a novel without a usable range gets the default 2000-4000', () => {
	const fallback = { min: 2000, max: 4000, target: 3000 };
	assert.deepEqual(draftLengthFromRange(null), fallback);
	assert.deepEqual(draftLengthFromRange({ min: 0, max: 0 }), fallback);
	assert.deepEqual(draftLengthFromRange({ min: 5000, max: 1000 }), fallback);
});

test('an explicit word count gets a band of 10% around it', () => {
	assert.deepEqual(draftLengthFromWords(1000), { min: 900, max: 1100, target: 1000 });
});

test('the prompt gives the range, the target and the ceiling', () => {
	const rule = draftLengthRule({ min: 2000, max: 4000, target: 3000 }, false);
	assert.match(rule, /between 2000 and 4000 words/);
	assert.match(rule, /about 3000/);
	assert.match(rule, /never go over 4000/);
});
