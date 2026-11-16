import { App } from 'obsidian';
import type { NovelConfig } from '../../../domain';
import type { PromptMetaKey } from '../../../types/PromptMeta';
import { NOVELA_CONFIG_FILE } from '../../../constants/novel';
import { joinPath, readJson, writeJson } from '../fsHelpers';

/** The novel's own settings; empty when it has never set any. */
export async function readNovelConfig(app: App, folderPath: string): Promise<NovelConfig> {
	const data = await readJson<NovelConfig>(app, joinPath(folderPath, NOVELA_CONFIG_FILE));
	return data && typeof data === 'object' ? data : {};
}

/** Novel-level memory or author note; null when the novel has none of its own. */
export async function readNovelPromptMeta(
	app: App,
	folderPath: string,
	key: PromptMetaKey,
): Promise<string | null> {
	const value = (await readNovelConfig(app, folderPath))[key];
	return typeof value === 'string' ? value : null;
}

/** Sets the novel's memory or author note. An empty value removes it, so the global one applies. */
export async function writeNovelPromptMeta(
	app: App,
	folderPath: string,
	key: PromptMetaKey,
	value: string,
): Promise<void> {
	const config = await readNovelConfig(app, folderPath);
	if (value.trim()) config[key] = value;
	else delete config[key];
	await writeJson(app, joinPath(folderPath, NOVELA_CONFIG_FILE), config);
}
