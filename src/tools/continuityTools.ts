import type {
	ChapterToolContext,
	ContinuityToolContext,
} from '../interfaces/tool-context';
import type { ContinuityIssue } from '../types/Continuity';
import { countWords, orderedChapters, resolveChapter } from './chapterTools';

/**
 * Continuity check as a chat tool. The check runs with the utilities model
 * against the facts ledger, so the chat doesn't have to read every earlier
 * chapter into its own context: it gets the issues back.
 */

type Context = ChapterToolContext & ContinuityToolContext;

function sourceOf(issue: ContinuityIssue, context: Context): string {
	if (!issue.fact_chapter_id) return '';
	const chapters = orderedChapters(context);
	const index = chapters.findIndex((item) => item.id_capitulo === issue.fact_chapter_id);
	return index < 0 ? '' : ` (#${index + 1} ${chapters[index].nombre})`;
}

function describeIssue(issue: ContinuityIssue, index: number, context: Context): string {
	const lines = [`${index + 1}. ${issue.title}`, `   Quote: "${issue.quote}"`];
	if (issue.fact) lines.push(`   Contradicts: ${issue.fact}${sourceOf(issue, context)}`);
	if (issue.explanation) lines.push(`   Why: ${issue.explanation}`);
	return lines.join('\n');
}

export async function checkContinuityTool(
	args: Record<string, string>,
	context: Context,
): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	if (!countWords(await context.readChapterText(chapter.id_capitulo))) {
		throw new Error(`"${chapter.nombre}" has no text to check.`);
	}
	const { report, skipped } = await context.checkContinuity(chapter.id_capitulo);
	const head = `Checked "${chapter.nombre}" against ${report.facts_checked} facts `
		+ 'from earlier chapters and the codex.';
	const notes: string[] = [];
	if (skipped.length) {
		notes.push(`The facts of ${skipped.join(', ')} could not be read this time.`);
	}
	notes.push('The report is saved: the author opens it with "Check continuity..." '
		+ 'in the chapter menu, where each issue links to its passage.');
	if (!report.issues.length) {
		return [head, 'No contradictions found.', ...notes].join('\n');
	}
	const issues = report.issues.map((issue, index) =>
		describeIssue(issue, index, context));
	return [
		head,
		`${report.issues.length} possible contradiction(s):`,
		...issues,
		...notes,
	].join('\n');
}
