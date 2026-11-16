const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const ts = require('typescript');

// Writing pace: the daily log, its merge, the pace shown in Metrics and the tracker.
require.extensions['.ts'] = (module, filename) => {
	const source = fs.readFileSync(filename, 'utf8');
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
	});
	module._compile(compiled.outputText, filename);
};

const {
	dayKey,
	shiftDay,
	mergeWritingDays,
	normalizeWritingLog,
	writingPace,
} = require('../src/utils/writingLog.ts');
const { WritingTracker } = require('../src/infrastructure/storage/writingTracker.ts');
const { attributeSave } = require('../src/utils/writingAttribution.ts');
const { markPluginWrite, isPluginWrite } = require('../src/infrastructure/storage/pluginWrites.ts');

function day(date, added, removed = 0, generated = 0, pasted = 0) {
	return { date, added, removed, generated, pasted };
}

function log(...days) {
	return mergeWritingDays({ version: 1, days: [] }, days);
}

test('day keys are local dates and shift across months and years', () => {
	assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
	assert.equal(shiftDay('2026-03-01', -1), '2026-02-28');
	assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

test('merging adds the counts of the same day and keeps days in order', () => {
	const merged = mergeWritingDays(
		log(day('2026-11-02', 100, 10), day('2026-11-01', 50)),
		[day('2026-11-02', 20, 5, 300)],
	);
	assert.deepEqual(merged.days, [day('2026-11-01', 50), day('2026-11-02', 120, 15, 300)]);
});

test('a malformed log on disk is cleaned instead of breaking', () => {
	assert.deepEqual(normalizeWritingLog(null).days, []);
	assert.deepEqual(normalizeWritingLog({ days: 'x' }).days, []);
	const cleaned = normalizeWritingLog({
		days: [{ date: 'yesterday', added: 1 }, { date: '2026-11-01', added: '5', removed: 2 }],
	});
	assert.deepEqual(cleaned.days, [day('2026-11-01', 0, 2)]);
	// Logs written before the pasted count existed read as zero pasted.
	const old = normalizeWritingLog({ days: [{ date: '2026-11-01', added: 3, removed: 0, generated: 1 }] });
	assert.deepEqual(old.days, [day('2026-11-01', 3, 0, 1, 0)]);
});

test('pace: today, recent totals, streaks and best day', () => {
	const now = new Date(2026, 10, 16, 12);
	const pace = writingPace(log(
		day('2026-11-01', 2000),
		day('2026-11-02', 500),
		day('2026-11-03', 100, 300),
		day('2026-11-14', 400),
		day('2026-11-15', 600, 100),
		day('2026-11-16', 300, 0, 1500),
	), now, null);
	assert.equal(pace.hasData, true);
	assert.equal(pace.today, 300);
	assert.equal(pace.todayGenerated, 1500);
	assert.equal(pace.last7Days, 1200);
	assert.equal(pace.last30Days, 3500);
	assert.equal(pace.streak, 3);
	assert.equal(pace.longestStreak, 3);
	assert.deepEqual(pace.bestDay, { date: '2026-11-01', words: 2000, generated: 0, pasted: 0 });
	assert.equal(pace.averagePerWritingDay, Math.round(3700 / 5));
	assert.equal(pace.series.length, 30);
	assert.equal(pace.series[29].date, '2026-11-16');
	assert.equal(pace.projection, null);
});

test('the streak survives a day that has not started yet', () => {
	const now = new Date(2026, 10, 16, 8);
	const pace = writingPace(log(day('2026-11-14', 100), day('2026-11-15', 100)), now, null);
	assert.equal(pace.streak, 2);
	assert.equal(pace.today, 0);
});

test('projection: finish date at the recent pace, or none without pace', () => {
	const now = new Date(2026, 10, 16, 12);
	// Log started 10 days ago (10 calendar days, both ends included): 1000 words a day.
	const recent = log(day('2026-11-07', 5000), day('2026-11-16', 5000));
	const pace = writingPace(recent, now, 20000);
	assert.equal(pace.recentDailyPace, 1000);
	assert.deepEqual(pace.projection, { remainingWords: 20000, daysLeft: 20, finishDate: '2026-12-06' });

	const none = writingPace(log(), now, 20000);
	assert.deepEqual(none.projection, { remainingWords: 20000, daysLeft: null, finishDate: null });
	assert.equal(none.hasData, false);

	const done = writingPace(recent, now, -50);
	assert.deepEqual(done.projection, { remainingWords: 0, daysLeft: 0, finishDate: '2026-11-16' });
});

test('plugin write marks expire after a few seconds', () => {
	markPluginWrite('a.md', 1000);
	assert.equal(isPluginWrite('a.md', 2000), true);
	assert.equal(isPluginWrite('a.md', 10000), false);
	assert.equal(isPluginWrite('b.md', 2000), false);
});

function fakeTracker(files, generatedPaths = new Set()) {
	const stored = [];
	const tracker = new WritingTracker({
		readText: async (path) => files[path] ?? null,
		readLog: async () => mergeWritingDays({ version: 1, days: [] }, stored),
		addDays: async (_folder, days) => {
			stored.push(...days);
		},
		isPluginWrite: (path) => generatedPaths.has(path),
		now: () => new Date(2026, 10, 16, 12),
	});
	return { tracker, stored };
}

test('the tracker credits the difference since the novel became active', async () => {
	const files = { 'n/c1.md': 'one two three', 'n/c2.md': '', 'other.md': 'x' };
	const { tracker, stored } = fakeTracker(files);
	await tracker.setNovel('n', ['n/c1.md', 'n/c2.md']);

	files['n/c1.md'] = 'one two three four five';
	await tracker.onModify('n/c1.md');
	files['n/c1.md'] = 'one two three four';
	await tracker.onModify('n/c1.md');
	files['other.md'] = 'lots of words that do not belong to the novel';
	await tracker.onModify('other.md');

	const pending = await tracker.readLog();
	assert.deepEqual(pending.days, [day('2026-11-16', 2, 1)]);
	assert.equal(stored.length, 0);
	await tracker.flush();
	assert.deepEqual(stored, [day('2026-11-16', 2, 1)]);
	assert.deepEqual((await tracker.readLog()).days, [day('2026-11-16', 2, 1)]);
});

test('words written by the plugin go to generated, not to the author', async () => {
	const files = { 'n/c1.md': '' };
	const { tracker } = fakeTracker(files, new Set(['n/c1.md']));
	await tracker.setNovel('n', ['n/c1.md']);
	files['n/c1.md'] = '---\nstatus: draft\n---\nThe AI wrote this chapter.';
	await tracker.onModify('n/c1.md');
	assert.deepEqual((await tracker.readLog()).days, [day('2026-11-16', 0, 0, 5)]);
	await tracker.flush();
});

test('switching novels saves the pending counts to the novel they belong to', async () => {
	const files = { 'a/c.md': 'one', 'b/c.md': 'uno dos' };
	const saved = [];
	const tracker = new WritingTracker({
		readText: async (path) => files[path] ?? null,
		readLog: async () => ({ version: 1, days: [] }),
		addDays: async (folder, days) => {
			saved.push([folder, days]);
		},
		isPluginWrite: () => false,
		now: () => new Date(2026, 10, 16, 12),
	});
	await tracker.setNovel('a', ['a/c.md']);
	files['a/c.md'] = 'one two';
	await tracker.onModify('a/c.md');
	await tracker.setNovel('b', ['b/c.md']);
	files['a/c.md'] = 'one two three';
	await tracker.onModify('a/c.md');
	assert.deepEqual(saved, [['a', [day('2026-11-16', 1)]]]);
});

test('a save is split between the plugin, the clipboard and the author', () => {
	const none = { generated: 0, pasted: 0 };
	const split = (delta, pluginWrite, noted, stack = []) =>
		attributeSave('d', delta, pluginWrite, noted, stack);
	assert.deepEqual(split(12, false, none), day('d', 12));
	assert.deepEqual(split(-4, false, none), day('d', 0, 4));
	// Typed 3 words and pasted 40.
	assert.deepEqual(split(43, false, { generated: 0, pasted: 40 }), day('d', 3, 0, 0, 40));
	// A whole save written by the plugin.
	assert.deepEqual(split(300, true, none), day('d', 0, 0, 300));
	// The AI replaced 10 words with 15 and 2 words went away in the same save:
	// they come out of the AI text, still the most recent.
	assert.deepEqual(split(3, false, { generated: 5, pasted: 0 }), day('d', 0, 0, 3));
	// A deletion with no foreign words in the file is the author's.
	assert.deepEqual(split(-2, false, none, []), day('d', 0, 2));
});

test('deleting pasted or generated text takes it out of those counts first', () => {
	const none = { generated: 0, pasted: 0 };
	const stack = [];
	// Pasted 85 words, saved; then deleted them all, saved.
	assert.deepEqual(attributeSave('d', 85, false, { generated: 0, pasted: 85 }, stack), day('d', 0, 0, 0, 85));
	assert.deepEqual(attributeSave('d', -85, false, none, stack), day('d', 0, 0, 0, -85));
	assert.deepEqual(stack, []);
	// Then the author types: all theirs.
	assert.deepEqual(attributeSave('d', 6, false, none, stack), day('d', 6));
	// Paste and delete inside one save cannot be told apart from keeping part of
	// the paste: what is left counts as pasted, never against the author.
	assert.deepEqual(attributeSave('d', 4, false, { generated: 0, pasted: 30 }, stack), day('d', 0, 0, 0, 4));
	attributeSave('d', -4, false, none, stack);
	// With nothing foreign left, deleting is the author's.
	assert.deepEqual(attributeSave('d', -3, false, none, stack), day('d', 0, 3));
	// Most recent first: AI text, then a paste; deleting 12 takes the paste, then the AI.
	attributeSave('d', 10, false, { generated: 10, pasted: 0 }, stack);
	attributeSave('d', 5, false, { generated: 0, pasted: 5 }, stack);
	assert.deepEqual(attributeSave('d', -12, false, none, stack), day('d', 0, 0, -7, -5));
	assert.deepEqual(stack, [{ source: 'generated', words: 3 }]);
});

test('pasted text is not counted as typed; moving text adds up to zero', async () => {
	const files = { 'n/c1.md': 'one two three' };
	const { tracker } = fakeTracker(files);
	await tracker.setNovel('n', ['n/c1.md']);

	files['n/c1.md'] = 'one two three typed word pasted a b c d';
	tracker.noteEdit('n/c1.md', 'pasted', 5);
	await tracker.onModify('n/c1.md');
	assert.deepEqual((await tracker.readLog()).days, [day('2026-11-16', 2, 0, 0, 5)]);

	// Cut "one two" and paste it at the end: same words, nothing typed.
	tracker.noteEdit('n/c1.md', 'pasted', -2);
	files['n/c1.md'] = 'three typed word pasted a b c d';
	await tracker.onModify('n/c1.md');
	tracker.noteEdit('n/c1.md', 'pasted', 2);
	files['n/c1.md'] = 'three typed word pasted a b c d one two';
	await tracker.onModify('n/c1.md');
	assert.deepEqual((await tracker.readLog()).days, [day('2026-11-16', 2, 0, 0, 5)]);

	// Notes on files outside the novel are ignored.
	tracker.noteEdit('other.md', 'pasted', 100);
	assert.equal(tracker.isWatched('other.md'), false);
	await tracker.flush();
});

test('AI text inserted in the editor is generated, typing around it is the author', async () => {
	const files = { 'n/c1.md': 'start' };
	const { tracker } = fakeTracker(files);
	await tracker.setNovel('n', ['n/c1.md']);
	// The author types 2 words, then the AI streams 6 before the save.
	tracker.noteEdit('n/c1.md', 'generated', 4);
	tracker.noteEdit('n/c1.md', 'generated', 2);
	files['n/c1.md'] = 'start my words and the AI wrote this bit';
	await tracker.onModify('n/c1.md');
	assert.deepEqual((await tracker.readLog()).days, [day('2026-11-16', 2, 0, 6)]);
	await tracker.flush();
});
