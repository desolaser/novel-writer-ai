import type { Acto, Capitulo, ChapterStatus, EntityId } from '../../domain';
import type {
	ExportBook,
	ExportChapter,
	ExportHeadingOptions,
	ExportPart,
	ExportPreferences,
} from '../../types/ManuscriptExport';
import { CHAPTER_STATUSES } from '../../constants/chapterStatus';
import { chaptersInOrder } from '../novelMetrics';
import { parseManuscript } from './manuscriptBlocks';
import { withoutRepeatedTitle } from './chapterRenderers';

/**
 * The novel as the book an export writes: acts, chapters in reading order with
 * their headings and blocks. Pure; the UI reads the manuscripts and hands them
 * over. Chapters without text are always left out.
 */

export interface ExportSource {
	title: string;
	author: string;
	/** Blueprint language, a plain name such as "Spanish". */
	language: string;
	acts: Acto[];
	chapters: Capitulo[];
	/** Manuscript of each chapter by id. Missing means no text. */
	texts: Map<EntityId, string>;
}

export function chapterHeading(
	options: ExportHeadingOptions,
	number: number,
	name: string,
): string {
	const word = options.chapterWord.trim() || 'Chapter';
	const numbered = `${word} ${number}`;
	if (options.style === 'number') return numbered;
	if (options.style === 'title') return name.trim() || numbered;
	return name.trim() ? `${numbered}: ${name.trim()}` : numbered;
}

function stageIndex(status: ChapterStatus | undefined): number {
	return CHAPTER_STATUSES.findIndex((item) => item.id === status);
}

/** Whether a chapter reached the stage the export asks for. */
export function reachesStatus(
	chapter: Capitulo,
	minStatus: ChapterStatus | null,
): boolean {
	if (!minStatus) return true;
	return stageIndex(chapter.status) >= stageIndex(minStatus);
}

const LANGUAGE_CODES: Record<string, string> = {
	english: 'en', inglés: 'en', ingles: 'en',
	spanish: 'es', español: 'es', espanol: 'es', castellano: 'es',
	portuguese: 'pt', português: 'pt', portugues: 'pt',
	french: 'fr', français: 'fr', francais: 'fr', francés: 'fr',
	german: 'de', deutsch: 'de', alemán: 'de',
	italian: 'it', italiano: 'it',
	catalan: 'ca', català: 'ca', catalán: 'ca',
	japanese: 'ja', '日本語': 'ja',
	chinese: 'zh', '中文': 'zh',
	korean: 'ko', '한국어': 'ko',
	russian: 'ru', 'русский': 'ru',
	dutch: 'nl', nederlands: 'nl',
	polish: 'pl', polski: 'pl',
};

/** BCP 47 code of a language name, or "und" when it is not known. */
export function languageCode(name: string): string {
	const clean = name.trim().toLowerCase();
	const named = LANGUAGE_CODES[clean];
	if (named) return named;
	// The author may already have written a code: "es", "pt-br".
	if (/^[a-z]{2}(-[a-z0-9]{2,8})?$/.test(clean)) return clean;
	return 'und';
}

/** Chapters that go into an export, in reading order, with their numbers. */
export function exportChapters(
	source: ExportSource,
	prefs: ExportPreferences,
): ExportChapter[] {
	const chapters: ExportChapter[] = [];
	for (const chapter of chaptersInOrder(source.acts, source.chapters)) {
		if (!reachesStatus(chapter, prefs.minStatus)) continue;
		const text = source.texts.get(chapter.id_capitulo) ?? '';
		const blocks = withoutRepeatedTitle(parseManuscript(text), chapter.nombre);
		if (!blocks.length) continue;
		const number = chapters.length + 1;
		chapters.push({
			id: chapter.id_capitulo,
			number,
			name: chapter.nombre,
			heading: chapterHeading(
				{ style: prefs.headingStyle, chapterWord: prefs.chapterWord },
				number,
				chapter.nombre,
			),
			blocks,
		});
	}
	return chapters;
}

export function buildExportBook(
	source: ExportSource,
	prefs: ExportPreferences,
): ExportBook {
	const included = exportChapters(source, prefs);
	const actOf = new Map(source.chapters.map((chapter) =>
		[chapter.id_capitulo, chapter.id_acto]));
	const acts = [...source.acts].sort((first, second) => first.orden - second.orden);
	const parts: ExportPart[] = acts
		.map((act) => ({
			title: act.nombre,
			chapters: included.filter((chapter) =>
				actOf.get(chapter.id) === act.id_acto),
		}))
		.filter((part) => part.chapters.length > 0);
	const known = new Set(acts.map((act) => act.id_acto));
	const loose = included.filter((chapter) => !known.has(actOf.get(chapter.id) ?? ''));
	if (loose.length) parts.push({ title: '', chapters: loose });
	return {
		title: source.title.trim() || 'Untitled',
		author: source.author.trim(),
		language: languageCode(source.language),
		sceneBreak: prefs.sceneBreak.trim() || '* * *',
		includeActTitles: prefs.includeActTitles,
		titlePage: prefs.titlePage,
		parts,
	};
}

/** Number of chapters in a book. */
export function bookChapterCount(book: ExportBook): number {
	return book.parts.reduce((sum, part) => sum + part.chapters.length, 0);
}
