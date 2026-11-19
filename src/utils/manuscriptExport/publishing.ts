import type { Capitulo, EntityId } from '../../domain';
import type {
	ChapterFormat,
	ExportHeadingOptions,
} from '../../types/ManuscriptExport';
import { parseManuscript } from './manuscriptBlocks';
import { renderChapter, withoutRepeatedTitle } from './chapterRenderers';
import { chapterHeading } from './exportBook';

/**
 * Publishing a novel chapter by chapter: which one goes next and the text to
 * paste into the site. Pure; `ordered` is the novel in reading order.
 */

/**
 * First chapter with a manuscript that is not published, after `afterId` when
 * given (wrapping to the start). Null when every chapter is published.
 */
export function nextUnpublishedChapter(
	ordered: Capitulo[],
	afterId?: EntityId | null,
): Capitulo | null {
	const start = afterId
		? ordered.findIndex((chapter) => chapter.id_capitulo === afterId) + 1
		: 0;
	const rotated = [...ordered.slice(start), ...ordered.slice(0, start)];
	return rotated.find((chapter) => chapter.archivo && !chapter.published_on) ?? null;
}

export interface PublishOptions extends ExportHeadingOptions {
	format: ChapterFormat;
	includeHeading: boolean;
	sceneBreak: string;
}

export interface PublishText {
	/** The chapter in the chosen format. */
	text: string;
	/** The same chapter as plain text: what a plain field receives on paste. */
	plain: string;
	words: number;
}

/** The text of a chapter ready to paste into a web-novel site. */
export function publishText(
	chapter: Capitulo,
	position: number,
	manuscript: string,
	options: PublishOptions,
): PublishText {
	const blocks = withoutRepeatedTitle(parseManuscript(manuscript), chapter.nombre);
	const heading = options.includeHeading
		? chapterHeading(options, position, chapter.nombre)
		: '';
	const input = {
		heading,
		blocks,
		sceneBreak: options.sceneBreak.trim() || '* * *',
	};
	const plain = renderChapter(input, 'plain');
	const bodyOnly = renderChapter({ ...input, heading: '' }, 'plain');
	const words = bodyOnly.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)?.length ?? 0;
	return {
		text: options.format === 'plain' ? plain : renderChapter(input, options.format),
		plain,
		words,
	};
}
