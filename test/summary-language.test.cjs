const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const Module = require('node:module');
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

// The scene prompt reads the vault; these tests only build summary prompts.
const originalLoad = Module._load;
Module._load = function (name, parent, isMain) {
	if (name.endsWith('/context/promptBuilder')) {
		return { buildScenePrompt: async () => '' };
	}
	return originalLoad.call(this, name, parent, isMain);
};

const {
	buildOutlinePrompt,
	buildActSummaryPrompt,
	buildOutlineByMemoryPrompt,
} = require('../src/ui/react/outline/outlineGenerators.ts');
const { buildStoryBibleBlock } = require('../src/context/blueprintPrompt.ts');
const { createEmptyBlueprint } = require('../src/domain/entities/NovelBlueprint.ts');

const chapter = { id_capitulo: 'c1', id_acto: 'a1', nombre: 'El faro', outline: '' };
const act = { id_acto: 'a1', nombre: 'Primer acto', resumen: '' };

function blueprint(fields) {
	return { ...createEmptyBlueprint('n1'), ...fields };
}

function lastLine(prompt) {
	const lines = prompt.trim().split('\n');
	return lines[lines.length - 1];
}

test('chapter summary names the language of the novel, after the text', () => {
	const prompt = buildOutlinePrompt(
		chapter, 'Marta subió al faro.', blueprint({ language: 'Spanish' })
	);
	assert.ok(prompt.indexOf('Marta subió') < prompt.indexOf('Spanish'));
	assert.match(lastLine(prompt), /Write the summary in Spanish/);
});

test('chapter summary follows the chapter text when no language is set', () => {
	const prompt = buildOutlinePrompt(chapter, 'Marta subió al faro.', null);
	assert.match(lastLine(prompt), /same language as the chapter text/);
});

test('act summary keeps the language rule when the story bible is sent', () => {
	const bp = blueprint({
		language: 'Spanish',
		description: 'Una novela sobre un faro.',
		includeInPrompts: true,
	});
	const bible = buildStoryBibleBlock(bp);
	assert.ok(bible, 'the bible must not be empty for this case');
	const prompt = buildActSummaryPrompt(act, 'El faro: Marta sube.', bible, bp);
	assert.match(lastLine(prompt), /Write the summary in Spanish/);
});

test('act summary keeps the language rule when the story bible is off', () => {
	const bp = blueprint({ language: 'Spanish', includeInPrompts: false });
	assert.equal(buildStoryBibleBlock(bp), '');
	const prompt = buildActSummaryPrompt(act, 'El faro: Marta sube.', '', bp);
	assert.match(lastLine(prompt), /Write the summary in Spanish/);
});

test('act summary follows the outlines when no language is set', () => {
	const prompt = buildActSummaryPrompt(act, 'El faro: Marta sube.', '', null);
	assert.match(lastLine(prompt), /same language as the chapter outlines/);
});

test('outline by memory follows the previous chapters', () => {
	const prompt = buildOutlineByMemoryPrompt(
		chapter, 'Capítulo 1: Marta llega.', '', null
	);
	assert.match(lastLine(prompt), /same language as the previous chapters/);
});

test('outline by memory adds no rule when there is nothing to follow', () => {
	const prompt = buildOutlineByMemoryPrompt(chapter, '', '', null);
	assert.doesNotMatch(prompt, /same language as/);
});
