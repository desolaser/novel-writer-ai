import type NovelWriterPlugin from "../../../../../main";
import {
	DEFAULT_EXPORT_PREFERENCES,
	type ExportPreferences,
} from "../../../../types/ManuscriptExport";

/**
 * Export choices are remembered per novel: the chapter word ("Chapter",
 * "Capítulo") and the stage worth exporting belong to each book.
 */

export function readExportPreferences(
	plugin: NovelWriterPlugin,
	novelId: string,
): ExportPreferences {
	const saved = plugin.settings.data.exportPreferences?.[novelId] ?? {};
	return { ...DEFAULT_EXPORT_PREFERENCES, ...saved };
}

export async function saveExportPreferences(
	plugin: NovelWriterPlugin,
	novelId: string,
	prefs: ExportPreferences,
): Promise<void> {
	await plugin.settings.update({
		exportPreferences: {
			...plugin.settings.data.exportPreferences,
			[novelId]: prefs,
		},
	});
}
