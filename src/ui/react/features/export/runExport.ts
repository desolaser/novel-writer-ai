import type { App } from "obsidian";
import type {
	ChapterFormat,
	CompileFormat,
	ExportPreferences,
} from "../../../../types/ManuscriptExport";
import {
	bookChapterCount,
	buildExportBook,
	exportChapters,
} from "../../../../utils/manuscriptExport/exportBook";
import {
	chapterFileExtension,
	renderChapter,
} from "../../../../utils/manuscriptExport/chapterRenderers";
import { renderBookHtml, renderBookMarkdown } from "../../../../utils/manuscriptExport/bookText";
import { buildEpub } from "../../../../utils/manuscriptExport/epubWriter";
import { buildDocx } from "../../../../utils/manuscriptExport/docxWriter";
import { escapeHtml } from "../../../../utils/manuscriptExport/markup";
import {
	exportPath,
	safeFileName,
	writeExportFile,
} from "../../../../infrastructure/storage/exportFiles";
import type { LoadedNovel } from "./exportSource";

/** What an export wrote. */
export interface ExportRunResult {
	paths: string[];
	chapters: number;
}

function compiledFile(
	loaded: LoadedNovel,
	prefs: ExportPreferences,
	format: CompileFormat,
): { data: string | Uint8Array; chapters: number; title: string } {
	const book = buildExportBook(loaded.source, prefs);
	const now = new Date();
	const chapters = bookChapterCount(book);
	if (format === "md") return { data: renderBookMarkdown(book), chapters, title: book.title };
	if (format === "html") return { data: renderBookHtml(book), chapters, title: book.title };
	if (format === "epub") {
		const identifier = `urn:novel-writer:${loaded.novelId}`;
		return { data: buildEpub(book, { identifier, modified: now }), chapters, title: book.title };
	}
	return { data: buildDocx(book, { created: now }), chapters, title: book.title };
}

/** A whole HTML page around one chapter, so the file opens in a browser. */
function chapterHtmlPage(title: string, body: string): string {
	return [
		"<!DOCTYPE html>",
		"<html>",
		"<head>",
		'<meta charset="utf-8">',
		`<title>${escapeHtml(title)}</title>`,
		"</head>",
		"<body>",
		body,
		"</body>",
		"</html>",
		"",
	].join("\n");
}

async function exportPerChapter(
	app: App,
	loaded: LoadedNovel,
	prefs: ExportPreferences,
	format: ChapterFormat,
): Promise<ExportRunResult> {
	const chapters = exportChapters(loaded.source, prefs);
	const folderName = `${safeFileName(loaded.source.title || "Novel")} - chapters`;
	const digits = String(chapters.length).length < 2 ? 2 : String(chapters.length).length;
	const paths: string[] = [];
	for (const chapter of chapters) {
		const body = renderChapter({
			heading: prefs.includeChapterHeading ? chapter.heading : "",
			blocks: chapter.blocks,
			sceneBreak: prefs.sceneBreak,
		}, format);
		const data = format === "html" ? chapterHtmlPage(chapter.heading, body) : `${body}\n`;
		const number = String(chapter.number).padStart(digits, "0");
		const fileName = `${number} - ${safeFileName(chapter.name || chapter.heading)}`;
		const path = exportPath(
			loaded.folder,
			folderName,
			`${fileName}.${chapterFileExtension(format)}`,
		);
		paths.push(await writeExportFile(app, path, data));
	}
	return { paths, chapters: chapters.length };
}

/** Writes the export the author chose into the novel's `export/` folder. */
export async function runExport(
	app: App,
	loaded: LoadedNovel,
	prefs: ExportPreferences,
): Promise<ExportRunResult> {
	if (prefs.output === "per-chapter") {
		return exportPerChapter(app, loaded, prefs, prefs.chapterFormat);
	}
	const format = prefs.compileFormat;
	const file = compiledFile(loaded, prefs, format);
	if (!file.chapters) return { paths: [], chapters: 0 };
	const path = exportPath(loaded.folder, `${safeFileName(file.title)}.${format}`);
	return {
		paths: [await writeExportFile(app, path, file.data)],
		chapters: file.chapters,
	};
}
