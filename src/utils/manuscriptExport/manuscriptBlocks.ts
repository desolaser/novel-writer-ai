import type { ManuscriptBlock } from '../../types/ManuscriptExport';
import { parseInline } from './inlineMarkup';

/**
 * Turns a manuscript note into blocks a reader would see. Obsidian's own
 * syntax goes away: frontmatter, comments, embeds, block ids; links keep only
 * their visible text.
 *
 * Every non-empty line is a paragraph. In Obsidian a single line break already
 * shows as a new line, so authors separate paragraphs either way.
 */

export function stripObsidianSyntax(markdown: string): string {
	return markdown
		.replace(/\r\n?/g, '\n')
		.replace(/^---\n[\s\S]*?\n---[ \t]*(\n|$)/, '')
		.replace(/%%[\s\S]*?%%/g, '')
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/!\[\[[^\]]*\]\]/g, '')
		.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
		.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/[ \t]\^[A-Za-z0-9-]+[ \t]*$/gm, '');
}

const SCENE_BREAK = /^\s*(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,}|#|⁂|~{3,})\s*$/;
/** A line that only marks a scene change: `***`, `---`, `* * *`, `#`, `⁂`... */
export function isSceneBreakLine(line: string): boolean {
	return SCENE_BREAK.test(line);
}

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const QUOTE = /^>\s?(.*)$/;

function parseLine(line: string): ManuscriptBlock | null {
	if (!line.trim()) return null;
	if (SCENE_BREAK.test(line)) return { kind: 'sceneBreak' };
	const heading = HEADING.exec(line);
	if (heading) {
		return {
			kind: 'heading',
			level: heading[1].length,
			spans: parseInline(heading[2]),
		};
	}
	const quote = QUOTE.exec(line);
	if (quote) {
		if (!quote[1].trim()) return null;
		return { kind: 'quote', spans: parseInline(quote[1].trim()) };
	}
	return { kind: 'paragraph', spans: parseInline(line.trim()) };
}

export function parseManuscript(markdown: string): ManuscriptBlock[] {
	const blocks: ManuscriptBlock[] = [];
	for (const line of stripObsidianSyntax(markdown).split('\n')) {
		const block = parseLine(line);
		if (!block) continue;
		// Two breaks in a row, or a break at the start, show nothing to a reader.
		const previous = blocks[blocks.length - 1];
		if (block.kind === 'sceneBreak' && (!previous || previous.kind === 'sceneBreak')) {
			continue;
		}
		blocks.push(block);
	}
	while (blocks.length && blocks[blocks.length - 1].kind === 'sceneBreak') {
		blocks.pop();
	}
	return blocks;
}
