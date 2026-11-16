import type { NovelBlueprint } from '../domain';
import type {
	BlueprintToolContext,
	ChapterToolContext,
} from '../interfaces/tool-context';
import { countWords, orderedChapters } from './chapterTools';
import { orderedActs } from './structureTools';

/**
 * Whole-novel tools: the blueprint (story bible) and a progress report. Both
 * read only, so the model can check them whenever it needs, whatever the
 * Story bible toggle of the chat says.
 */

type NovelContext = ChapterToolContext & BlueprintToolContext;

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

function chapterLabel(number: number, name: string): string {
	return `#${number} ${name}`;
}

/** Progress report: word counts against the target, and what is still missing. */
export async function novelStatus(
	_args: Record<string, string>,
	context: NovelContext,
): Promise<string> {
	const chapters = orderedChapters(context);
	const acts = orderedActs(context);
	if (!chapters.length) return 'The novel has no chapters yet.';

	const target = (await context.readBlueprint())?.wordsPerChapter ?? null;
	const noOutline: string[] = [];
	const noText: string[] = [];
	const short: string[] = [];
	const long: string[] = [];
	let total = 0;

	for (const [index, chapter] of chapters.entries()) {
		const label = chapterLabel(index + 1, chapter.nombre);
		const words = countWords(await context.readChapterText(chapter.id_capitulo));
		total += words;
		if (!chapter.outline?.trim()) noOutline.push(label);
		if (!words) {
			noText.push(label);
			continue;
		}
		if (target && words < target.min) short.push(`${label} (${words})`);
		if (target && words > target.max) long.push(`${label} (${words})`);
	}

	const noSummary = acts.filter((act) => !act.resumen?.trim()).map((act) => act.nombre);
	const list = (items: string[]) => items.join(', ') || 'none';
	const lines = [
		`${chapters.length} chapters in ${acts.length} acts, ${total} words in total.`,
		target ? `Target per chapter: ${target.min}-${target.max} words.` : 'No target length set.',
		`Chapters without text: ${list(noText)}`,
		`Chapters without outline: ${list(noOutline)}`,
		`Acts without summary: ${list(noSummary)}`,
	];
	if (target) {
		lines.push(`Under target: ${list(short)}`);
		lines.push(`Over target: ${list(long)}`);
	}
	return lines.join('\n');
}
