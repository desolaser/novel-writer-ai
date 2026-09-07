import type { StructureTemplate } from '../constants/structures';

/**
 * Markdown round-trip of a novel structure. Pure: no Obsidian, no React, no I/O.
 *
 * The author edits the structure as Markdown, so the same text has to be both
 * readable and parseable back into acts and chapters:
 *
 *   ## Act 1 - Setup
 *   Purpose of the act.
 *
 *   ### Chapter 1
 *   Outline of the chapter.
 *
 * Heading text is taken verbatim as the name of the act or chapter, so anything
 * the author types round-trips without surprises.
 */

export interface BlueprintChapter {
	nombre: string;
	outline: string;
}

export interface BlueprintAct {
	nombre: string;
	/** What the act is for. Lives only here: the Acto entity has no such field. */
	purpose: string;
	capitulos: BlueprintChapter[];
}

/** Smallest chapter count a template can be laid out with: one per act. */
export function minChaptersFor(template: StructureTemplate): number {
	return template.acts.length;
}

export function countChapters(acts: BlueprintAct[]): number {
	return acts.reduce((total, act) => total + act.capitulos.length, 0);
}

/**
 * Splits `total` chapters across acts following their weights, giving every act
 * at least one chapter. Leftovers go to the acts with the largest remainder, so
 * the totals always add up exactly.
 */
export function distributeChapters(weights: number[], total: number): number[] {
	const count = weights.length;
	if (count === 0 || total <= 0) return weights.map(() => 0);
	// Not enough chapters for one per act: fill the first acts and leave the rest empty.
	if (total <= count) return weights.map((_, index) => (index < total ? 1 : 0));

	const rest = total - count;
	const sum = weights.reduce((acc, weight) => acc + Math.max(0, weight), 0) || count;
	const exact = weights.map((weight) => (Math.max(0, weight) / sum) * rest);
	const result = exact.map((value) => 1 + Math.floor(value));
	let remaining = total - result.reduce((acc, value) => acc + value, 0);
	const byRemainder = exact
		.map((value, index) => ({ index, remainder: value - Math.floor(value) }))
		.sort((a, b) => b.remainder - a.remainder);
	let cursor = 0;
	while (remaining > 0 && byRemainder.length > 0) {
		result[byRemainder[cursor % byRemainder.length].index] += 1;
		cursor++;
		remaining--;
	}
	return result;
}

/** Default name of the chapter at a given position. Numbering is novel-wide. */
export function defaultChapterName(index: number): string {
	return `Chapter ${index + 1}`;
}

/** Default name of an act: its position plus the name coming from the template. */
export function actHeading(index: number, nombre: string): string {
	return `Act ${index + 1} - ${nombre}`;
}

/**
 * Lays out a structure from a template. Existing chapters are carried over by
 * position, so changing the chapter count or the structure never throws away
 * titles or outlines the author already has.
 */
export function buildStructureFromTemplate(
	template: StructureTemplate,
	chapterCount: number,
	previous: BlueprintAct[] = [],
): BlueprintAct[] {
	const carried = previous.flatMap((act) => act.capitulos);
	const sizes = distributeChapters(template.acts.map((act) => act.weight), chapterCount);
	let cursor = 0;
	return template.acts
		.map((act, index) => {
			const capitulos: BlueprintChapter[] = [];
			for (let i = 0; i < sizes[index]; i++) {
				const existing = carried[cursor];
				capitulos.push({
					nombre: existing?.nombre?.trim() || defaultChapterName(cursor),
					outline: existing?.outline ?? '',
				});
				cursor++;
			}
			return {
				nombre: actHeading(index, act.nombre),
				purpose: act.purpose,
				capitulos,
			};
		})
		.filter((act) => act.capitulos.length > 0);
}

export function renderStructureMarkdown(acts: BlueprintAct[]): string {
	const blocks: string[] = [];
	for (const act of acts) {
		const lines = [`## ${act.nombre}`];
		if (act.purpose.trim()) lines.push('', act.purpose.trim());
		blocks.push(lines.join('\n'));
		for (const chapter of act.capitulos) {
			const chapterLines = [`### ${chapter.nombre}`];
			if (chapter.outline.trim()) chapterLines.push('', chapter.outline.trim());
			blocks.push(chapterLines.join('\n'));
		}
	}
	return blocks.join('\n\n').trim();
}

/**
 * Reads the Markdown back into acts and chapters. Anything that is not under a
 * heading is ignored, and chapters written before any act get an implicit one,
 * so a half-edited document still produces something usable.
 */
export function parseStructureMarkdown(markdown: string): BlueprintAct[] {
	const acts: BlueprintAct[] = [];
	let currentAct: BlueprintAct | null = null;
	let currentChapter: BlueprintChapter | null = null;
	let actPurpose: string[] = [];
	let chapterOutline: string[] = [];

	const flushChapter = () => {
		if (currentChapter) currentChapter.outline = chapterOutline.join('\n').trim();
		chapterOutline = [];
		currentChapter = null;
	};
	const flushAct = () => {
		flushChapter();
		if (currentAct) currentAct.purpose = actPurpose.join('\n').trim();
		actPurpose = [];
		currentAct = null;
	};
	const ensureAct = (): BlueprintAct => {
		if (currentAct) return currentAct;
		const act: BlueprintAct = { nombre: actHeading(acts.length, 'Untitled'), purpose: '', capitulos: [] };
		acts.push(act);
		currentAct = act;
		return act;
	};

	for (const raw of (markdown || '').split(/\r?\n/)) {
		const line = raw.trimEnd();
		const actMatch = line.match(/^##[ \t]+(?!#)(.+)$/);
		if (actMatch) {
			flushAct();
			const act: BlueprintAct = { nombre: actMatch[1].trim(), purpose: '', capitulos: [] };
			acts.push(act);
			currentAct = act;
			continue;
		}
		const chapterMatch = line.match(/^###[ \t]+(.+)$/);
		if (chapterMatch) {
			flushChapter();
			const chapter: BlueprintChapter = { nombre: chapterMatch[1].trim(), outline: '' };
			ensureAct().capitulos.push(chapter);
			currentChapter = chapter;
			continue;
		}
		// A document title or any deeper heading is not part of the structure.
		if (/^#{1}[ \t]+/.test(line) || /^#{4,}[ \t]+/.test(line)) continue;
		if (currentChapter) chapterOutline.push(line);
		else if (currentAct) actPurpose.push(line);
	}
	flushAct();
	return acts.filter((act) => act.capitulos.length > 0);
}
