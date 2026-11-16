import type {
	AudienceId,
	BlueprintField,
	NarrativeTense,
	NarrativeTimeId,
	NovelBlueprint,
} from '../domain';
import type { BlueprintToolContext } from '../interfaces/tool-context';

/**
 * The Novel Setup (blueprint): premise, style and the plan of the novel. The
 * model reads it whenever it needs, whatever the Story bible toggle of the
 * chat says, and can change it with the author's approval.
 */

export const TENSES: NarrativeTense[] = ['past', 'present', 'future'];
export const NARRATIVE_TIMES: NarrativeTimeId[] = [
	'linear', 'in-media-res', 'flashback', 'flashforward', 'nonlinear', 'frame',
];
export const AUDIENCES: AudienceId[] = ['web-novel', 'royal-road', 'wattpad', 'traditional'];

function field(label: string, value: string | undefined): string | null {
	return value?.trim() ? `${label}: ${value.trim()}` : null;
}

function choice(label: string, value: string, fallback: string): string {
	return value === 'unset' || value === 'undefined'
		? `${label}: not set (defaults to ${fallback})`
		: `${label}: ${value}`;
}

function describeBlueprint(blueprint: NovelBlueprint): string {
	const words = blueprint.wordsPerChapter;
	const lines = [
		field('Title', blueprint.title),
		field('Genre', blueprint.genre),
		field('Style', blueprint.style),
		field('Setting', blueprint.setting),
		field('Language', blueprint.language) ?? 'Language: same as the manuscript',
		choice('Tense', blueprint.tense, 'past'),
		choice('Narrative time', blueprint.narrativeTime, 'linear'),
		choice('Audience', blueprint.audience, 'none'),
		words ? `Words per chapter: ${words.min}-${words.max}` : null,
		`Structure: ${blueprint.structure}, ${blueprint.chapterCount} chapters planned`,
		field('Premise', blueprint.description),
		field('Structure plan', blueprint.structureMarkdown),
	];
	return lines.filter((line): line is string => Boolean(line)).join('\n');
}

export async function readBlueprintTool(
	_args: Record<string, string>,
	context: BlueprintToolContext,
): Promise<string> {
	const blueprint = await context.readBlueprint();
	if (!blueprint) return 'This novel has no Novel Setup (blueprint) yet.';
	return describeBlueprint(blueprint);
}

/** Text arguments and the blueprint field each one writes. */
const TEXT_FIELDS: Array<[string, 'title' | 'genre' | 'style' | 'setting' | 'language' | 'description']> = [
	['title', 'title'],
	['genre', 'genre'],
	['style', 'style'],
	['setting', 'setting'],
	['language', 'language'],
	['premise', 'description'],
];

function pick<T extends string>(name: string, value: string, allowed: readonly T[]): T {
	const clean = value.trim().toLowerCase() as T;
	if (!allowed.includes(clean)) {
		throw new Error(`Argument "${name}" must be one of: ${allowed.join(', ')}.`);
	}
	return clean;
}

function parseWordRange(value: string): NovelBlueprint['wordsPerChapter'] {
	const numbers = value.match(/\d+/g)?.map(Number) ?? [];
	if (numbers.length !== 2 || numbers[0] <= 0 || numbers[0] > numbers[1]) {
		throw new Error('Argument "words_per_chapter" must be a range like 2000-4000.');
	}
	return { min: numbers[0], max: numbers[1] };
}

/** Builds the patch from the arguments given; the others stay as they are. */
function blueprintPatch(args: Record<string, string>): {
	patch: Partial<NovelBlueprint>;
	inferred: BlueprintField[];
} {
	const patch: Partial<NovelBlueprint> = {};
	const given = (name: string) => (args[name] ?? '').trim();
	for (const [name, key] of TEXT_FIELDS) {
		if (given(name)) patch[key] = given(name);
	}
	if (given('tense')) patch.tense = pick('tense', given('tense'), TENSES);
	if (given('narrative_time')) {
		patch.narrativeTime = pick('narrative_time', given('narrative_time'), NARRATIVE_TIMES);
	}
	if (given('audience')) patch.audience = pick('audience', given('audience'), AUDIENCES);
	if (given('words_per_chapter')) {
		patch.wordsPerChapter = parseWordRange(given('words_per_chapter'));
	}
	if (given('structure_plan')) {
		patch.structureMarkdown = given('structure_plan');
		// Written by hand from now on: rebuilding it from the template asks first.
		patch.structureEdited = true;
	}
	// Fields the setup badges as deduced, so the author sees they were not their choice.
	const deducible: BlueprintField[] = ['title', 'genre', 'style', 'narrativeTime', 'wordsPerChapter'];
	const inferred = deducible.filter((key) => key in patch);
	return { patch, inferred };
}

export async function updateBlueprintTool(
	args: Record<string, string>,
	context: BlueprintToolContext,
): Promise<string> {
	const { patch, inferred } = blueprintPatch(args);
	const changed = Object.keys(patch).filter((key) => key !== 'structureEdited');
	if (!changed.length) {
		throw new Error('Give at least one field to change. Use read_blueprint to see the current values.');
	}
	const current = await context.readBlueprint();
	const marks = new Set([...(current?.inferred ?? []), ...inferred]);
	await context.updateBlueprint({ ...patch, inferred: [...marks] });
	return `Updated the Novel Setup: ${changed.join(', ')}.`;
}
