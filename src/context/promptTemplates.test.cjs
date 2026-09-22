const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.join(__dirname, 'promptTemplates.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
	compilerOptions: {
		module: ts.ModuleKind.CommonJS,
		target: ts.ScriptTarget.ES2020,
	},
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = module.paths;
loaded._compile(compiled, sourcePath);

const {
	defaultTemplate, renderTemplate, renderTemplateWithBlocks,
	validateTemplate,
} = loaded.exports;

test('prompt types reject each other\'s blocks', () => {
	assert.match(
		validateTemplate('chat', `${defaultTemplate('chat')}\n{{author_note}}`),
		/not available/,
	);
	assert.match(
		validateTemplate('text', `${defaultTemplate('text')}\n{{conversation}}`),
		/not available/,
	);
});

test('required operational blocks cannot be removed', () => {
	assert.match(validateTemplate('text', '{{instructions}}'), /manuscript/);
	assert.match(validateTemplate('chat', '{{conversation}}'), /tools/);
});

test('replacement follows layout order without interpreting source content', () => {
	const result = renderTemplate(
		'text', '{{memory}}\n\n{{instructions}}\n\n{{manuscript}}',
		{
			memory: 'Remember {{author_note}} literally',
			instructions: 'Continue.',
			manuscript: 'Opening scene\n\n\nNext scene',
		},
	);
	assert.equal(
		result,
		'Remember {{author_note}} literally\n\nContinue.\n\nOpening scene\n\n\nNext scene',
	);
});

test('block details follow the exact template order and inserted content', () => {
	const layout = '{{memory}}\n\n{{codex}}\n\n{{manuscript}}';
	const values = {
		memory: '', codex: '--- Codex ---\nA character',
		manuscript: 'The opening scene.',
	};
	const result = renderTemplateWithBlocks('text', layout, values);
	assert.deepEqual(result.blocks, [
		{ key: 'memory', content: '' },
		{ key: 'codex', content: values.codex },
		{ key: 'manuscript', content: values.manuscript },
	]);
	assert.equal(
		result.prompt,
		`${values.codex}\n\n${values.manuscript}`,
	);
	assert.equal(result.prompt, renderTemplate('text', layout, values));
});
