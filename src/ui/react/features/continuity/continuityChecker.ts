import type NovelWriterPlugin from '../../../../../main';
import { nowISO } from '../../../../domain';
import type { Capitulo } from '../../../../domain';
import type {
	ChapterContinuity,
	ContinuityFile,
	ContinuityReport,
} from '../../../../types/Continuity';
import { createUtilityCompletion } from '../../../../context/aiCompletion';
import { buildCodexYaml } from '../../../../context/promptBuilder';
import { buildStoryBibleBlock } from '../../../../context/blueprintPrompt';
import {
	buildContinuityPrompt,
	buildExtractFactsPrompt,
	parseFactsResponse,
	parseIssuesResponse,
} from '../../../../context/continuityPrompt';
import {
	pruneContinuity,
	readContinuity,
	updateChapterContinuity,
} from '../../../../infrastructure/storage/repos/ContinuityRepo';
import { chapterInfoPromptLine } from '../../../../utils/chapterInfo';
import {
	earlierFactsBlock,
	factsAreStale,
	mergeExtractedFacts,
	storyTextHash,
} from '../../../../utils/storyFacts';
import { useNovelWriter } from '../../store/novelWriterStore';
import { orderedChapters } from '../../outline/outlineGenerators';

/** Output budget of a chapter's facts (a JSON list of up to 12 sentences). */
const FACTS_TOKENS = 1200;

/** Output budget of a continuity report. */
const CHECK_TOKENS = 3000;

type Completion = ReturnType<typeof createUtilityCompletion>;

export interface ContinuityCheckResult {
	report: ContinuityReport;
	/** Earlier chapters whose facts could not be read this time. */
	skipped: string[];
}

/**
 * The continuity check, without React: the Outline and the chat tool share
 * it. Facts are extracted only from chapters whose text changed since the
 * last time (`storyTextHash`), always with the utilities model.
 */
export class ContinuityChecker {
	constructor(private readonly plugin: NovelWriterPlugin) {}

	private get state() {
		return useNovelWriter.getState();
	}

	private folder(): string {
		const folder = this.state.store?.activeFolderPath;
		if (!folder) throw new Error('No novel is open.');
		return folder;
	}

	chapters(): Capitulo[] {
		return orderedChapters(this.state.actos, this.state.capitulos);
	}

	readLedger(): Promise<ContinuityFile> {
		return readContinuity(this.plugin.app, this.folder());
	}

	/** Changes a chapter's facts or report (the facts panel, dismissing). */
	updateEntry(
		chapterId: string,
		change: (entry: ChapterContinuity) => ChapterContinuity,
	): Promise<ChapterContinuity> {
		return updateChapterContinuity(this.plugin.app, this.folder(), chapterId, change);
	}

	/** Extracts a chapter's facts again, even if its text didn't change. */
	async extractFacts(chapter: Capitulo): Promise<ChapterContinuity | null> {
		return this.extract(createUtilityCompletion(this.plugin), chapter, true);
	}

	/**
	 * Checks a chapter against the facts of the chapters before it and the
	 * codex entries it mentions, and saves the report.
	 */
	async check(
		chapter: Capitulo,
		onStatus: (message: string) => void = () => {},
	): Promise<ContinuityCheckResult> {
		const all = this.chapters();
		const index = all.findIndex((item) => item.id_capitulo === chapter.id_capitulo);
		if (index < 0) throw new Error('That chapter no longer exists.');
		const current = all[index];
		const manuscript = await this.state.readCapituloTexto(current.id_capitulo);
		if (!manuscript.trim()) {
			throw new Error(`"${current.nombre}" has no text to check.`);
		}
		const completion = createUtilityCompletion(this.plugin);
		const earlier = all.slice(0, index);
		const skipped: string[] = [];
		for (let i = 0; i < earlier.length; i++) {
			onStatus(`Reading facts: ${i + 1}/${earlier.length} — ${earlier[i].nombre}`);
			try {
				await this.extract(completion, earlier[i], false);
			} catch {
				skipped.push(earlier[i].nombre);
			}
		}
		// Its own facts too, so the next chapter's check finds them.
		onStatus(`Reading facts: ${current.nombre}`);
		await this.extract(completion, current, false).catch(() => null);
		await pruneContinuity(
			this.plugin.app, this.folder(), all.map((item) => item.id_capitulo),
		);

		onStatus(`Checking: ${current.nombre}`);
		const facts = earlierFactsBlock(
			earlier,
			await this.readLedger(),
			(item) => all.indexOf(item) + 1,
		);
		const prompt = await this.checkPrompt(current, index + 1, manuscript, facts.text);
		const answer = await completion.complete(prompt, CHECK_TOKENS);
		const report: ContinuityReport = {
			checked_at: nowISO(),
			text_hash: storyTextHash(manuscript),
			facts_checked: facts.count,
			issues: parseIssuesResponse(answer, facts.chapterByNumber),
		};
		await this.updateEntry(current.id_capitulo, (entry) => ({ ...entry, report }));
		return { report, skipped };
	}

	private async checkPrompt(
		chapter: Capitulo,
		chapterNumber: number,
		manuscript: string,
		earlierFacts: string,
	): Promise<string> {
		const folder = this.folder();
		const blueprint = await this.state.store!.readBlueprint();
		// Detection over the whole chapter: every entry it names is relevant.
		const codex = await buildCodexYaml(
			this.plugin.app, folder, undefined, manuscript, manuscript.length,
		);
		return buildContinuityPrompt({
			chapter,
			chapterNumber,
			manuscript,
			chapterInfo: chapterInfoPromptLine(chapter, this.state.entradas),
			earlierFacts,
			codex,
			storyBible: buildStoryBibleBlock(blueprint),
			blueprint,
		});
	}

	/**
	 * Facts of one chapter: the stored ones while its text is the same, new
	 * ones otherwise. Null when the chapter has no text.
	 */
	private async extract(
		completion: Completion,
		chapter: Capitulo,
		force: boolean,
	): Promise<ChapterContinuity | null> {
		const manuscript = await this.state.readCapituloTexto(chapter.id_capitulo);
		if (!manuscript.trim()) return null;
		const hash = storyTextHash(manuscript);
		const stored = (await this.readLedger()).chapters[chapter.id_capitulo];
		if (!force && !factsAreStale(stored, hash)) return stored;
		const blueprint = await this.state.store!.readBlueprint();
		const answer = await completion.complete(
			buildExtractFactsPrompt(chapter, manuscript, blueprint),
			FACTS_TOKENS,
		);
		const facts = parseFactsResponse(answer);
		return this.updateEntry(chapter.id_capitulo, (entry) =>
			mergeExtractedFacts(entry, facts, hash, nowISO()));
	}
}
