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

const { mergeCodexSchema } = require('../src/utils/codexSchemaMerge.ts');

const NOW = '2026-11-16T00:00:00.000Z';
const OLD = '2026-01-01T00:00:00.000Z';

function cat(id, nombre, system = false, novel = 'src') {
	return {
		id_categoria: id, nombre, color: '#fff', system,
		id_novela: novel, created_at: OLD, updated_at: OLD,
	};
}

function det(id, nombre, orden, novel = 'src') {
	return {
		id_detalle: id, nombre, tipo_detalle: 'dropdown', incluir_ia: true,
		ai_hint: `hint ${nombre}`, orden, id_novela: novel,
		created_at: OLD, updated_at: OLD,
	};
}

function opt(id, idDetalle, nombre) {
	return {
		id_opcion_detalle: id, nombre, color: '#000', orden: 0,
		id_detalle: idDetalle, created_at: OLD, updated_at: OLD,
	};
}

function link(id, idDetalle, idCategoria) {
	return {
		id_detalle_categoria: id, id_detalle: idDetalle,
		id_categoria: idCategoria, created_at: OLD, updated_at: OLD,
	};
}

/** Source novel: one custom category, two details, one with options. */
function sourceSchema() {
	return {
		categorias: [
			cat('s-chars', 'Characters', true),
			cat('s-fac', 'Factions'),
		],
		detalles: [
			det('s-age', 'Age', 1),
			det('s-rank', 'Rank', 0),
		],
		opciones: [
			opt('s-o1', 's-rank', 'Captain'),
			opt('s-o2', 's-rank', 'Soldier'),
		],
		detalle_categorias: [
			link('s-l1', 's-age', 's-chars'),
			link('s-l2', 's-rank', 's-fac'),
			link('s-l3', 's-rank', 's-chars'),
		],
	};
}

/** A brand-new novel: only the default categories, with their own ids. */
function freshTarget() {
	return {
		categorias: [cat('t-chars', 'Characters', true, 'tgt')],
		detalles: [],
		opciones: [],
		detalle_categorias: [],
	};
}

function byName(items, name) {
	return items.find(item => item.nombre === name);
}

test('copies everything into a new novel with fresh ids', () => {
	const { schema, summary } = mergeCodexSchema(
		sourceSchema(), freshTarget(), 'tgt', 'all', NOW,
	);
	assert.deepEqual(summary, {
		categoriesAdded: 1,
		categoriesSkipped: 0,
		detailsAdded: 2,
		detailsSkipped: 0,
	});

	const fac = byName(schema.categorias, 'Factions');
	assert.notEqual(fac.id_categoria, 's-fac');
	assert.equal(fac.id_novela, 'tgt');
	assert.equal(fac.system, false);

	const rank = byName(schema.detalles, 'Rank');
	const age = byName(schema.detalles, 'Age');
	assert.notEqual(rank.id_detalle, 's-rank');
	assert.equal(rank.ai_hint, 'hint Rank');
	assert.equal(rank.id_novela, 'tgt');
	// Source order is kept: Rank (0) before Age (1).
	assert.ok(rank.orden < age.orden);

	const options = schema.opciones.map(o => [o.nombre, o.id_detalle]);
	assert.deepEqual(options, [
		['Captain', rank.id_detalle],
		['Soldier', rank.id_detalle],
	]);
});

test('links to default categories are remapped by name', () => {
	const { schema } = mergeCodexSchema(
		sourceSchema(), freshTarget(), 'tgt', 'all', NOW,
	);
	const age = byName(schema.detalles, 'Age');
	const rank = byName(schema.detalles, 'Rank');
	const fac = byName(schema.categorias, 'Factions');
	const pairs = schema.detalle_categorias
		.map(l => `${l.id_detalle}>${l.id_categoria}`)
		.sort();
	assert.deepEqual(pairs, [
		`${age.id_detalle}>t-chars`,
		`${rank.id_detalle}>${fac.id_categoria}`,
		`${rank.id_detalle}>t-chars`,
	].sort());
});

test('items with the same name are skipped and left untouched', () => {
	const target = freshTarget();
	target.categorias.push(cat('t-fac', 'factions ', false, 'tgt'));
	target.detalles.push(det('t-age', 'AGE', 0, 'tgt'));
	target.detalles[0].ai_hint = 'mine';

	const { schema, summary } = mergeCodexSchema(
		sourceSchema(), target, 'tgt', 'all', NOW,
	);
	assert.equal(summary.categoriesSkipped, 1);
	assert.equal(summary.detailsSkipped, 1);
	assert.equal(schema.categorias.length, 2);
	assert.equal(schema.detalles.length, 2);
	assert.equal(byName(schema.detalles, 'AGE').ai_hint, 'mine');

	// The new detail links to the existing category with the same name.
	const rank = byName(schema.detalles, 'Rank');
	const rankCats = schema.detalle_categorias
		.filter(l => l.id_detalle === rank.id_detalle)
		.map(l => l.id_categoria)
		.sort();
	assert.deepEqual(rankCats, ['t-chars', 't-fac']);

	// Existing detail + existing category: the link is not added.
	const ageLinks = schema.detalle_categorias
		.filter(l => l.id_detalle === 't-age');
	assert.equal(ageLinks.length, 0);
});

test('a partial selection copies only what was picked', () => {
	const { schema, summary } = mergeCodexSchema(
		sourceSchema(),
		freshTarget(),
		'tgt',
		{ categoryIds: [], detailIds: ['s-rank'] },
		NOW,
	);
	assert.equal(summary.categoriesAdded, 0);
	assert.equal(summary.detailsAdded, 1);
	assert.equal(byName(schema.categorias, 'Factions'), undefined);

	// The link to the category that was not imported is dropped.
	const rank = byName(schema.detalles, 'Rank');
	const rankCats = schema.detalle_categorias
		.filter(l => l.id_detalle === rank.id_detalle)
		.map(l => l.id_categoria);
	assert.deepEqual(rankCats, ['t-chars']);
});

test('importing a category links it to existing details too', () => {
	const target = freshTarget();
	target.detalles.push(det('t-rank', 'Rank', 0, 'tgt'));

	const { schema } = mergeCodexSchema(
		sourceSchema(),
		target,
		'tgt',
		{ categoryIds: ['s-fac'], detailIds: [] },
		NOW,
	);
	const fac = byName(schema.categorias, 'Factions');
	const facLinks = schema.detalle_categorias
		.filter(l => l.id_categoria === fac.id_categoria)
		.map(l => l.id_detalle);
	assert.deepEqual(facLinks, ['t-rank']);
});

test('new details go after the existing ones', () => {
	const target = freshTarget();
	target.detalles.push(det('t-x', 'Height', 5, 'tgt'));

	const { schema } = mergeCodexSchema(
		sourceSchema(), target, 'tgt', 'all', NOW,
	);
	assert.equal(byName(schema.detalles, 'Rank').orden, 6);
	assert.equal(byName(schema.detalles, 'Age').orden, 7);
});

test('unnamed items never count as duplicates', () => {
	const source = sourceSchema();
	source.detalles.push(det('s-blank', '', 2));
	const target = freshTarget();
	target.detalles.push(det('t-blank', '', 0, 'tgt'));

	const { summary } = mergeCodexSchema(source, target, 'tgt', 'all', NOW);
	assert.equal(summary.detailsAdded, 3);
	assert.equal(summary.detailsSkipped, 0);
});

test('the inputs are not modified', () => {
	const source = sourceSchema();
	const target = freshTarget();
	const before = JSON.stringify({ source, target });
	mergeCodexSchema(source, target, 'tgt', 'all', NOW);
	assert.equal(JSON.stringify({ source, target }), before);
});
