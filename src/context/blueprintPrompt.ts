import type { BlueprintField, NovelBlueprint, WordRange } from '../domain/entities/NovelBlueprint';
import { effectiveNarrativeTime, effectiveTense } from '../domain/entities/NovelBlueprint';
import {
	AUDIENCES,
	NARRATIVE_TENSES,
	NARRATIVE_TIMES,
	getStructureTemplate,
	type PacingSuggestion,
} from '../constants/structures';

/**
 * Prompt building for the novel blueprint. Pure: no Obsidian, no React, no I/O.
 *
 * Two shapes, mirroring the codex generator:
 *  - `buildBlueprintFieldPrompt`: one field, the whole answer is the value.
 *  - `buildBlueprintDeducePrompt`: several fields in one call, answered as
 *    `[[Header]]` sections, so a malformed section only loses that field.
 *
 * Verb tense is never asked about: past is the standard and the author's choice
 * stands, so it is stated as context and never marked as deduced.
 */

/** Section header and human label of each deducible field. */
export const BLUEPRINT_FIELD_LABELS: Record<BlueprintField, string> = {
	title: 'Title',
	genre: 'Genre',
	style: 'Style',
	narrativeTime: 'Narrative time',
	wordsPerChapter: 'Chapter length',
};

export function sectionHeader(field: BlueprintField): string {
	return `[[${BLUEPRINT_FIELD_LABELS[field]}]]`;
}

export interface BlueprintPromptContext {
	blueprint: NovelBlueprint;
	/** What the pacing table suggests, and whether it actually matched anything. */
	pacing: PacingSuggestion;
	/** Free-text instructions written by the author. */
	instructions: string;
}

/**
 * Fields worth asking the model about: the ones the author left undecided.
 * Picking Linear explicitly is a decision and takes narrative time out of here,
 * which is why the field has an `unset` value of its own.
 */
export function deducibleFields(blueprint: NovelBlueprint, pacing: PacingSuggestion): BlueprintField[] {
	const targets: BlueprintField[] = [];
	if (!blueprint.title.trim()) targets.push('title');
	if (!blueprint.genre.trim()) targets.push('genre');
	if (!blueprint.style.trim()) targets.push('style');
	if (blueprint.narrativeTime === 'unset') targets.push('narrativeTime');
	// The pacing table wins whenever it matched a platform or a genre; the model
	// is only asked to estimate when nothing matched.
	if (pacing.source === 'fallback') targets.push('wordsPerChapter');
	return targets;
}

function label<T extends string>(options: { id: T; label: string }[], id: T): string {
	return options.find((option) => option.id === id)?.label ?? id;
}

function formatRange(range: WordRange): string {
	return `${range.min}-${range.max}`;
}

/** Per-field instruction telling the model exactly what shape the answer must have. */
export function fieldInstruction(field: BlueprintField, context: BlueprintPromptContext): string {
	const { blueprint, pacing } = context;
	switch (field) {
		case 'title':
			return 'Answer with a provisional title of at most six words. No quotes, no subtitle, no explanation.';
		case 'genre':
			return 'Answer with one short genre label of two to four words, such as high fantasy, psychological thriller or magical realism.';
		case 'style':
			return 'Answer with a single line: either a reference author to write in the vein of, or a description of the pacing and the prose density. No more than fifteen words.';
		case 'narrativeTime':
			return [
				'Answer with exactly one of these, copied verbatim:',
				NARRATIVE_TIMES.filter((item) => item.id !== 'unset')
					.map((item) => `- ${item.label}`)
					.join('\n'),
				'Only pick something other than Linear when the description clearly shows it.',
				'If there is no clear evidence, answer exactly: unclear',
			].join('\n');
		case 'wordsPerChapter':
			return [
				`Answer with the target length of a single chapter as a range, formatted exactly as min-max, digits only, no commas. Example: ${formatRange(pacing.range)}`,
				`Base it on what readers expect for this genre on this platform (${label(AUDIENCES, blueprint.audience)}).`,
			].join('\n');
		default:
			return 'Answer with a single short line.';
	}
}

/**
 * The language everything the model writes must come out in.
 *
 * The plugin is in English but the stories are not: an empty language field
 * means "follow the description", so an author who writes their premise in
 * their own language gets titles, outlines and prose in it without configuring
 * anything.
 */
export function languageRule(blueprint: NovelBlueprint, subject = 'your answer'): string {
	const language = blueprint.language.trim();
	return language
		? `Write ${subject} in ${language}, regardless of the language of these instructions.`
		: `Write ${subject} in the same language as the description above, regardless of the language of these instructions.`;
}

/** Language shown in a context block: the chosen one, or where it comes from. */
function languageValue(blueprint: NovelBlueprint): string {
	return blueprint.language.trim() || 'same as the description';
}

/** Longest a free-text field gets to be inside the story bible. */
const BIBLE_FIELD_LIMIT = 600;

/** Collapses and shortens a field: the bible rides along on every request. */
function trimForBible(value: string): string {
	const clean = value.replace(/\s+/g, ' ').trim();
	if (clean.length <= BIBLE_FIELD_LIMIT) return clean;
	const cut = clean.slice(0, BIBLE_FIELD_LIMIT);
	const boundary = cut.lastIndexOf('. ');
	return `${(boundary > BIBLE_FIELD_LIMIT / 2 ? cut.slice(0, boundary + 1) : cut).trim()} ...`;
}

/**
 * Compact statement of what the novel is, for the prompts that write prose.
 *
 * This is what carries the language of the story into chapter drafts and chat:
 * without it the model answers in the language of the instructions, which are
 * in English no matter what the novel is written in.
 *
 * Returns an empty string when the author turned it off or when the blueprint
 * has nothing worth sending.
 */
export function buildStoryBibleBlock(
	blueprint: NovelBlueprint | null | undefined,
	options: {
		/**
		 * Send only the language directive. Used while roleplaying, where the
		 * character must not recite the premise but still has to answer in the
		 * language of the story. Without an explicit language there is nothing to
		 * say, since the rule about following the description needs a description
		 * in the prompt.
		 */
		languageOnly?: boolean;
	} = {},
): string {
	if (!blueprint || !blueprint.includeInPrompts) return '';
	if (options.languageOnly)
		return blueprint.language.trim() ? languageRule(blueprint, 'your replies') : '';
	const lines: string[] = [];
	if (blueprint.title.trim()) lines.push(`Title: ${blueprint.title.trim()}`);
	if (blueprint.genre.trim()) lines.push(`Genre: ${blueprint.genre.trim()}`);
	if (blueprint.style.trim()) lines.push(`Style: ${blueprint.style.trim()}`);
	if (blueprint.language.trim()) lines.push(`Language: ${blueprint.language.trim()}`);
	if (blueprint.setting.trim()) lines.push(`Setting: ${trimForBible(blueprint.setting)}`);
	// Labelled "Description" and not "Premise" so the language rule below, which
	// points at the description, refers to a line that is actually in the block.
	if (blueprint.description.trim()) lines.push(`Description: ${trimForBible(blueprint.description)}`);
	// Nothing but derived defaults is not worth the tokens it would cost.
	if (lines.length === 0) return '';

	lines.push(`Verb tense: ${label(NARRATIVE_TENSES, effectiveTense(blueprint.tense))}`);
	const narrativeTime = effectiveNarrativeTime(blueprint.narrativeTime);
	if (narrativeTime !== 'linear')
		lines.push(`Narrative time: ${label(NARRATIVE_TIMES, narrativeTime)}`);
	// The "same as the description" rule needs the description to be in the block.
	if (blueprint.language.trim() || blueprint.description.trim())
		lines.push(languageRule(blueprint, 'the text'));

	return ['--- Story bible ---', ...lines, '--- End story bible ---'].join('\n');
}

/** Readable dump of what the blueprint already holds. */
function buildStateBlock(blueprint: NovelBlueprint): string[] {
	const template = getStructureTemplate(blueprint.structure);
	const parts: string[] = ['--- NOVEL ---'];
	parts.push(`Title: ${blueprint.title.trim() || '(unknown)'}`);
	parts.push(`Description: ${blueprint.description.trim() || '(empty)'}`);
	if (blueprint.setting.trim()) parts.push(`Setting: ${blueprint.setting.trim()}`);
	parts.push(`Genre: ${blueprint.genre.trim() || '(unknown)'}`);
	parts.push(`Style: ${blueprint.style.trim() || '(unknown)'}`);
	parts.push(`Language: ${languageValue(blueprint)}`);
	// Undecided fields are reported with the value that will actually apply, and
	// flagged as a default so the model does not read them as the author's choice.
	const tense = effectiveTense(blueprint.tense);
	const narrativeTime = effectiveNarrativeTime(blueprint.narrativeTime);
	parts.push(
		`Verb tense: ${label(NARRATIVE_TENSES, tense)}${blueprint.tense === 'unset' ? ' (default)' : ''}`
	);
	parts.push(
		`Narrative time: ${label(NARRATIVE_TIMES, narrativeTime)}${
			blueprint.narrativeTime === 'unset' ? ' (default)' : ''
		}`
	);
	parts.push(`Platform: ${label(AUDIENCES, blueprint.audience)}`);
	parts.push(`Chapter length: ${formatRange(blueprint.wordsPerChapter)} words`);
	if (template) parts.push(`Structure: ${template.nombre}, ${blueprint.chapterCount} chapters`);
	parts.push('--- END NOVEL ---');
	return parts;
}

function buildHeader(context: BlueprintPromptContext, targets: BlueprintField[]): string[] {
	const parts: string[] = [];
	parts.push('You are helping an author set up a new novel.');
	parts.push('Everything you answer must follow from the description and the setting below. Do not invent a different story.');
	parts.push('');
	parts.push(...buildStateBlock(context.blueprint));
	if (context.instructions.trim()) {
		parts.push('');
		parts.push(`Author instructions: ${context.instructions.trim()}`);
	}
	// Fields being asked about are the unknown ones; saying so keeps weaker models
	// from restating what the author already decided.
	parts.push('');
	parts.push(
		`Fields still to decide: ${targets.map((field) => BLUEPRINT_FIELD_LABELS[field]).join(', ')}.`
	);
	return parts;
}

/** Prompt for a single field. The whole answer is the value, so there is nothing to parse. */
export function buildBlueprintFieldPrompt(
	context: BlueprintPromptContext,
	field: BlueprintField,
	/** Value already on screen, when the author asks for a different option. */
	avoid?: string,
): string {
	const parts = buildHeader(context, [field]);
	parts.push('');
	parts.push(`TASK: decide the ${BLUEPRINT_FIELD_LABELS[field].toLowerCase()}.`);
	parts.push(fieldInstruction(field, context));
	if (avoid?.trim()) {
		parts.push(`The author already saw "${avoid.trim()}" and wants a different option. Do not repeat it or a close variant.`);
	}
	parts.push('');
	parts.push(languageRule(context.blueprint));
	parts.push('Output the value only: no field name, no preamble, no explanation, no quotes, no markdown.');
	return parts.join('\n');
}

/** One batch of chapters to outline, with what the model needs to stay in continuity. */
export interface ActOutlineRequest {
	actName: string;
	actPurpose: string;
	/** Position of the act, 0-based, and how many there are in total. */
	actIndex: number;
	totalActs: number;
	/** Names of the chapters to write, in order. */
	chapters: string[];
	/** Recap of the chapters already outlined before this batch. */
	previously: string;
	/** Position of the first chapter of the batch inside its act, 1-based. */
	batchStart: number;
	/** Chapters the act holds in total, which can be more than this batch. */
	actChapters: number;
}

/**
 * Recap of what has been outlined so far, newest first until the budget runs
 * out. Outlines are the only continuity the model gets, and sending all of them
 * for a forty-chapter novel would cost more than the request it feeds.
 */
export function buildPreviouslyBlock(
	chapters: { nombre: string; outline: string }[],
	maxChars = 1800,
): string {
	const written = chapters.filter((chapter) => chapter.outline.trim());
	if (!written.length) return '';
	const kept: string[] = [];
	let total = 0;
	for (let index = written.length - 1; index >= 0; index -= 1) {
		const entry = `${written[index].nombre}: ${written[index].outline.trim()}`;
		if (total + entry.length > maxChars && kept.length) break;
		kept.unshift(entry);
		total += entry.length;
	}
	const skipped = written.length - kept.length;
	return [skipped > 0 ? `(${skipped} earlier chapters omitted)` : '', ...kept]
		.filter(Boolean)
		.join('\n');
}

/**
 * Prompt for one batch of chapters of an act. Batching keeps every answer inside
 * the output limit of the provider, which is what stops a long act from coming
 * back half written, and turns a failure into one lost batch.
 */
export function buildActOutlinePrompt(
	context: BlueprintPromptContext,
	request: ActOutlineRequest,
): string {
	const { blueprint } = context;
	const parts: string[] = [];
	parts.push('You are helping an author outline a novel, chapter by chapter.');
	parts.push('Write only outlines. Never write the prose of the chapter itself.');
	parts.push('');
	parts.push(...buildStateBlock(blueprint));
	if (context.instructions.trim()) {
		parts.push('');
		parts.push(`Author instructions: ${context.instructions.trim()}`);
	}
	if (request.previously.trim()) {
		parts.push('');
		parts.push('--- ALREADY OUTLINED ---');
		parts.push(request.previously.trim());
		parts.push('--- END ALREADY OUTLINED ---');
	}
	parts.push('');
	parts.push(`ACT ${request.actIndex + 1} OF ${request.totalActs}: ${request.actName}`);
	if (request.actPurpose.trim()) parts.push(`Purpose of this act: ${request.actPurpose.trim()}`);
	const batchEnd = request.batchStart + request.chapters.length - 1;
	const partialAct = request.chapters.length < request.actChapters;
	if (partialAct)
		parts.push(
			`This act has ${request.actChapters} chapters. You are writing chapters ${request.batchStart} to ${batchEnd} of it.`
		);
	parts.push('');
	parts.push(`TASK: write the outline of these ${request.chapters.length} chapters, in order.`);
	parts.push('Answer using EXACTLY this layout, each header alone on its own line:');
	parts.push('');
	request.chapters.forEach((chapter) => {
		parts.push(`[[${chapter}]]`);
		parts.push('(outline here)');
	});
	parts.push('');
	parts.push('Rules:');
	parts.push('- Copy every header exactly as written above, including the double brackets.');
	parts.push('- One single paragraph per chapter, between 80 and 120 words.');
	parts.push('- Continuous prose: no bullets, no lists, no headings, no markdown, no dialogue.');
	parts.push('- Tell what happens, in order, and how it changes the characters or the plot.');
	parts.push('- Keep continuity with the chapters already outlined; do not repeat them.');
	if (request.actIndex < request.totalActs - 1)
		parts.push('- Do not resolve the central conflict yet: later acts still have to happen.');
	else if (batchEnd >= request.actChapters)
		parts.push('- This is the end of the last act: bring the story to its ending.');
	if (partialAct && batchEnd < request.actChapters)
		parts.push('- More chapters of this act follow: do not close the act in this batch.');
	parts.push('- Write nothing before the first header and add no sections of your own.');
	parts.push(`- Answer all ${request.chapters.length} chapters. Keep each one short enough to fit them all.`);
	parts.push(`- ${languageRule(blueprint)}`);
	return parts.join('\n');
}

/**
 * Prompt for every missing field in one call, answered as `[[Header]]` sections.
 * Missing or malformed sections are skipped by the parser, so a sloppy answer
 * still yields usable proposals.
 */
export function buildBlueprintDeducePrompt(
	context: BlueprintPromptContext,
	targets: BlueprintField[],
): string {
	const parts = buildHeader(context, targets);
	parts.push('');
	parts.push('TASK: decide the fields listed above.');
	parts.push('Answer using EXACTLY this layout, each header alone on its own line:');
	parts.push('');
	targets.forEach((field) => {
		parts.push(sectionHeader(field));
		parts.push('(value here)');
	});
	parts.push('');
	parts.push('Rules:');
	parts.push('- Copy every header exactly as written above, including the double brackets.');
	parts.push('- Write the value on the line below its header.');
	parts.push('- Write nothing before the first header and add no sections of your own.');
	parts.push('- Do not use JSON, code fences or markdown headings.');
	parts.push('');
	parts.push(languageRule(context.blueprint));
	parts.push('');
	parts.push('Field guide:');
	targets.forEach((field) =>
		parts.push(
			`- ${BLUEPRINT_FIELD_LABELS[field]}: ${fieldInstruction(field, context).replace(/\n/g, ' ')}`
		)
	);
	return parts.join('\n');
}
