import type { ChapterStatus } from '../domain';

/** A run of text with the same formatting. */
export interface InlineSpan {
	text: string;
	italic: boolean;
	bold: boolean;
	strike: boolean;
}

/** One block of a manuscript, after Obsidian's own syntax is removed. */
export type ManuscriptBlock =
	| { kind: 'paragraph'; spans: InlineSpan[] }
	| { kind: 'heading'; level: number; spans: InlineSpan[] }
	| { kind: 'quote'; spans: InlineSpan[] }
	| { kind: 'sceneBreak' };

/** Formats a single chapter can be copied or saved in. */
export type ChapterFormat = 'plain' | 'html' | 'markdown' | 'bbcode';

/** Formats of a whole novel compiled into one file. */
export type CompileFormat = 'md' | 'html' | 'epub' | 'docx';

/** How each chapter is titled in an export. */
export type ChapterHeadingStyle = 'title' | 'number' | 'number-title';

export interface ExportHeadingOptions {
	style: ChapterHeadingStyle;
	/** Word before the number: "Chapter", "Capítulo"... */
	chapterWord: string;
}

/** A chapter ready to export: its heading text and its blocks. */
export interface ExportChapter {
	id: string;
	/** Reading-order number among the exported chapters, from 1. */
	number: number;
	/** The chapter's own name. */
	name: string;
	heading: string;
	blocks: ManuscriptBlock[];
}

/** An act and its exported chapters. Acts without chapters are left out. */
export interface ExportPart {
	title: string;
	chapters: ExportChapter[];
}

export interface ExportBook {
	title: string;
	author: string;
	/** BCP 47 code ("es", "en"), or "und" when unknown. */
	language: string;
	/** Text of a scene break, such as "* * *". */
	sceneBreak: string;
	/** Whether act titles get their own heading or page. */
	includeActTitles: boolean;
	titlePage: boolean;
	parts: ExportPart[];
}

/** What the author picks in the Export dialog; remembered in Settings. */
export interface ExportPreferences {
	compileFormat: CompileFormat;
	/** One file for the whole novel, or one file per chapter. */
	output: 'single' | 'per-chapter';
	chapterFormat: ChapterFormat;
	headingStyle: ChapterHeadingStyle;
	chapterWord: string;
	includeActTitles: boolean;
	titlePage: boolean;
	sceneBreak: string;
	/** Leaves out chapters below this stage; null exports every chapter. */
	minStatus: ChapterStatus | null;
	/** Whether a copied or saved chapter starts with its heading. */
	includeChapterHeading: boolean;
}

export const DEFAULT_EXPORT_PREFERENCES: ExportPreferences = {
	compileFormat: 'epub',
	output: 'single',
	chapterFormat: 'html',
	headingStyle: 'number-title',
	chapterWord: 'Chapter',
	includeActTitles: false,
	titlePage: true,
	sceneBreak: '* * *',
	minStatus: null,
	includeChapterHeading: true,
};
