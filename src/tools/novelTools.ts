import type {
	BlueprintToolContext,
	ChapterToolContext,
} from '../interfaces/tool-context';
import { countWords, orderedChapters } from './chapterTools';
import { orderedActs } from './structureTools';

/**
 * Progress report of the whole novel. Read only, so the model can check it
 * whenever it needs. The blueprint tools are in `blueprintTools.ts`.
 */

type NovelContext = ChapterToolContext & BlueprintToolContext;

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
