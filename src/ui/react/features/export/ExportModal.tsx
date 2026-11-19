import React from "react";
import { App, Notice } from "obsidian";
import { createRoot } from "react-dom/client";
import type NovelWriterPlugin from "../../../../../main";
import type { ExportPreferences } from "../../../../types/ManuscriptExport";
import { exportChapters } from "../../../../utils/manuscriptExport/exportBook";
import { ReactNovelModal } from "../sidebar/modals/ReactNovelModal";
import { loadActiveNovel, type LoadedNovel } from "./exportSource";
import { readExportPreferences, saveExportPreferences } from "./exportPreferences";
import { runExport, type ExportRunResult } from "./runExport";
import { ExportResult } from "./ExportResult";
import { ExportOptionFields } from "./ExportOptionFields";

/** "Export novel": the whole book in one file, or one file per chapter. */
export class ExportModal extends ReactNovelModal {
	constructor(app: App, private readonly plugin: NovelWriterPlugin) {
		super(app);
		this.modalEl.addClass("nw-export-modal");
	}

	onOpen() {
		this.titleEl.setText("Export novel");
		this.contentEl.empty();
		this.root = createRoot(this.contentEl);
		this.root.render(
			<ExportView plugin={this.plugin} close={() => this.close()} />
		);
	}
}

export function openExportModal(plugin: NovelWriterPlugin) {
	new ExportModal(plugin.app, plugin).open();
}

function exportSummary(loaded: LoadedNovel, prefs: ExportPreferences): string {
	const count = exportChapters(loaded.source, prefs).length;
	if (!count) return "No chapter has text at this stage yet.";
	const chapters = count === 1 ? "1 chapter" : `${count} chapters`;
	return `${chapters} → ${loaded.folder}/export/`;
}

function ExportView({
	plugin,
	close,
}: {
	plugin: NovelWriterPlugin;
	close: () => void;
}) {
	const [loaded, setLoaded] = React.useState<LoadedNovel | null>(null);
	const [prefs, setPrefs] = React.useState<ExportPreferences | null>(null);
	const [error, setError] = React.useState("");
	const [busy, setBusy] = React.useState(false);
	const [done, setDone] = React.useState<ExportRunResult | null>(null);

	React.useEffect(() => {
		loadActiveNovel()
			.then((novel) => {
				setLoaded(novel);
				setPrefs(readExportPreferences(plugin, novel.novelId));
			})
			.catch((reason: any) => setError(reason?.message ?? String(reason)));
	}, [plugin]);

	if (error) return <p className="nw-muted">{error}</p>;
	if (!loaded || !prefs) return <p className="nw-muted">Reading the manuscripts...</p>;
	if (done) {
		return (
			<ExportResult
				app={plugin.app}
				paths={done.paths}
				chapters={done.chapters}
				exportFolder={`${loaded.folder}/export/`}
				close={close}
			/>
		);
	}

	const change = (patch: Partial<ExportPreferences>) =>
		setPrefs({ ...prefs, ...patch });

	const exportNow = async () => {
		setBusy(true);
		try {
			await saveExportPreferences(plugin, loaded.novelId, prefs);
			const result = await runExport(plugin.app, loaded, prefs);
			if (!result.paths.length) {
				new Notice("Nothing to export: no chapter has text at this stage.");
				return;
			}
			setDone(result);
		} catch (reason: any) {
			new Notice(`Export failed: ${reason?.message ?? reason}`);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div className="nw-export">
			<ExportOptionFields prefs={prefs} onChange={change} />
			<p className="nw-export-summary">{exportSummary(loaded, prefs)}</p>
			<div className="nw-export-buttons">
				<button onClick={close} disabled={busy}>
					Cancel
				</button>
				<button className="mod-cta" onClick={exportNow} disabled={busy}>
					{busy ? "Exporting..." : "Export"}
				</button>
			</div>
		</div>
	);
}
