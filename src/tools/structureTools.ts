import type { Acto, Capitulo } from '../domain';
import type { ChapterToolContext as ToolContext } from '../interfaces/tool-context';
import { resolveByName } from '../utils/toolCallParsing';
import { orderedChapters, resolveChapter } from './chapterTools';

/**
 * Structure tools: acts (name and summary) and where each chapter sits. The act
 * summary matters beyond the act itself: it is what later prompts receive in
 * place of the outlines of chapters that are far behind.
 */

export function orderedActs(context: ToolContext): Acto[] {
	return [...context.listActs()].sort((first, second) => first.orden - second.orden);
}

/** Resolves an act by name, partial name or "#2". */
export function resolveAct(reference: string, context: ToolContext): Acto {
	const acts = orderedActs(context);
	const act = resolveByName(reference, acts, (item) => item.nombre, (item) => item.id_acto);
	if (!act) {
		const known = acts.map((item, index) => `#${index + 1} ${item.nombre}`).join(', ');
		throw new Error(`No act matches "${reference}". Available: ${known || '(none)'}.`);
	}
	return act;
}

function chaptersOfAct(actId: string, context: ToolContext): Capitulo[] {
	return context.listChapters()
		.filter((chapter) => chapter.id_acto === actId)
		.sort((first, second) => first.orden - second.orden);
}

function isAppend(args: Record<string, string>): boolean {
	return (args.mode ?? 'replace').trim().toLowerCase() === 'append';
}

export async function readAct(args: Record<string, string>, context: ToolContext): Promise<string> {
	const act = resolveAct(args.act ?? '', context);
	const position = orderedActs(context).indexOf(act) + 1;
	const reading = orderedChapters(context);
	const chapters = chaptersOfAct(act.id_acto, context).map((chapter) => {
		const number = reading.findIndex((item) => item.id_capitulo === chapter.id_capitulo) + 1;
		const outline = chapter.outline?.trim() ? 'outline: yes' : 'outline: no';
		return `  #${number} ${chapter.nombre} | ${outline}`;
	});
	const summary = act.resumen?.trim() || '(no summary yet)';
	return [
		`Act #${position} "${act.nombre}"`,
		`Summary: ${summary}`,
		chapters.length ? 'Chapters:' : 'Chapters: none',
		...chapters,
	].join('\n');
}

export async function createActTool(args: Record<string, string>, context: ToolContext): Promise<string> {
	const name = (args.name ?? '').trim();
	if (!name) throw new Error('Argument "name" is required.');
	const exists = context.listActs().some((act) => act.nombre.trim().toLowerCase() === name.toLowerCase());
	if (exists) throw new Error(`An act named "${name}" already exists.`);
	const act = await context.createAct(name);
	if (!act) throw new Error('The act could not be created.');
	const summary = args.summary?.trim() ?? '';
	if (summary) await context.updateAct(act.id_acto, { resumen: summary });
	return `Created act "${name}"${summary ? ' with its summary' : ''}.`;
}

export async function updateActTool(args: Record<string, string>, context: ToolContext): Promise<string> {
	const act = resolveAct(args.act ?? '', context);
	const name = args.name?.trim() ?? '';
	const summary = args.summary?.trim() ?? '';
	if (!name && !summary) throw new Error('Nothing to update: pass name and/or summary.');

	const patch: Partial<Acto> = {};
	const changed: string[] = [];
	if (name) {
		patch.nombre = name;
		changed.push(`renamed it to "${name}"`);
	}
	if (summary) {
		const current = act.resumen?.trim() ?? '';
		const append = isAppend(args);
		patch.resumen = append && current ? `${current}\n\n${summary}` : summary;
		changed.push(append ? 'extended its summary' : 'replaced its summary');
	}
	await context.updateAct(act.id_acto, patch);
	return `Act "${act.nombre}": ${changed.join(' and ')}.`;
}

export async function renameChapter(args: Record<string, string>, context: ToolContext): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const name = (args.name ?? '').trim();
	if (!name) throw new Error('Argument "name" is required.');
	if (name === chapter.nombre) return `Chapter is already named "${name}".`;
	await context.updateChapter(chapter.id_capitulo, { nombre: name });
	return `Renamed chapter "${chapter.nombre}" to "${name}". Its manuscript file follows the new name.`;
}

/** Writes `orden` (and the act) of every chapter whose place changed. */
async function renumber(chapters: Capitulo[], actId: string, context: ToolContext): Promise<void> {
	for (const [orden, chapter] of chapters.entries()) {
		if (chapter.orden === orden && chapter.id_acto === actId) continue;
		await context.updateChapter(chapter.id_capitulo, { orden, id_acto: actId });
	}
}

/** Moves a chapter to a position inside its act or inside another act. */
export async function moveChapter(args: Record<string, string>, context: ToolContext): Promise<string> {
	const chapter = resolveChapter(args.chapter ?? '', context);
	const source = resolveAct(chapter.id_acto, context);
	const target = args.act?.trim() ? resolveAct(args.act, context) : source;

	const others = chaptersOfAct(target.id_acto, context)
		.filter((item) => item.id_capitulo !== chapter.id_capitulo);
	const requested = args.position?.trim() ? Number(args.position.trim().replace(/^#/, '')) : NaN;
	if (args.position?.trim() && (!Number.isInteger(requested) || requested < 1)) {
		throw new Error('Argument "position" must be a number starting at 1.');
	}
	const index = Number.isNaN(requested) ? others.length : Math.min(requested - 1, others.length);
	const reordered = [...others.slice(0, index), chapter, ...others.slice(index)];

	await renumber(reordered, target.id_acto, context);
	if (target.id_acto !== source.id_acto) {
		const left = chaptersOfAct(source.id_acto, context)
			.filter((item) => item.id_capitulo !== chapter.id_capitulo);
		await renumber(left, source.id_acto, context);
	}

	const place = `position ${index + 1} of act "${target.nombre}"`;
	return `Moved chapter "${chapter.nombre}" to ${place}.`;
}
