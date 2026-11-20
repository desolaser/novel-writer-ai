import { App } from 'obsidian';
import type { NovelConfig } from '../../../domain';
import type { PromptMetaKey } from '../../../types/PromptMeta';
import { NOVELA_CONFIG_FILE } from '../../../constants/novel';
import { joinPath, readJson, writeJson } from '../fsHelpers';
import { withFileLock } from '../fileLock';

function configPath(folderPath: string): string {
	return joinPath(folderPath, NOVELA_CONFIG_FILE);
}

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
	await withFileLock(configPath(folderPath), async () => {
		const config = await readNovelConfig(app, folderPath);
		if (value.trim()) config[key] = value;
		else delete config[key];
		await writeJson(app, configPath(folderPath), config);
	});
}

/** Names the Metrics tab no longer suggests for a codex entry. */
export async function readIgnoredNames(app: App, folderPath: string): Promise<string[]> {
	const names = (await readNovelConfig(app, folderPath)).ignoredNames;
	return Array.isArray(names) ? names.filter((name) => typeof name === 'string') : [];
}

/** Changes the ignored names against the file as it is now; returns them. */
export async function changeIgnoredNames(
	app: App,
	folderPath: string,
	change: (names: string[]) => string[],
): Promise<string[]> {
	return withFileLock(configPath(folderPath), async () => {
		const config = await readNovelConfig(app, folderPath);
		const current = Array.isArray(config.ignoredNames) ? config.ignoredNames : [];
		const names = change(current);
		if (names.length) config.ignoredNames = names;
		else delete config.ignoredNames;
		await writeJson(app, configPath(folderPath), config);
		return names;
	});
}
