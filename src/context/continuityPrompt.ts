import type { Capitulo, EntityId, NovelBlueprint } from '../domain';
import type { ContinuityIssue } from '../types/Continuity';
import { genId } from '../utils/ids';
import { MAX_FACTS_PER_CHAPTER } from '../utils/storyFacts';
import { summaryLanguageRule } from './blueprintPrompt';

/**
 * Prompts of the continuity check and the parsing of their answers. Both ask
 * for JSON and tolerate chatter or a code fence around it.
 */

/** The JSON array in a model's answer. */
function extractArray(answer: string, what: string): unknown[] {
	const start = answer.indexOf('[');
	const end = answer.lastIndexOf(']');
	if (start < 0 || end <= start) {
		throw new Error(`The AI did not return a list of ${what}.`);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(answer.slice(start, end + 1));
	} catch {
		throw new Error(`The AI returned a list of ${what} that could not be read.`);
	}
	if (!Array.isArray(parsed)) {
		throw new Error(`The AI did not return a list of ${what}.`);
	}
	return parsed;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** Asks for the facts a chapter establishes, as a JSON array of strings. */
export function buildExtractFactsPrompt(
	chapter: Capitulo,
	manuscript: string,
	blueprint: NovelBlueprint | null,
): string {
	return [
		'You are keeping a continuity record of a novel.',
		'',
		`Chapter title: ${chapter.nombre}`,
		'--- CHAPTER TEXT ---',
		manuscript,
		'--- END CHAPTER TEXT ---',
		'',
		'TASK: list the facts this chapter establishes that later chapters '
			+ 'must respect.',
		'',
		'Rules:',
		'- Concrete and checkable: physical traits, injuries and deaths, who '
			+ 'knows or learns what, relationships, promises and debts, '
			+ 'possessions, where people are, travel times, dates and durations, '
			+ 'rules of the world.',
		'- One short sentence each, naming who or what: "Elena has green eyes", '
			+ 'not "she has green eyes".',
		'- Only what the text states or shows. No interpretation, no themes, '
			+ 'no plot summary.',
		`- At most ${MAX_FACTS_PER_CHAPTER}, the ones most likely to matter later.`,
		'- Return only a JSON array of strings, without any comment or '
			+ 'Markdown fence.',
		`- ${summaryLanguageRule(blueprint, 'the facts', 'the chapter text')}`,
	].join('\n');
}

export function parseFactsResponse(answer: string): string[] {
	return extractArray(answer, 'facts')
		.map(text)
		.filter(Boolean)
		.slice(0, MAX_FACTS_PER_CHAPTER);
}

export interface ContinuityPromptInput {
	chapter: Capitulo;
	/** Its place in the novel, as earlier chapters are numbered. */
	chapterNumber: number;
	manuscript: string;
	/** `chapterInfoPromptLine`, or "". */
	chapterInfo: string;
	/** `earlierFactsBlock(...).text`, or "" for the first chapter. */
	earlierFacts: string;
	/** Codex entries the chapter mentions (`buildCodexYaml`), or "". */
	codex: string;
	storyBible: string;
	blueprint: NovelBlueprint | null;
}

/** Asks for the passages of a chapter that contradict what came before. */
export function buildContinuityPrompt(input: ContinuityPromptInput): string {
	const parts: string[] = [
		'You are a continuity editor checking one chapter of a novel against '
			+ 'what the story established before it.',
		'',
	];
	if (input.storyBible) parts.push(input.storyBible, '');
	if (input.codex) {
		parts.push('--- CODEX (reference entries) ---', input.codex,
			'--- END CODEX ---', '');
	}
	parts.push('--- FACTS FROM EARLIER CHAPTERS ---',
		input.earlierFacts || '(none: this is the first chapter with facts)',
		'--- END FACTS ---', '');
	parts.push(`--- CHAPTER ${input.chapterNumber}: ${input.chapter.nombre} ---`);
	if (input.chapterInfo) parts.push(input.chapterInfo);
	parts.push(input.manuscript, '--- END CHAPTER ---', '');
	parts.push(
		`TASK: find passages of chapter ${input.chapterNumber} that contradict `
			+ 'the earlier facts or the codex.',
		'',
		'Rules:',
		'- Only real contradictions: a trait that changed, someone dead who '
			+ 'acts, a character who knows something they have not learned yet, '
			+ 'an impossible time or distance, a broken rule of the world.',
		'- Not style, not plot holes in general, not things the chapter simply '
			+ 'adds. A change the text explains (healing, a lie, a disguise, '
			+ 'time passing) is not a contradiction.',
		'- "quote": copy 5 to 20 words exactly as they are in the chapter.',
		'- "fact": the earlier fact or codex detail it contradicts. "chapter": '
			+ 'the number of the chapter that fact is from, or 0 for the codex.',
		'- "title": a few words. "explanation": one or two sentences.',
		'- If there are none, return [].',
		'- Return only a JSON array, without any comment or Markdown fence:',
		'[{"title": "", "quote": "", "fact": "", "chapter": 0, '
			+ '"explanation": ""}]',
		`- ${summaryLanguageRule(
			input.blueprint, 'the titles and explanations', 'the chapter',
		)}`,
	);
	return parts.join('\n');
}

/**
 * Issues from the model's answer. A chapter number it doesn't know (or 0)
 * leaves the fact without a chapter; an issue without a title or a quote is
 * dropped.
 */
export function parseIssuesResponse(
	answer: string,
	chapterByNumber: Map<number, EntityId>,
): ContinuityIssue[] {
	return extractArray(answer, 'issues')
		.filter((item): item is Record<string, unknown> =>
			Boolean(item) && typeof item === 'object')
		.map((item) => {
			const number = Number(item.chapter);
			return {
				id: genId(),
				title: text(item.title),
				quote: text(item.quote),
				explanation: text(item.explanation),
				fact: text(item.fact),
				fact_chapter_id: chapterByNumber.get(number) ?? null,
			};
		})
		.filter((issue) => issue.title && issue.quote);
}
