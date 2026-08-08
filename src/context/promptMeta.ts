import { App, TFile } from 'obsidian';
import * as yaml from 'js-yaml';
import type { PluginSettings } from '../infrastructure/settings/plugin-settings';

/** Resolves prompt metadata using the legacy note -> _config.md -> global cascade. */
export async function getPromptMetaCascading(app: App, settings: PluginSettings, key: 'memoryContent' | 'authorNote'): Promise<string> {
	const file = app.workspace.getActiveFile();
	if (file) {
		const direct = await readFrontmatterValue(app, file, key);
		if (direct !== null) return direct;
		let folder = file.parent;
		while (folder) {
			const config = folder.children.find(x => x instanceof TFile && x.name === '_config.md') as TFile | undefined;
			if (config) {
				const value = await readFrontmatterValue(app, config, key);
				if (value !== null) return value;
			}
			folder = folder.parent;
		}
	}
	return settings[key] ?? '';
}

export async function writePromptMeta(app: App, settings: PluginSettings, key: 'memoryContent' | 'authorNote', value: string): Promise<void> {
	const file = app.workspace.getActiveFile();
	if (!file) { settings[key] = value; return; }
	// Use vault.process() for atomic read-modify-write to avoid corrupting
	// the editor state when modifying the active file's frontmatter.
	await app.vault.process(file, (raw) => {
		const match = raw.match(/^---\s*([\s\S]*?)---/);
		let front: Record<string, any> = {};
		if (match) { const parsed = yaml.load(match[1]); if (parsed && typeof parsed === 'object') front = parsed as Record<string, any>; }
		front[key] = value;
		const block = `---\n${yaml.dump(front)}---`;
		return match ? raw.replace(/^---[\s\S]*?---/, block) : `${block}\n\n${raw}`;
	});
}

async function readFrontmatterValue(app: App, file: TFile, key: string): Promise<string | null> {
	const raw = await app.vault.read(file);
	const match = raw.match(/^---\s*([\s\S]*?)---/);
	if (!match) return null;
	try { const value = (yaml.load(match[1]) as any)?.[key]; return typeof value === 'string' ? value : null; } catch { return null; }
}
