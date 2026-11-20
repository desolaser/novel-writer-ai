import { isSceneBreakLine } from './manuscriptExport/manuscriptBlocks';

/**
 * A manuscript as scenes: the text between scene breaks (`* * *`, `***`,
 * `---`...). Scene N of the plan is section N of the manuscript. Pure.
 */

/** The break written between scenes drafted by the AI. */
export const DRAFT_SCENE_BREAK = '* * *';

export interface SceneSections {
	/** Text of each scene, trimmed. Empty when the manuscript has no text. */
	sections: string[];
	/** The break line after each section but the last, as the author wrote it. */
	breaks: string[];
}

function withoutFrontmatter(text: string): string {
	return text.replace(/^---\s*[\s\S]*?---\s*/, '');
}

export function splitSceneSections(manuscript: string): SceneSections {
	const body = withoutFrontmatter(manuscript ?? '');
	if (!body.trim()) return { sections: [], breaks: [] };
	const sections: string[] = [];
	const breaks: string[] = [];
	let current: string[] = [];
	for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
		if (isSceneBreakLine(line)) {
			sections.push(current.join('\n').trim());
			breaks.push(line.trim());
			current = [];
		} else {
			current.push(line);
		}
	}
	sections.push(current.join('\n').trim());
	return { sections, breaks };
}

/** Joins sections back, keeping the author's breaks; new ones get `* * *`. */
export function joinSceneSections({ sections, breaks }: SceneSections): string {
	return sections
		.map((section, index) => {
			if (index === 0) return section;
			const separator = breaks[index - 1] ?? DRAFT_SCENE_BREAK;
			return `${separator}\n\n${section}`;
		})
		.join('\n\n')
		.trim();
}

/**
 * Scene the end of `textBefore` is in: 0 before the first break, 1 after it,
 * and so on. Used to tell "Generate text" which scene the cursor is in.
 */
export function sceneIndexAt(textBefore: string): number {
	const body = withoutFrontmatter(textBefore ?? '');
	return body
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.filter((line) => isSceneBreakLine(line))
		.length;
}

/**
 * Writes `text` as scene `index`: replaces that section, or adds it after the
 * last one. A scene further ahead than the next one can't be placed.
 */
export function placeScene(
	parts: SceneSections,
	index: number,
	text: string,
): SceneSections {
	const sections = [...parts.sections];
	if (index > sections.length) {
		throw new Error(`Write scene ${sections.length + 1} first: `
			+ `the manuscript has ${sections.length} scene(s).`);
	}
	sections[index] = text.trim();
	return { sections, breaks: parts.breaks };
}

/**
 * A drafted scene without a heading or a scene break at its start or end:
 * the break between scenes is written by whoever joins them.
 */
export function trimSceneEdges(text: string): string {
	const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');
	const isEdge = (line: string) =>
		isSceneBreakLine(line) || /^#{1,6}\s/.test(line.trim()) || !line.trim();
	while (lines.length && isEdge(lines[0])) lines.shift();
	while (lines.length && isEdge(lines[lines.length - 1])) lines.pop();
	return lines.join('\n').trim();
}
