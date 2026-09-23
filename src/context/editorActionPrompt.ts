import type { EditorAction } from '../types/EditorAction';
import type { App } from 'obsidian';
import type { PluginSettings } from '../infrastructure/settings/plugin-settings';
import { getPromptMetaCascading } from './promptMeta';
import { buildCodexYaml } from './promptBuilder';
import { readBlueprint } from '../infrastructure/storage/repos/BlueprintRepo';
import { buildStoryBibleBlock } from './blueprintPrompt';
import type { EditorActionPromptContext } from './editorActionTemplate';

export async function resolveEditorActionContext(
	app: App,
	settings: PluginSettings,
	folderPath: string,
	action: EditorAction,
	beforeCursor: string,
	chapterOutline: string,
): Promise<Partial<EditorActionPromptContext>> {
	const source = action.instruction;
	const uses = (key: string) => new RegExp(`{{\\s*${key}\\s*}}`).test(source);
	const context: Partial<EditorActionPromptContext> = {};
	if (uses('memory')) {
		context.memory = await getPromptMetaCascading(
			app, settings, 'memoryContent'
		);
	}
	if (uses('author_note')) {
		context.author_note = await getPromptMetaCascading(
			app, settings, 'authorNote'
		);
	}
	if (uses('chapter_outline')) context.chapter_outline = chapterOutline;
	if (uses('codex')) {
		context.codex = await buildCodexYaml(
			app, folderPath, undefined, beforeCursor,
			settings.codexOptions.searchRange,
		);
	}
	if (uses('story_bible')) {
		context.story_bible = buildStoryBibleBlock(
			await readBlueprint(app, folderPath)
		);
	}
	return context;
}
