import { useState } from "react";
import { useNovelWriter } from "../store/novelWriterStore";
import type NovelWriterPlugin from "../../../../main";
import type { ModelPurpose } from "../../../types/ModelPurpose";
import type { Acto, Capitulo } from "../../../domain";
import { ApiFactory } from "../../../factories/api-factory";
import {
	orderedChapters,
	buildActSummaryPrompt,
	buildOutlinePrompt,
	buildOutlineByMemoryPrompt,
	isCorruptGeneration,
	normalizeOutline,
	requestDraftCompletion,
	generateChapterDraftText,
} from "./outlineGenerators";
import { buildStoryBibleBlock } from "../../../context/blueprintPrompt";
import { buildChapterHistory } from "../../../context/chapterHistory";
import { runModelCompletion } from "../../../context/aiCompletion";
import { getActiveModelConfig } from "../../../infrastructure/settings/active-model";

/**
 * El historial generado vive dentro del `memoryContent` del capítulo, entre estos
 * marcadores: así se puede regenerar sin borrar la memoria que escribió el autor.
 */
const MEMORY_MARKER_START = "[Novel Writer AI - Generated Story Context]";
const MEMORY_MARKER_END = "[End Novel Writer AI - Generated Story Context]";
const GENERATED_MEMORY_BLOCK =
	/\n?\[Novel Writer AI - Generated Story Context\][\s\S]*?\[End Novel Writer AI - Generated Story Context\]\n?/g;

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

export function useOutlineActions(
	plugin: NovelWriterPlugin,
	targetWords: number
): OutlineActions {
	const {
		actos,
		capitulos,
		store,
		updateActo,
		updateCapitulo,
		ensureCapituloArchivo,
		writeCapituloTexto,
		readCapituloTexto,
	} = useNovelWriter();
	const [batchBusy, setBatchBusy] = useState(false);
	const [batchStatus, setBatchStatus] = useState("");

	const chapters = () => orderedChapters(actos, capitulos);

	function modelFor(purpose: ModelPurpose) {
		try {
			const active = getActiveModelConfig(plugin.settings.data, purpose);
			if (!active.modelName) {
				throw new Error(`Configure a ${purpose} model in Settings.`);
			}
			return active;
		} catch (error) {
			setBatchStatus(String(error));
			return null;
		}
	}

	/** Historial de capítulos previos, con los límites configurados. */
	function historyFor(chapter: Capitulo | null): string {
		return buildChapterHistory(
			{
				acts: actos,
				chapters: chapters(),
				upTo: chapter?.id_capitulo ?? null,
			},
			plugin.settings.data.historyOptions
		);
	}

	/**
	 * Escribe el historial en el frontmatter del manuscrito, que es el único canal
	 * por el que llega al modelo: `buildScenePrompt` lo recoge como memoria. Va
	 * entre marcadores para no pisar lo que el autor haya escrito él mismo ahí.
	 */
	async function writeChapterMemory(chapter: Capitulo, memory: string) {
		const relativePath = await ensureCapituloArchivo(chapter.id_capitulo);
		if (!relativePath || !store?.activeFolderPath) return;
		// Resolución basada en frontmatter: sigue funcionando tras renombrar.
		const { resolveChapterFile } = await import(
			"../../../infrastructure/storage/repos/EstructuraRepo"
		);
		const file = await resolveChapterFile(
			plugin.app,
			store.activeFolderPath,
			chapter.id_capitulo,
			relativePath
		);
		if (!file) return;
		const generated = memory.trim()
			? `${MEMORY_MARKER_START}\n${memory.trim()}\n${MEMORY_MARKER_END}`
			: "";
		const toYaml = (value: string) =>
			value.trim()
				? `memoryContent: |-\n${value
						.trim()
						.split("\n")
						.map((line) => `  ${line}`)
						.join("\n")}`
				: 'memoryContent: ""';
		// vault.process() para read-modify-write atómico y no corromper el
		// estado del editor cuando el capítulo está abierto en Obsidian.
		await plugin.app.vault.process(file, (raw) => {
			const match = raw.match(/^---\s*[\s\S]*?---/);
			if (!match) {
				return `---\n${toYaml(generated)}\n---\n\n${raw}`;
			}
			const body = match[0].replace(/^---\s*/, "").replace(/---\s*$/, "");
			const lines = body.split("\n");
			const kept: string[] = [];
			const previous: string[] = [];
			for (let i = 0; i < lines.length; i++) {
				const inline = lines[i].match(/^\s*memoryContent\s*:\s*(.*)$/);
				if (inline) {
					// Un valor en la misma línea es texto del autor; un bloque `|-`
					// se continúa en las líneas indentadas que vienen detrás.
					const head = inline[1].trim().replace(/^["']|["']$/g, "");
					if (head && head !== "|-" && head !== "|" && head !== ">-")
						previous.push(head);
					while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1])) {
						i++;
						previous.push(lines[i].replace(/^\s{2}/, ""));
					}
					continue;
				}
				kept.push(lines[i]);
			}
			const authored = previous
				.join("\n")
				.replace(GENERATED_MEMORY_BLOCK, "")
				.trim();
			const nextValue = [authored, generated].filter(Boolean).join("\n\n");
			const nextFrontmatter = `---\n${kept
				.join("\n")
				.replace(/\n+$/, "")}\n${toYaml(nextValue)}\n---`;
			return raw.replace(match[0], nextFrontmatter);
		});
	}

	/** Resume un acto entero a partir de los outlines de sus capítulos. */
	async function generateActSummary(act: Acto) {
		if (!store) return;
		setBatchBusy(true);
		setBatchStatus(`Summarizing act: ${act.nombre}`);
		try {
			await summarizeAct(act);
			setBatchStatus(`Act summary ready: ${act.nombre}`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	/** Cuerpo compartido por la acción manual y la generación automática. */
	async function summarizeAct(act: Acto) {
		const own = chapters().filter(
			(c) => c.id_acto === act.id_acto && c.outline?.trim()
		);
		if (!own.length)
			throw new Error(
				`The act "${act.nombre}" has no chapter outlines to summarize yet.`
			);
		const blueprint = await store!.readBlueprint();
		const outlines = own
			.map((c) => `${c.nombre}: ${c.outline.trim()}`)
			.join("\n\n");
		const prompt = buildActSummaryPrompt(
			act,
			outlines,
			buildStoryBibleBlock(blueprint),
			blueprint
		);
		const text = await runModelCompletion(plugin, prompt, 800);
		if (isCorruptGeneration(text))
			throw new Error(`The AI returned an invalid summary for ${act.nombre}.`);
		await updateActo(act.id_acto, { resumen: normalizeOutline(text) });
	}

	/**
	 * En modo `ai-summary` los actos que caen fuera de la ventana reciente deben
	 * tener resumen, o sus capítulos desaparecen del contexto. Se generan aquí,
	 * una sola vez, justo antes de gastar el presupuesto grande de los drafts.
	 */
	async function ensureActSummaries() {
		const options = plugin.settings.data.historyOptions;
		if (options.olderChapters !== "ai-summary") return;
		const written = chapters().filter((c) => c.outline?.trim());
		const older = written.slice(
			0,
			Math.max(0, written.length - Math.max(0, options.recentChapters))
		);
		const pending = actos.filter(
			(act) =>
				!act.resumen?.trim() && older.some((c) => c.id_acto === act.id_acto)
		);
		for (const act of pending) {
			setBatchStatus(`Summarizing act: ${act.nombre}`);
			await summarizeAct(act);
		}
	}

	async function generateAllMemory() {
		setBatchBusy(true);
		setBatchStatus("Generating accumulated memory...");
		try {
			const list = chapters();
			for (let i = 0; i < list.length; i++) {
				await writeChapterMemory(list[i], historyFor(list[i]));
				setBatchStatus(`Memory: ${i + 1}/${list.length}`);
			}
			setBatchStatus(`Memory generated for ${list.length} chapters.`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateChapterMemory(chapter: Capitulo) {
		setBatchBusy(true);
		setBatchStatus(`Generating memory: ${chapter.nombre}`);
		try {
			await writeChapterMemory(chapter, historyFor(chapter));
			setBatchStatus(`Memory updated: ${chapter.nombre}`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateChapterOutline(chapter: Capitulo) {
		if (!store || !chapter.archivo) return;
		const settings = plugin.settings.data;
		const active = modelFor("utilities");
		if (!active) return;

		setBatchBusy(true);
		setBatchStatus(`Generating outline: ${chapter.nombre}`);

		try {
			const manuscript = await readCapituloTexto(chapter.id_capitulo);
			if (!manuscript.trim()) {
				setBatchStatus(`The manuscript for ${chapter.nombre} is empty.`);
				return;
			}
			const prompt = buildOutlinePrompt(chapter, manuscript);
			const api = new ApiFactory().createApi(
				active.providerId,
				settings.apiToken[active.providerId] ?? ""
			);
			const result = await requestDraftCompletion(
				api,
				prompt,
				active.modelName,
				800,
				active.options
			);
			const outline = normalizeOutline(result.text ?? "");
			if (!outline) {
				setBatchStatus(`The AI did not return an outline for ${chapter.nombre}.`);
				return;
			}
			await updateCapitulo(chapter.id_capitulo, { outline });
			setBatchStatus(`Outline updated: ${chapter.nombre}`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateChapterOutlineByMemory(chapter: Capitulo) {
		if (!store) return;
		const settings = plugin.settings.data;
		const active = modelFor("utilities");
		if (!active) return;

		setBatchBusy(true);
		setBatchStatus(`Generating outline by memory: ${chapter.nombre}`);

		try {
			const previousOutlines = historyFor(chapter);
			const blueprint = await store.readBlueprint();
			const storyBible = buildStoryBibleBlock(blueprint);

			const prompt = buildOutlineByMemoryPrompt(chapter, previousOutlines, storyBible, blueprint);
			const api = new ApiFactory().createApi(
				active.providerId,
				settings.apiToken[active.providerId] ?? ""
			);
			const result = await requestDraftCompletion(
				api,
				prompt,
				active.modelName,
				800,
				active.options
			);
			const outline = normalizeOutline(result.text ?? "");
			if (!outline) {
				setBatchStatus(`The AI did not return an outline for ${chapter.nombre}.`);
				return;
			}
			await updateCapitulo(chapter.id_capitulo, { outline });
			setBatchStatus(`Outline updated: ${chapter.nombre}`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateChapterOutlineForBatch(chapter: Capitulo) {
		if (!store || !chapter.archivo) return;
		const settings = plugin.settings.data;
		const active = modelFor("utilities");
		if (!active) return;
		const manuscript = await readCapituloTexto(chapter.id_capitulo);
		if (!manuscript.trim()) return;
		const prompt = buildOutlinePrompt(chapter, manuscript);
		const api = new ApiFactory().createApi(
			active.providerId,
			settings.apiToken[active.providerId] ?? ""
		);
		const result = await requestDraftCompletion(
			api,
			prompt,
			active.modelName,
			800,
			active.options
		);
		const outline = normalizeOutline(result.text ?? "");
		if (outline) await updateCapitulo(chapter.id_capitulo, { outline });
	}

	async function generateAllOutlines() {
		if (!store) return;
		const active = modelFor("utilities");
		if (!active) return;
		setBatchBusy(true);
		try {
			const list = chapters();
			for (let i = 0; i < list.length; i++) {
				setBatchStatus(
					`Generating outline: ${i + 1}/${list.length} — ${list[i].nombre}`
				);
				await generateChapterOutlineForBatch(list[i]);
			}
			setBatchStatus(`Outlines generated for ${list.length} chapters.`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function createAllManuscripts() {
		if (!store) return;
		setBatchBusy(true);
		setBatchStatus("Creating files...");
		try {
			const list = chapters();
			for (let i = 0; i < list.length; i++) {
				await ensureCapituloArchivo(list[i].id_capitulo);
				setBatchStatus(`Creating files: ${i + 1}/${list.length}`);
			}
			setBatchStatus(`Done: ${list.length} manuscripts prepared.`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function createChapterManuscript(chapter: Capitulo) {
		setBatchBusy(true);
		setBatchStatus(`Creating manuscript: ${chapter.nombre}`);
		try {
			await ensureCapituloArchivo(chapter.id_capitulo);
			setBatchStatus(`Manuscript prepared: ${chapter.nombre}`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateDrafts() {
		if (!store) return;
		const settings = plugin.settings.data;
		const active = modelFor("writing");
		if (!active) return;
		if (
			!confirm(
				"Drafts will be generated only for chapters without content. Continue?"
			)
		)
			return;
		setBatchBusy(true);
		let draftsGenerated = 0;
		try {
			const api = new ApiFactory().createApi(
				active.providerId,
				settings.apiToken[active.providerId] ?? ""
			);
			const list = chapters();
			await ensureActSummaries();
			for (let i = 0; i < list.length; i++) {
				const c = list[i];
				setBatchStatus(
					`Generating draft: ${i + 1}/${list.length} — ${c.nombre}`
				);
				await ensureCapituloArchivo(c.id_capitulo);
				const existing = await readCapituloTexto(c.id_capitulo);
				if (existing.trim()) continue;
				// El historial llega al prompt por la memoria del frontmatter, que es
				// su único canal; escribirlo aquí es lo que le da contexto al capítulo.
				await writeChapterMemory(c, historyFor(c));
				const text = await generateChapterDraftText(
					plugin.app,
					store.activeFolderPath!,
					api,
					active.modelName,
					active.options,
					settings,
					c.outline ?? "",
					targetWords,
					({ currentWords, remainingWords }) => `${
						currentWords === 0
							? "Write the complete chapter."
							: `Approximately ${remainingWords} words remain. Continue exactly from the end of the draft.`
					} ${
						currentWords >= targetWords * 0.8
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
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateSingleDraft(chapter: Capitulo) {
		if (!store) return;
		const settings = plugin.settings.data;
		const active = modelFor("writing");
		if (!active) return;
		setBatchBusy(true);
		setBatchStatus(`Generating draft: ${chapter.nombre}`);
		try {
			await ensureCapituloArchivo(chapter.id_capitulo);
			const existing = await readCapituloTexto(chapter.id_capitulo);
			if (
				existing.trim() &&
				!confirm(
					`The chapter "${chapter.nombre}" already has content. It will be deleted and a draft will be generated from scratch. Continue?`
				)
			)
				return;
			await ensureActSummaries();
			// El historial llega al prompt por la memoria del frontmatter, que es
			// su único canal; escribirlo aquí es lo que le da contexto al capítulo.
			await writeChapterMemory(chapter, historyFor(chapter));
			const api = new ApiFactory().createApi(
				active.providerId,
				settings.apiToken[active.providerId] ?? ""
			);
			const text = await generateChapterDraftText(
				plugin.app,
				store.activeFolderPath!,
				api,
				active.modelName,
				active.options,
				settings,
				chapter.outline ?? "",
				targetWords,
				({ currentWords, remainingWords }) => `Approximately ${remainingWords} words remain. ${
					currentWords >= targetWords * 0.8
						? "Close the plot in this response."
						: "Keep developing the chapter without restarting it."
				}`,
				() => setBatchStatus(`The AI returned an invalid response for ${chapter.nombre}; the chapter was stopped.`),
			);
			await ensureCapituloArchivo(chapter.id_capitulo);
			await writeCapituloTexto(chapter.id_capitulo, text);
			setBatchStatus(`Draft ready: ${chapter.nombre}`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
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
