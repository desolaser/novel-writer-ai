import React from "react";
import type { App } from "obsidian";
import {
	canOpenWithDefaultApp,
	canShowInFolder,
	openWithDefaultApp,
	showInFolder,
} from "./revealExport";

export interface ExportResultProps {
	app: App;
	paths: string[];
	chapters: number;
	exportFolder: string;
	close: () => void;
}

function resultMessage(paths: string[], chapters: number, folder: string) {
	const counted = chapters === 1 ? "1 chapter" : `${chapters} chapters`;
	if (paths.length === 1) return `Exported ${counted} to ${paths[0]}.`;
	return `Exported ${counted} as ${paths.length} files in ${folder}.`;
}

/** What an export wrote, with ways to reach files Obsidian doesn't list. */
export function ExportResult({
	app,
	paths,
	chapters,
	exportFolder,
	close,
}: ExportResultProps) {
	const single = paths.length === 1;
	const canReveal = canShowInFolder(app);
	const canOpen = single && canOpenWithDefaultApp(app);

	return (
		<div className="nw-export">
			<p>{resultMessage(paths, chapters, exportFolder)}</p>
			<p className="nw-export-summary">
				Obsidian doesn't list EPUB, Word or HTML files in its file
				explorer, but they are in the folder.
			</p>
			<div className="nw-export-buttons">
				{canReveal && (
					<button onClick={() => showInFolder(app, paths[0])}>
						Show in folder
					</button>
				)}
				{canOpen && (
					<button onClick={() => openWithDefaultApp(app, paths[0])}>
						Open
					</button>
				)}
				<button className="mod-cta" onClick={close}>
					Done
				</button>
			</div>
		</div>
	);
}
