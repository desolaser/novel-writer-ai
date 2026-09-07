import { useCallback, useMemo, useRef, useState } from "react";
import { Notice } from "obsidian";
import type NovelWriterPlugin from "../../../../../main";
import type { NovelBlueprint } from "../../../../domain";
import type { PacingSuggestion } from "../../../../constants/structures";
import {
	buildActOutlinePrompt,
	buildPreviouslyBlock,
	type BlueprintPromptContext,
} from "../../../../context/blueprintPrompt";
import { matchChapterOutlines } from "../../../../utils/blueprintParsing";
import {
	countChapters,
	parseStructureMarkdown,
	renderStructureMarkdown,
	type BlueprintAct,
} from "../../../../utils/structureMarkdown";
import { activeOutputBudget, runBlueprintCompletion } from "./runCompletion";

export interface BlueprintOutlineController {
	busy: boolean;
	/** Progress and result line shown under the structure. */
	status: string;
	/** Chapters that still have no outline. */
	missing: number;
	total: number;
	generate: () => Promise<void>;
	cancel: () => void;
}

/**
 * Output tokens reserved per chapter: an outline is 80 to 120 words, and the
 * header plus the slack a model takes when it runs long fit in the rest.
 */
const TOKENS_PER_CHAPTER = 220;
/** Room for the headers and whatever preamble a model insists on adding. */
const TOKENS_OVERHEAD = 300;
/** Ceiling per request even when the model allows more: long answers drift. */
const MAX_CHAPTERS_PER_BATCH = 8;
/** Used when the active model does not declare an output budget. */
const FALLBACK_BUDGET = 4096;

/** Chapters per request that fit in the output budget of the active model. */
export function batchSizeFor(budget: number): number {
	const usable = (budget > 0 ? budget : FALLBACK_BUDGET) - TOKENS_OVERHEAD;
	const fits = Math.floor(usable / TOKENS_PER_CHAPTER);
	return Math.max(1, Math.min(MAX_CHAPTERS_PER_BATCH, fits));
}

/**
 * Splits `total` items into groups of at most `maxSize`, as evenly as possible.
 * Even groups avoid a trailing batch of one chapter, which reads as an
 * afterthought because the model gets almost no room to place it.
 */
export function splitEvenly(total: number, maxSize: number): number[] {
	if (total <= 0) return [];
	const groups = Math.max(1, Math.ceil(total / Math.max(1, maxSize)));
	const base = Math.floor(total / groups);
	const extra = total % groups;
	return Array.from({ length: groups }, (_, index) => base + (index < extra ? 1 : 0));
}

/** One request: the chapters of an act, by their position inside it. */
interface OutlineBatch {
	actIndex: number;
	positions: number[];
}

/** Groups the chapters that need an outline into requests that fit the budget. */
export function planBatches(
	acts: BlueprintAct[],
	rewriteAll: boolean,
	maxSize: number,
): OutlineBatch[] {
	const batches: OutlineBatch[] = [];
	acts.forEach((act, actIndex) => {
		const pending = act.capitulos
			.map((chapter, position) => ({ chapter, position }))
			.filter((item) => rewriteAll || !item.chapter.outline.trim())
			.map((item) => item.position);
		let cursor = 0;
		for (const size of splitEvenly(pending.length, maxSize)) {
			batches.push({ actIndex, positions: pending.slice(cursor, cursor + size) });
			cursor += size;
		}
	});
	return batches;
}

function cloneActs(acts: BlueprintAct[]): BlueprintAct[] {
	return acts.map((act) => ({ ...act, capitulos: act.capitulos.map((chapter) => ({ ...chapter })) }));
}

/**
 * Chapter outlines, generated in batches.
 *
 * A single request per act came back truncated on long acts: thirty chapters
 * ask for more output than any provider returns in one answer. Requests are
 * sized from the output budget of the active model instead, each one seeing what
 * the previous ones produced. Results are written into the structure markdown as
 * they arrive, so the author reviews before applying.
 */
export function useBlueprintOutline(
	plugin: NovelWriterPlugin,
	blueprint: NovelBlueprint | null,
	pacing: PacingSuggestion,
	instructions: string,
	setStructureMarkdown: (markdown: string) => void,
): BlueprintOutlineController {
	const [busy, setBusy] = useState(false);
	const [status, setStatus] = useState("");
	const cancelled = useRef(false);

	const acts = useMemo(
		() => parseStructureMarkdown(blueprint?.structureMarkdown ?? ""),
		[blueprint?.structureMarkdown]
	);
	const total = countChapters(acts);
	const missing = acts.reduce(
		(count, act) => count + act.capitulos.filter((chapter) => !chapter.outline.trim()).length,
		0
	);

	const cancel = useCallback(() => {
		cancelled.current = true;
		setStatus("Stopping after the current batch...");
	}, []);

	const generate = useCallback(async () => {
		if (!blueprint || busy) return;
		if (!blueprint.description.trim()) {
			new Notice("Write the description first: the outlines are based on it.");
			return;
		}
		const working = cloneActs(acts);
		if (!working.length) {
			new Notice("The structure is empty: it needs at least one act with one chapter.");
			return;
		}
		// Everything already written is kept; running again only fills the gaps,
		// so redoing one chapter means clearing its text and pressing again.
		const rewriteAll =
			missing === 0 &&
			confirm("Every chapter already has an outline. Generate all of them again?");
		if (missing === 0 && !rewriteAll) return;

		const budget = activeOutputBudget(plugin);
		const batchSize = batchSizeFor(budget);
		if (batchSize < 3)
			new Notice(
				`The active model allows ${budget} output tokens, so outlines go ${batchSize} chapter(s) per request. Raising its max output makes this faster.`
			);

		const context: BlueprintPromptContext = { blueprint, pacing, instructions };
		setBusy(true);
		cancelled.current = false;
		let written = 0;
		const failed: string[] = [];

		/** Runs one pass over the pending chapters and reports what it wrote. */
		const runPass = async (batches: OutlineBatch[], label: string) => {
			for (let index = 0; index < batches.length; index += 1) {
				if (cancelled.current) return;
				const batch = batches[index];
				const act = working[batch.actIndex];
				const chapters = batch.positions.map((position) => act.capitulos[position]);
				if (!chapters.length) continue;

				const first = batch.positions[0] + 1;
				const last = batch.positions[batch.positions.length - 1] + 1;
				setStatus(
					`${label} ${index + 1}/${batches.length} — ${act.nombre}, chapters ${first}-${last}`
				);
				try {
					// Continuity comes from every chapter before this batch, including
					// the ones written moments ago in this same act.
					const earlier = [
						...working.slice(0, batch.actIndex).flatMap((previous) => previous.capitulos),
						...act.capitulos.slice(0, batch.positions[0]),
					];
					const prompt = buildActOutlinePrompt(context, {
						actName: act.nombre,
						actPurpose: act.purpose,
						actIndex: batch.actIndex,
						totalActs: working.length,
						chapters: chapters.map((chapter) => chapter.nombre),
						previously: buildPreviouslyBlock(earlier),
						batchStart: first,
						actChapters: act.capitulos.length,
					});
					const answer = await runBlueprintCompletion(
						plugin,
						prompt,
						TOKENS_OVERHEAD + chapters.length * TOKENS_PER_CHAPTER
					);
					const outlines = matchChapterOutlines(
						answer,
						chapters.map((chapter) => chapter.nombre)
					);
					outlines.forEach((outline, target) => {
						act.capitulos[batch.positions[target]].outline = outline;
						written += 1;
					});
					// Written batch by batch so a later failure never loses what came back.
					setStructureMarkdown(renderStructureMarkdown(working));
				} catch (error: any) {
					failed.push(`${act.nombre} ${first}-${last}: ${error?.message ?? String(error)}`);
				}
			}
		};

		try {
			await runPass(planBatches(working, rewriteAll, batchSize), "Batch");

			// Second pass for whatever came back empty: a model that ignored part of
			// a batch usually answers when asked for fewer chapters at a time. A pass
			// that wrote nothing and only failed is a broken setup, not a long answer,
			// so retrying it would just repeat the same error.
			if (!cancelled.current && !(written === 0 && failed.length > 0)) {
				const retry = planBatches(working, false, Math.max(1, Math.floor(batchSize / 2)));
				if (retry.length) await runPass(retry, "Retry");
			}

			const stillMissing = working.reduce(
				(count, act) => count + act.capitulos.filter((chapter) => !chapter.outline.trim()).length,
				0
			);
			const parts = [`${written} chapter outlines written.`];
			if (cancelled.current) parts.push("Stopped by you.");
			else if (stillMissing > 0) parts.push(`${stillMissing} chapter(s) still empty.`);
			if (failed.length) parts.push(`${failed.length} batch(es) failed: ${failed.join(" | ")}`);
			setStatus(parts.join(" "));
		} finally {
			setBusy(false);
			cancelled.current = false;
		}
	}, [blueprint, busy, acts, missing, pacing, instructions, plugin, setStructureMarkdown]);

	return { busy, status, missing, total, generate, cancel };
}
