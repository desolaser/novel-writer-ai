import type { AudienceId, NarrativeTimeId, NarrativeTense, WordRange } from '../domain/entities/NovelBlueprint';
import { DEFAULT_WORD_RANGE } from '../domain/entities/NovelBlueprint';

/** One act of a narrative structure. */
export interface StructureAct {
	/** Name of the act, without the "Act N" prefix. */
	nombre: string;
	/** What the act is for. Sent to the AI, never stored on the Acto entity. */
	purpose: string;
	/** Share of the chapters this act takes. Relative to the other acts. */
	weight: number;
}

/** A narrative structure the author can pick for a novel. */
export interface StructureTemplate {
	id: string;
	nombre: string;
	description: string;
	acts: StructureAct[];
}

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
	{
		id: 'three-act',
		nombre: 'Three acts',
		description: 'Setup, confrontation and resolution. The default choice for most novels.',
		acts: [
			{ nombre: 'Setup', purpose: 'Ordinary world, main characters, inciting incident and the decision that locks the protagonist into the story.', weight: 25 },
			{ nombre: 'Confrontation', purpose: 'Rising obstacles, allies and enemies, a midpoint that changes the stakes, and the lowest point of the protagonist.', weight: 50 },
			{ nombre: 'Resolution', purpose: 'Final push, climax and the new equilibrium the story leaves behind.', weight: 25 },
		],
	},
	{
		id: 'four-act',
		nombre: 'Four acts (kishotenketsu)',
		description: 'Introduction, development, twist and conclusion. Works well without an antagonist-driven conflict.',
		acts: [
			{ nombre: 'Ki - Introduction', purpose: 'Introduce the characters, the world and the situation, without conflict yet.', weight: 25 },
			{ nombre: 'Sho - Development', purpose: 'Deepen the situation and the relationships, following the thread laid out in the introduction.', weight: 30 },
			{ nombre: 'Ten - Twist', purpose: 'An unexpected element recontextualizes everything shown so far.', weight: 25 },
			{ nombre: 'Ketsu - Conclusion', purpose: 'Reconcile the twist with the previous acts and close the story.', weight: 20 },
		],
	},
	{
		id: 'five-act',
		nombre: 'Five acts (Freytag)',
		description: 'Exposition, rising action, climax, falling action and denouement. Classic dramatic shape.',
		acts: [
			{ nombre: 'Exposition', purpose: 'Establish the world, the characters and the conflict about to break out.', weight: 20 },
			{ nombre: 'Rising action', purpose: 'Complications pile up and the stakes keep growing.', weight: 25 },
			{ nombre: 'Climax', purpose: 'The turning point of the story, where the conflict peaks.', weight: 20 },
			{ nombre: 'Falling action', purpose: 'Consequences of the climax and the unraveling of the remaining threads.', weight: 20 },
			{ nombre: 'Denouement', purpose: 'Final resolution and the state the characters are left in.', weight: 15 },
		],
	},
	{
		id: 'seven-point',
		nombre: 'Seven-point structure',
		description: 'Hook, turns, pinches and midpoint. Tight plotting, good for thriller and mystery.',
		acts: [
			{ nombre: 'Hook', purpose: 'Starting state of the protagonist, opposite to where they will end up.', weight: 12 },
			{ nombre: 'Plot turn 1', purpose: 'The event that pushes the protagonist out of their ordinary world.', weight: 14 },
			{ nombre: 'Pinch 1', purpose: 'Pressure from the antagonistic force; the protagonist loses ground.', weight: 14 },
			{ nombre: 'Midpoint', purpose: 'The protagonist stops reacting and starts acting.', weight: 16 },
			{ nombre: 'Pinch 2', purpose: 'Heaviest blow: everything seems lost and help disappears.', weight: 14 },
			{ nombre: 'Plot turn 2', purpose: 'The protagonist gets the final piece needed to resolve the conflict.', weight: 16 },
			{ nombre: 'Resolution', purpose: 'Climax and closing state, mirroring the hook.', weight: 14 },
		],
	},
	{
		id: 'hero-journey',
		nombre: 'Hero journey',
		description: 'Twelve stages of the monomyth. Needs at least twelve chapters.',
		acts: [
			{ nombre: 'Ordinary world', purpose: 'The hero before the adventure, and what is missing in their life.', weight: 8 },
			{ nombre: 'Call to adventure', purpose: 'The problem or invitation that breaks the routine.', weight: 7 },
			{ nombre: 'Refusal of the call', purpose: 'Fear and reasons to stay behind.', weight: 6 },
			{ nombre: 'Meeting the mentor', purpose: 'Guidance, training or the tool that makes the journey possible.', weight: 7 },
			{ nombre: 'Crossing the threshold', purpose: 'The hero commits and enters the unknown world.', weight: 8 },
			{ nombre: 'Tests, allies and enemies', purpose: 'Learning the rules of the new world through trials.', weight: 12 },
			{ nombre: 'Approach to the inmost cave', purpose: 'Preparation for the greatest ordeal.', weight: 8 },
			{ nombre: 'The ordeal', purpose: 'Central crisis, where the hero faces their greatest fear.', weight: 10 },
			{ nombre: 'The reward', purpose: 'What the hero gains from surviving the ordeal.', weight: 8 },
			{ nombre: 'The road back', purpose: 'Consequences of the reward and the pursuit that follows.', weight: 8 },
			{ nombre: 'Resurrection', purpose: 'Final test where the hero proves who they have become.', weight: 10 },
			{ nombre: 'Return with the elixir', purpose: 'The hero comes home changed, bringing something back.', weight: 8 },
		],
	},
	{
		id: 'flat',
		nombre: 'No acts',
		description: 'A single continuous run of chapters, with no act divisions.',
		acts: [{ nombre: 'Chapters', purpose: 'Continuous progression of the story.', weight: 100 }],
	},
];

export function getStructureTemplate(id: string): StructureTemplate | undefined {
	return STRUCTURE_TEMPLATES.find((template) => template.id === id);
}

/**
 * Options offered for narrative time. `unset` is first so an untouched blueprint
 * reads as undecided instead of as a choice the author never made; it resolves
 * to linear wherever a real value is needed.
 */
export const NARRATIVE_TIMES: { id: NarrativeTimeId; label: string }[] = [
	{ id: 'unset', label: 'Not selected' },
	{ id: 'linear', label: 'Linear' },
	{ id: 'in-media-res', label: 'In media res' },
	{ id: 'flashback', label: 'Flashback' },
	{ id: 'flashforward', label: 'Flashforward' },
	{ id: 'nonlinear', label: 'Non-linear' },
	{ id: 'frame', label: 'Frame story' },
];

/** Options offered for verb tense. `unset` resolves to past, the standard. */
export const NARRATIVE_TENSES: { id: NarrativeTense; label: string }[] = [
	{ id: 'unset', label: 'Not selected' },
	{ id: 'past', label: 'Past' },
	{ id: 'present', label: 'Present' },
	{ id: 'future', label: 'Future' },
];

/**
 * Suggestions for the language field. It is a free-text field, not a closed
 * list: the story can be written in any language, including one that is not
 * here, so these only save typing.
 */
export const COMMON_LANGUAGES: string[] = [
	'English',
	'Español',
	'Português',
	'Français',
	'Italiano',
	'Deutsch',
	'Català',
	'Galego',
	'Euskara',
	'Русский',
	'日本語',
	'中文',
	'한국어',
];

/** Options offered for the target platform. */
export const AUDIENCES: { id: AudienceId; label: string }[] = [
	{ id: 'undefined', label: 'Not defined' },
	{ id: 'web-novel', label: 'Web novel' },
	{ id: 'royal-road', label: 'Royal Road' },
	{ id: 'wattpad', label: 'Wattpad' },
	{ id: 'traditional', label: 'Traditional publishing' },
];

/**
 * Chapter length per platform. Serialized readers expect shorter chapters than
 * print, so the platform wins over the genre whenever the author picked one.
 * These are editable defaults, not hard rules.
 */
export const AUDIENCE_PACING: Record<AudienceId, WordRange | null> = {
	'undefined': null,
	'web-novel': { min: 1500, max: 3000 },
	'royal-road': { min: 2000, max: 4000 },
	'wattpad': { min: 1000, max: 2000 },
	'traditional': { min: 3000, max: 5000 },
};

/** Chapter length per genre, used only when no platform was picked. */
export const GENRE_PACING: { keywords: string[]; range: WordRange }[] = [
	{ keywords: ['high fantasy', 'alta fantasia', 'epic fantasy', 'fantasia epica'], range: { min: 4000, max: 8000 } },
	{ keywords: ['fantasy', 'fantasia'], range: { min: 4000, max: 8000 } },
	{ keywords: ['drama', 'literary', 'literaria', 'real maravilloso', 'magical realism', 'realismo magico'], range: { min: 4000, max: 8000 } },
];

/** Where a suggested chapter length came from. */
export type PacingSource = 'audience' | 'genre' | 'fallback';

export interface PacingSuggestion {
	range: WordRange;
	source: PacingSource;
}

function normalize(value: string): string {
	return (value || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.trim();
}

/**
 * Suggests the target chapter length. Platform first, then genre. A `fallback`
 * source means neither matched, which is the case where asking the model for an
 * estimate is worth it.
 */
export function suggestChapterLength(audience: AudienceId, genre: string): PacingSuggestion {
	const byAudience = AUDIENCE_PACING[audience];
	if (byAudience) return { range: { ...byAudience }, source: 'audience' };
	const needle = normalize(genre);
	if (needle) {
		const match = GENRE_PACING.find((rule) => rule.keywords.some((keyword) => needle.includes(keyword)));
		if (match) return { range: { ...match.range }, source: 'genre' };
	}
	return { range: { ...DEFAULT_WORD_RANGE }, source: 'fallback' };
}
