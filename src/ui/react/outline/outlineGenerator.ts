import type NovelWriterPlugin from '../../../../main';
import type { Acto, Capitulo } from '../../../domain';
import type { ModelPurpose } from '../../../types/ModelPurpose';
import { ApiFactory } from '../../../factories/api-factory';
import { getActiveModelConfig } from '../../../infrastructure/settings/active-model';
import { resolveChapterFile } from '../../../infrastructure/storage/repos/EstructuraRepo';
import { buildStoryBibleBlock } from '../../../context/blueprintPrompt';
import { buildChapterHistory } from '../../../context/chapterHistory';
import type { ScenePromptMeta } from '../../../context/promptBuilder';
import { chapterInfoPromptLine } from '../../../utils/chapterInfo';
import { readFrontmatterValue, readInheritedPromptMeta } from '../../../context/promptMeta';
import type { PromptMetaKey } from '../../../types/PromptMeta';
import { draftLengthFromRange, type DraftLength } from '../../../utils/draftLength';
import { runModelCompletion } from '../../../context/aiCompletion';
import {
	GENERATED_MEMORY_BLOCK,
	MEMORY_MARKER_END,
	MEMORY_MARKER_START,
} from '../../../utils/generatedMemory';
import { useNovelWriter } from '../store/novelWriterStore';
import {
	orderedChapters,
	buildActSummaryPrompt,
	buildOutlinePrompt,
	buildOutlineByMemoryPrompt,
	isCorruptGeneration,
	normalizeOutline,
	requestDraftCompletion,
	generateChapterDraftText,
} from './outlineGenerators';

/** Builds the instruction that steers each continuation of a long draft. */
export type DraftGuidance = (progress: { currentWords: number; remainingWords: number }) => string;

/** Output budget of an outline or a summary. */
const SHORT_OUTPUT_TOKENS = 800;

function toYaml(value: string): string {
	if (!value.trim()) return 'memoryContent: ""';
	const lines = value.trim().split('\n').map((line) => `  ${line}`).join('\n');
	return `memoryContent: |-\n${lines}`;
}

/**
 * Puts the generated story context in the memory of a chapter's frontmatter,
 * between the markers, keeping whatever the author wrote outside them.
 */
function mergeGeneratedMemory(raw: string, memory: string): string {
	const generated = memory.trim()
		? `${MEMORY_MARKER_START}\n${memory.trim()}\n${MEMORY_MARKER_END}`
		: '';
	const match = raw.match(/^---\s*[\s\S]*?---/);
	if (!match) return `---\n${toYaml(generated)}\n---\n\n${raw}`;
	const body = match[0].replace(/^---\s*/, '').replace(/---\s*$/, '');
	const lines = body.split('\n');
	const kept: string[] = [];
	const previous: string[] = [];
	for (let i = 0; i < lines.length; i++) {
		const inline = lines[i].match(/^\s*memoryContent\s*:\s*(.*)$/);
		if (!inline) {
			kept.push(lines[i]);
			continue;
		}
		// A value on the same line is the author's text; a `|-` block goes on
		// in the indented lines after it.
		const head = inline[1].trim().replace(/^["']|["']$/g, '');
		if (head && head !== '|-' && head !== '|' && head !== '>-') previous.push(head);
		while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1])) {
			i++;
			previous.push(lines[i].replace(/^\s{2}/, ''));
		}
	}
	const authored = previous.join('\n').replace(GENERATED_MEMORY_BLOCK, '').trim();
	const nextValue = [authored, generated].filter(Boolean).join('\n\n');
	const keptText = kept.join('\n').replace(/\n+$/, '');
	return raw.replace(match[0], `---\n${keptText}\n${toYaml(nextValue)}\n---`);
}

/**
 * The outline's AI generators, without React: outlines, act summaries, the
 * story context in chapter memories and chapter drafts. The Outline view wraps
 * them with its progress messages; the chat runs them as tools. Errors are
 * thrown with a message meant for the author.
 */
export class OutlineGenerator {
	constructor(private readonly plugin: NovelWriterPlugin) {}

	private get state() {
		return useNovelWriter.getState();
	}

	private store() {
		const store = this.state.store;
		if (!store?.activeFolderPath) throw new Error('No novel is open.');
		return store;
	}

	chapters(): Capitulo[] {
		return orderedChapters(this.state.actos, this.state.capitulos);
	}

	modelFor(purpose: ModelPurpose) {
		const active = getActiveModelConfig(this.plugin.settings.data, purpose);
		if (!active.modelName) throw new Error(`Configure a ${purpose} model in Settings.`);
		return active;
	}

	/** What happened before `chapter`, within the limits set in Settings. */
	historyFor(chapter: Capitulo | null): string {
		return buildChapterHistory(
			{
				acts: this.state.actos,
				chapters: this.chapters(),
				upTo: chapter?.id_capitulo ?? null,
			},
			this.plugin.settings.data.historyOptions,
		);
	}

	/**
	 * Writes the story so far into the chapter's memory, the only way it reaches
	 * the draft prompt (`buildScenePrompt` picks it up as memory).
	 */
	async writeChapterMemory(chapter: Capitulo, memory: string): Promise<void> {
		const store = this.store();
		const relativePath = await this.state.ensureCapituloArchivo(chapter.id_capitulo);
		if (!relativePath) return;
		// Resolved by frontmatter: still works after a rename.
		const file = await resolveChapterFile(
			this.plugin.app,
			store.activeFolderPath!,
			chapter.id_capitulo,
			relativePath,
		);
		if (!file) return;
		// vault.process(): atomic read-modify-write, safe with the chapter open.
		await this.plugin.app.vault.process(file, (raw) => mergeGeneratedMemory(raw, memory));
	}

	async refreshStoryContext(chapter: Capitulo): Promise<void> {
		await this.writeChapterMemory(chapter, this.historyFor(chapter));
	}

	/** Summarizes an act from the outlines of its chapters and saves it. */
	async summarizeAct(act: Acto): Promise<string> {
		const own = this.chapters().filter((c) => c.id_acto === act.id_acto && c.outline?.trim());
		if (!own.length) {
			throw new Error(`The act "${act.nombre}" has no chapter outlines to summarize yet.`);
		}
		const blueprint = await this.store().readBlueprint();
		const outlines = own.map((c) => `${c.nombre}: ${c.outline.trim()}`).join('\n\n');
		const prompt = buildActSummaryPrompt(act, outlines, buildStoryBibleBlock(blueprint), blueprint);
		const text = await runModelCompletion(this.plugin, prompt, SHORT_OUTPUT_TOKENS);
		if (isCorruptGeneration(text)) {
			throw new Error(`The AI returned an invalid summary for ${act.nombre}.`);
		}
		const summary = normalizeOutline(text);
		await this.state.updateActo(act.id_acto, { resumen: summary });
		return summary;
	}

	/**
	 * Acts that fall outside the recent window need a summary in `ai-summary`
	 * mode, or their chapters vanish from the context. Generated once, right
	 * before spending the big budget of the drafts.
	 */
	async ensureActSummaries(onStatus?: (message: string) => void): Promise<void> {
		const options = this.plugin.settings.data.historyOptions;
		if (options.olderChapters !== 'ai-summary') return;
		const written = this.chapters().filter((c) => c.outline?.trim());
		const recent = Math.max(0, options.recentChapters);
		const older = written.slice(0, Math.max(0, written.length - recent));
		const pending = this.state.actos.filter((act) =>
			!act.resumen?.trim() && older.some((c) => c.id_acto === act.id_acto));
		for (const act of pending) {
			onStatus?.(`Summarizing act: ${act.nombre}`);
			await this.summarizeAct(act);
		}
	}

	private async completeOutline(chapter: Capitulo, prompt: string): Promise<string> {
		const active = this.modelFor('utilities');
		const token = this.plugin.settings.data.apiToken[active.providerId] ?? '';
		const api = new ApiFactory().createApi(active.providerId, token);
		const result = await requestDraftCompletion(
			api, prompt, active.modelName, SHORT_OUTPUT_TOKENS, active.options,
		);
		const outline = normalizeOutline(result.text ?? '');
		if (!outline) throw new Error(`The AI did not return an outline for ${chapter.nombre}.`);
		await this.state.updateCapitulo(chapter.id_capitulo, { outline });
		return outline;
	}

	/** Outline summarizing the chapter's manuscript; null when it has no text. */
	async outlineFromManuscript(chapter: Capitulo): Promise<string | null> {
		const store = this.store();
		this.modelFor('utilities');
		// Empty when the chapter has no manuscript file yet.
		const manuscript = await this.state.readCapituloTexto(chapter.id_capitulo);
		if (!manuscript.trim()) return null;
		const blueprint = await store.readBlueprint();
		return this.completeOutline(chapter, buildOutlinePrompt(chapter, manuscript, blueprint));
	}

	/** Outline for a chapter not written yet, following the story so far. */
	async outlineFromStory(chapter: Capitulo): Promise<string> {
		const store = this.store();
		this.modelFor('utilities');
		const blueprint = await store.readBlueprint();
		const prompt = buildOutlineByMemoryPrompt(
			chapter, this.historyFor(chapter), buildStoryBibleBlock(blueprint), blueprint,
		);
		return this.completeOutline(chapter, prompt);
	}

	/**
	 * Length of a draft, from the Story Bible's words per chapter (per novel),
	 * or the default range when the novel has no Novel Setup.
	 */
	async draftLength(): Promise<DraftLength> {
		const blueprint = await this.store().readBlueprint();
		return draftLengthFromRange(blueprint?.wordsPerChapter);
	}

	/**
	 * Draft of a chapter from its outline, with the writing model. Prepares the
	 * manuscript and its story context first; returns the text without saving it.
	 */
	async draftText(
		chapter: Capitulo,
		length: DraftLength,
		guidance: DraftGuidance,
		onInvalid: () => void,
	): Promise<string> {
		const store = this.store();
		const settings = this.plugin.settings.data;
		const active = this.modelFor('writing');
		await this.state.ensureCapituloArchivo(chapter.id_capitulo);
		await this.refreshStoryContext(chapter);
		const meta = await this.chapterMeta(chapter);
		const api = new ApiFactory().createApi(
			active.providerId,
			settings.apiToken[active.providerId] ?? '',
		);
		return generateChapterDraftText(
			this.plugin.app,
			store.activeFolderPath!,
			api,
			active.modelName,
			active.options,
			settings,
			chapter.outline ?? '',
			length,
			guidance,
			onInvalid,
			meta,
		);
	}

	/**
	 * Memory and author note of the chapter itself (its own, or what it
	 * inherits from the novel and Settings), whatever note the editor shows.
	 */
	private async chapterMeta(chapter: Capitulo): Promise<ScenePromptMeta | undefined> {
		const store = this.store();
		const relativePath = this.state.capitulos
			.find((item) => item.id_capitulo === chapter.id_capitulo)?.archivo;
		if (!relativePath) return undefined;
		const app = this.plugin.app;
		const file = await resolveChapterFile(
			app, store.activeFolderPath!, chapter.id_capitulo, relativePath,
		);
		if (!file) return undefined;
		const settings = this.plugin.settings.data;
		const read = async (key: PromptMetaKey) =>
			(await readFrontmatterValue(app, file, key))
				?? readInheritedPromptMeta(app, settings, file.parent, key);
		const current = this.state.capitulos
			.find((item) => item.id_capitulo === chapter.id_capitulo) ?? chapter;
		return {
			memory: await read('memoryContent'),
			authorNote: await read('authorNote'),
			chapterInfo: chapterInfoPromptLine(current, this.state.entradas),
		};
	}
}
