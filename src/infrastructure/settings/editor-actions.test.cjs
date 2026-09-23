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

const { DEFAULT_EDITOR_ACTIONS } = require('../../constants/editorActions.ts');
const {
	EditorActionRepository,
	validateEditorAction,
} = require('./editor-action-repository.ts');
const { buildEditorActionPrompt } = require('../../context/editorActionTemplate.ts');

test('built-in action IDs remain stable and exclude Generate text', () => {
	assert.equal(DEFAULT_EDITOR_ACTIONS.length, 7);
	assert.equal(DEFAULT_EDITOR_ACTIONS.some(action => action.id === 'generate-text'), false);
	assert.deepEqual(DEFAULT_EDITOR_ACTIONS.map(action => action.id), [
		'summarize-selection',
		'expand-selection',
		'shorten-selection',
		'rephrase-selection',
		'correct-selection',
		'translate-selection-spanish',
		'translate-selection-english',
	]);
});

test('location is saved separately from the name and can be changed', async () => {
	let saves = 0;
	const settings = {
		data: { editorActions: [] },
		async save() { saves += 1; },
	};
	const repository = new EditorActionRepository(settings);
	const action = await repository.create({
		name: 'My rewrite',
		placement: 'context-menu',
		instruction: 'Rewrite {{input}}.',
		input: 'selection',
		output: 'replace-input',
	});
	assert.equal(action.name, 'My rewrite');
	assert.equal(action.placement, 'context-menu');
	await repository.update({ ...action, placement: 'command' });
	assert.equal(repository.list()[0].placement, 'command');
	assert.equal(repository.list()[0].id, action.id);
	assert.equal(saves, 2);
});

test('input marker controls whether the text is appended', () => {
	const action = { ...DEFAULT_EDITOR_ACTIONS[0], instruction: 'Rewrite {{input}}' };
	const context = {
		input: 'Selected words',
		selection: 'Selected words',
		note: 'Selected words in a note',
		before_cursor: '',
	};
	assert.equal(buildEditorActionPrompt(action, context), 'Rewrite Selected words');
	assert.equal(buildEditorActionPrompt(DEFAULT_EDITOR_ACTIONS[0], context),
		'Summarize the selected text. Return only the summary.\n\nText:\nSelected words');
	assert.equal(validateEditorAction({ ...action, instruction: '{{missing}}' }),
		'Unknown placeholder: {{missing}}.');
});
