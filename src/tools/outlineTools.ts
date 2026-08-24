import type { ToolContext } from '../interfaces/tool-context';
import { resolveChapter } from './chapterTools';

/**
 * Outline tools. An outline belongs to a chapter (`Capitulo.outline`), so creating
 * one for a chapter that does not exist is done through `create_chapter` instead.
 */

export async function readOutline(args: Record<string, string>, context: ToolContext): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	if (!chapter.outline?.trim()) return `Chapter "${chapter.nombre}" has no outline yet.`;
	return `Outline of "${chapter.nombre}":\n\n${chapter.outline.trim()}`;
}

export async function writeOutline(args: Record<string, string>, context: ToolContext): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const content = args.content ?? '';
	if (!content.trim()) throw new Error('Argument "content" is required.');
	const append = (args.mode ?? 'replace').trim().toLowerCase() === 'append';
	const current = chapter.outline?.trim() ?? '';
	const next = append && current ? `${current}\n\n${content.trim()}` : content.trim();
	await context.updateChapter(chapter.id_capitulo, { outline: next });
	return `${append ? 'Appended to' : 'Replaced'} the outline of "${chapter.nombre}".`;
}
