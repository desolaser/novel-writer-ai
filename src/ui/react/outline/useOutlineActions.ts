import { useMemo, useState } from "react";
import type NovelWriterPlugin from "../../../../main";
import type { Acto, Capitulo } from "../../../domain";
import { confirmDialog } from "../../modals/ConfirmModal";
import { isCorruptGeneration } from "./outlineGenerators";
import { OutlineGenerator } from "./outlineGenerator";
import { useNovelWriter } from "../store/novelWriterStore";

/** Operaciones de IA / batch del outline, desacopladas de la UI. */
export interface OutlineActions {
	batchBusy: boolean;
	batchStatus: string;
	generateAllMemory: () => Promise<void>;
	generateChapterMemory: (chapter: Capitulo) => Promise<void>;
	generateActSummary: (act: Acto) => Promise<void>;
	generateChapterOutline: (chapter: Capitulo) => Promise<void>;
	generateChapterOutlineByMemory: (chapter: Capitulo) => Promise<void>;
	generateAllOutlines: () => Promise<void>;
	createAllManuscripts: () => Promise<void>;
	createChapterManuscript: (chapter: Capitulo) => Promise<void>;
	generateDrafts: () => Promise<void>;
	generateSingleDraft: (chapter: Capitulo) => Promise<void>;
}

/**
 * The Outline view's AI and batch actions: progress messages and confirmations
 * around `OutlineGenerator`, which does the work (and which the chat tools use too).
 */
export function useOutlineActions(plugin: NovelWriterPlugin): OutlineActions {
	const { store, ensureCapituloArchivo, writeCapituloTexto, readCapituloTexto } =
		useNovelWriter();
	const [batchBusy, setBatchBusy] = useState(false);
	const [batchStatus, setBatchStatus] = useState("");
	const generator = useMemo(() => new OutlineGenerator(plugin), [plugin]);

	/** Runs one action with the busy flag on, reporting any error as the status. */
	async function run(start: string, action: () => Promise<void>) {
		setBatchBusy(true);
		setBatchStatus(start);
		try {
			await action();
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateActSummary(act: Acto) {
		if (!store) return;
		await run(`Summarizing act: ${act.nombre}`, async () => {
			await generator.summarizeAct(act);
			setBatchStatus(`Act summary ready: ${act.nombre}`);
		});
	}

	async function generateAllMemory() {
		await run("Generating accumulated memory...", async () => {
			const list = generator.chapters();
			for (let i = 0; i < list.length; i++) {
				await generator.refreshStoryContext(list[i]);
				setBatchStatus(`Memory: ${i + 1}/${list.length}`);
			}
			setBatchStatus(`Memory generated for ${list.length} chapters.`);
		});
	}

	async function generateChapterMemory(chapter: Capitulo) {
		await run(`Generating memory: ${chapter.nombre}`, async () => {
			await generator.refreshStoryContext(chapter);
			setBatchStatus(`Memory updated: ${chapter.nombre}`);
		});
	}

	async function generateChapterOutline(chapter: Capitulo) {
		if (!store || !chapter.archivo) return;
		await run(`Generating outline: ${chapter.nombre}`, async () => {
			const outline = await generator.outlineFromManuscript(chapter);
			setBatchStatus(outline === null
				? `The manuscript for ${chapter.nombre} is empty.`
				: `Outline updated: ${chapter.nombre}`);
		});
	}

	async function generateChapterOutlineByMemory(chapter: Capitulo) {
		if (!store) return;
		await run(`Generating outline by memory: ${chapter.nombre}`, async () => {
			await generator.outlineFromStory(chapter);
			setBatchStatus(`Outline updated: ${chapter.nombre}`);
		});
	}

	async function generateAllOutlines() {
		if (!store) return;
		await run("Generating outlines...", async () => {
			const list = generator.chapters();
			for (let i = 0; i < list.length; i++) {
				setBatchStatus(
					`Generating outline: ${i + 1}/${list.length} — ${list[i].nombre}`
				);
				if (list[i].archivo) await generator.outlineFromManuscript(list[i]);
			}
			setBatchStatus(`Outlines generated for ${list.length} chapters.`);
		});
	}

	async function createAllManuscripts() {
		if (!store) return;
		await run("Creating files...", async () => {
			const list = generator.chapters();
			for (let i = 0; i < list.length; i++) {
				await ensureCapituloArchivo(list[i].id_capitulo);
				setBatchStatus(`Creating files: ${i + 1}/${list.length}`);
			}
			setBatchStatus(`Done: ${list.length} manuscripts prepared.`);
		});
	}

	async function createChapterManuscript(chapter: Capitulo) {
		await run(`Creating manuscript: ${chapter.nombre}`, async () => {
			await ensureCapituloArchivo(chapter.id_capitulo);
			setBatchStatus(`Manuscript prepared: ${chapter.nombre}`);
		});
	}

	async function generateDrafts() {
		if (!store) return;
		try {
			generator.modelFor("writing");
		} catch (e: any) {
			setBatchStatus(e?.message ?? String(e));
			return;
		}
		const proceed = await confirmDialog(
			plugin.app,
			"Drafts will be generated only for chapters without content. Continue?"
		);
		if (!proceed) return;
		await run("Preparing drafts...", async () => {
			let draftsGenerated = 0;
			const list = generator.chapters();
			// From the Story Bible: any length in its range is fine.
			const length = await generator.draftLength();
			await generator.ensureActSummaries(setBatchStatus);
			for (let i = 0; i < list.length; i++) {
				const c = list[i];
				setBatchStatus(
					`Generating draft: ${i + 1}/${list.length} — ${c.nombre}`
				);
				await ensureCapituloArchivo(c.id_capitulo);
				const existing = await readCapituloTexto(c.id_capitulo);
				if (existing.trim()) continue;
				const text = await generator.draftText(
					c,
					length,
					({ currentWords, remainingWords }) => `${
						currentWords === 0
							? "Write the complete chapter."
							: `Approximately ${remainingWords} words remain. Continue exactly from the end of the draft.`
					} ${
						currentWords >= length.min * 0.8
							? "You are close to the target: resolve the plot and finish the chapter in this response; do not add another introduction."
							: "Do not close the chapter prematurely yet."
					}`,
					() => setBatchStatus(`The AI returned an invalid response for ${c.nombre}; the chapter was stopped.`),
				);
				if (text.trim() && !isCorruptGeneration(text)) {
					await writeCapituloTexto(c.id_capitulo, text);
					draftsGenerated++;
				}
			}
			setBatchStatus(`Done: ${draftsGenerated} drafts generated.`);
		});
	}

	async function generateSingleDraft(chapter: Capitulo) {
		if (!store) return;
		try {
			generator.modelFor("writing");
		} catch (e: any) {
			setBatchStatus(e?.message ?? String(e));
			return;
		}
		await ensureCapituloArchivo(chapter.id_capitulo);
		const existing = await readCapituloTexto(chapter.id_capitulo);
		if (
			existing.trim() &&
			!(await confirmDialog(
				plugin.app,
				`The chapter "${chapter.nombre}" already has content. It will be deleted and a draft will be generated from scratch. Continue?`
			))
		)
			return;
		await run(`Generating draft: ${chapter.nombre}`, async () => {
			await generator.ensureActSummaries(setBatchStatus);
			const length = await generator.draftLength();
			const text = await generator.draftText(
				chapter,
				length,
				({ currentWords, remainingWords }) => `Approximately ${remainingWords} words remain. ${
					currentWords >= length.min * 0.8
						? "Close the plot in this response."
						: "Keep developing the chapter without restarting it."
				}`,
				() => setBatchStatus(`The AI returned an invalid response for ${chapter.nombre}; the chapter was stopped.`),
			);
			await ensureCapituloArchivo(chapter.id_capitulo);
			await writeCapituloTexto(chapter.id_capitulo, text);
			setBatchStatus(`Draft ready: ${chapter.nombre}`);
		});
	}

	return {
		batchBusy,
		batchStatus,
		generateAllMemory,
		generateChapterMemory,
		generateActSummary,
		generateChapterOutline,
		generateChapterOutlineByMemory,
		generateAllOutlines,
		createAllManuscripts,
		createChapterManuscript,
		generateDrafts,
		generateSingleDraft,
	};
}
