import type { WritingDay, WritingLog } from '../../domain';
import { countProseWords } from '../../utils/textStats';
import { dayKey, emptyWritingLog, mergeWritingDays } from '../../utils/writingLog';
import {
	attributeSave,
	noNotedWords,
	type EditSource,
	type ForeignChunk,
	type NotedWords,
} from '../../utils/writingAttribution';

/** Wait after the last counted change before writing the log to disk. */
const FLUSH_DELAY_MS = 10000;

export interface WritingTrackerDeps {
	readText(path: string): Promise<string | null>;
	readLog(folder: string): Promise<WritingLog>;
	addDays(folder: string, days: WritingDay[]): Promise<void>;
	isPluginWrite(path: string): boolean;
	now(): Date;
}

export type { EditSource };

/**
 * Counts the words written in the active novel's manuscripts, day by day.
 *
 * It keeps the word count of every chapter as a baseline and, when a
 * manuscript is saved, adds the difference to today. Baselines are taken when
 * the novel becomes active, so edits made while Obsidian was closed (or synced
 * from another device, which logs them itself) are not credited twice.
 * Counts stay in memory and reach `__writing_log.json` a few seconds later.
 *
 * The difference is split by source with `attributeSave`: edits noted with
 * `noteEdit` (paste, cut, AI text inserted in the editor) are taken out of
 * the next save, and a whole save marked as a plugin write (drafts, undo)
 * counts as generated. Deleting pasted or generated text that is still in the
 * file takes it out of those counts, not out of the author's.
 */
export class WritingTracker {
	private folder: string | null = null;
	private baselines = new Map<string, number>();
	private noted = new Map<string, NotedWords>();
	/** Pasted and generated words still in each manuscript, this session. */
	private foreign = new Map<string, ForeignChunk[]>();
	private pending = new Map<string, WritingDay>();
	private flushTimer: ReturnType<typeof setTimeout> | null = null;
	/** Recounts run one after another, in the order the saves happened. */
	private chain: Promise<void> = Promise.resolve();

	constructor(private deps: WritingTrackerDeps) {}

	/** Novel and manuscripts to watch. Call it whenever either changes. */
	async setNovel(folder: string | null, chapterPaths: string[]): Promise<void> {
		if (folder !== this.folder) {
			await this.flush();
			this.folder = folder;
			this.baselines.clear();
			this.noted.clear();
			this.foreign.clear();
		}
		const wanted = new Set(chapterPaths);
		for (const path of [...this.baselines.keys()]) {
			if (wanted.has(path)) continue;
			this.baselines.delete(path);
			this.noted.delete(path);
			this.foreign.delete(path);
		}
		for (const path of chapterPaths) {
			if (this.baselines.has(path)) continue;
			const words = countProseWords((await this.deps.readText(path)) ?? '');
			if (this.folder !== folder) return;
			this.baselines.set(path, words);
		}
	}

	/** Whether `path` is a manuscript of the active novel. */
	isWatched(path: string): boolean {
		return this.baselines.has(path);
	}

	/**
	 * An edit in the editor that the author did not type, as net words
	 * (inserted minus removed). Call it when the edit happens, before the
	 * file is saved.
	 */
	noteEdit(path: string, source: EditSource, words: number): void {
		if (!words || !this.baselines.has(path)) return;
		const noted = this.noted.get(path) ?? noNotedWords();
		noted[source] += words;
		this.noted.set(path, noted);
	}

	/** A file was saved. Only watched manuscripts count. */
	onModify(path: string): Promise<void> {
		if (!this.baselines.has(path)) return this.chain;
		// Take both now: the save contains these edits, and the mark of a
		// plugin write expires while the queue waits.
		const pluginWrite = this.deps.isPluginWrite(path);
		const noted = this.noted.get(path) ?? noNotedWords();
		this.noted.delete(path);
		this.chain = this.chain
			.then(() => this.recount(path, pluginWrite, noted))
			.catch(() => undefined);
		return this.chain;
	}

	/** The stored log plus what has not been written to disk yet. */
	async readLog(): Promise<WritingLog> {
		if (!this.folder) return emptyWritingLog();
		const stored = await this.deps.readLog(this.folder);
		return mergeWritingDays(stored, [...this.pending.values()]);
	}

	async flush(): Promise<void> {
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = null;
		}
		if (!this.folder || !this.pending.size) return;
		const folder = this.folder;
		const days = [...this.pending.values()];
		this.pending.clear();
		try {
			await this.deps.addDays(folder, days);
		}
		catch {
			// Keep the counts for the next try instead of losing them.
			if (this.folder === folder) this.addPending(days);
		}
	}

	private async recount(path: string, pluginWrite: boolean, noted: NotedWords): Promise<void> {
		const before = this.baselines.get(path);
		if (before === undefined) return;
		const words = countProseWords((await this.deps.readText(path)) ?? '');
		if (!this.baselines.has(path)) return;
		this.baselines.set(path, words);
		const delta = words - before;
		if (!delta && !noted.generated && !noted.pasted) return;
		const stack = this.foreign.get(path) ?? [];
		const day = attributeSave(dayKey(this.deps.now()), delta, pluginWrite, noted, stack);
		this.foreign.set(path, stack);
		this.addPending([day]);
		this.scheduleFlush();
	}

	private addPending(days: WritingDay[]) {
		const merged = mergeWritingDays({ version: 1, days: [...this.pending.values()] }, days);
		this.pending = new Map(merged.days.map((day) => [day.date, day]));
	}

	private scheduleFlush() {
		if (this.flushTimer) clearTimeout(this.flushTimer);
		this.flushTimer = setTimeout(() => {
			this.flushTimer = null;
			void this.flush();
		}, FLUSH_DELAY_MS);
	}
}

