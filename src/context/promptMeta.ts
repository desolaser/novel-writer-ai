import { App, TFile, TFolder } from 'obsidian';
import * as yaml from 'js-yaml';
import type { PluginSettings } from '../infrastructure/settings/plugin-settings';
import type { PromptMetaKey } from '../types/PromptMeta';
import { NOVELA_META_FILE } from '../constants/novel';
import { readNovelPromptMeta } from '../infrastructure/storage/repos/NovelConfigRepo';

/**
 * Legacy: a note with memory or author note for every note in its folder. Still
 * read, for folders outside any novel; nothing writes it anymore.
 */
export const PROMPT_META_CONFIG_FILE = '_config.md';

const FRONTMATTER = /^---\s*([\s\S]*?)---/;

/** Novel folders are the ones holding this file (see `scanNovels`). */
function isNovelFolder(folder: TFolder): boolean {
	return folder.children.some((child) =>
		child instanceof TFile && child.name === NOVELA_META_FILE);
}

/**
 * Value of `key` inherited by notes inside `folder`, walking up the folders:
 * a novel's own value (its `__config.json`), then a legacy `_config.md`, and
 * at the end the global setting.
 */
export async function readInheritedPromptMeta(
	app: App,
	settings: PluginSettings,
	folder: TFolder | null,
	key: PromptMetaKey,
): Promise<string> {
	let current = folder;
	while (current) {
		if (isNovelFolder(current)) {
			const novelValue = await readNovelPromptMeta(app, current.path, key);
			if (novelValue !== null) return novelValue;
		}
		const config = current.children.find((child) =>
			child instanceof TFile && child.name === PROMPT_META_CONFIG_FILE) as TFile | undefined;
		if (config) {
			const value = await readFrontmatterValue(app, config, key);
			if (value !== null) return value;
		}
		current = current.parent;
	}
	return settings[key] ?? '';
}

/** Resolves prompt metadata: the active note, then its novel, then the global setting. */
export async function getPromptMetaCascading(
	app: App,
	settings: PluginSettings,
	key: PromptMetaKey,
): Promise<string> {
	const file = app.workspace.getActiveFile();
	if (!file) return settings[key] ?? '';
	const direct = await readFrontmatterValue(app, file, key);
	if (direct !== null) return direct;
	return readInheritedPromptMeta(app, settings, file.parent, key);
}

export async function writePromptMeta(
	app: App,
	settings: PluginSettings,
	key: PromptMetaKey,
	value: string,
): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file) {
		settings[key] = value;
		return;
	}
	await writeFrontmatterValue(app, file, key, value);
}

/**
 * Sets one frontmatter key of a note. Uses vault.process() for an atomic
 * read-modify-write, so an open editor on the same note is not corrupted.
 */
export async function writeFrontmatterValue(
	app: App,
	file: TFile,
	key: string,
	value: string,
): Promise<void> {
	await app.vault.process(file, (raw) => {
		const match = raw.match(FRONTMATTER);
		let front: Record<string, any> = {};
		if (match) {
			const parsed = yaml.load(match[1]);
			if (parsed && typeof parsed === 'object') front = parsed as Record<string, any>;
		}
		front[key] = value;
		const block = `---\n${yaml.dump(front)}---`;
		return match ? raw.replace(/^---[\s\S]*?---/, block) : `${block}\n\n${raw}`;
	});
}

export async function readFrontmatterValue(
	app: App,
	file: TFile,
	key: string,
): Promise<string | null> {
	const raw = await app.vault.read(file);
	const match = raw.match(FRONTMATTER);
	if (!match) return null;
	try {
		const value = (yaml.load(match[1]) as any)?.[key];
		return typeof value === 'string' ? value : null;
	} catch {
		return null;
	}
}
