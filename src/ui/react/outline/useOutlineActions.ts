import { useState } from "react";
import { useNovelWriter } from "../store/novelWriterStore";
import type NovelWriterPlugin from "../../../../main";
import type { Capitulo } from "../../../domain";
import { ApiFactory } from "../../../factories/api-factory";
import { buildScenePrompt } from "../../../context/promptBuilder";
import {
	orderedChapters,
	buildChapterMemory,
	buildOutlinePrompt,
	buildOutlineByMemoryPrompt,
	buildDraftSettings,
	makeContextExcerpt,
	isCorruptGeneration,
	normalizeOutline,
	requestDraftCompletion,
} from "./outlineGenerators";
import { buildStoryBibleBlock } from "../../../context/blueprintPrompt";

/** Operaciones de IA / batch del outline, desacopladas de la UI. */
export interface OutlineActions {
	batchBusy: boolean;
	batchStatus: string;
	generateAllMemory: () => Promise<void>;
	generateChapterMemory: (chapter: Capitulo) => Promise<void>;
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
		updateCapitulo,
		ensureCapituloArchivo,
		writeCapituloTexto,
		readCapituloTexto,
	} = useNovelWriter();
	const [batchBusy, setBatchBusy] = useState(false);
	const [batchStatus, setBatchStatus] = useState("");

	const chapters = () => orderedChapters(actos, capitulos);

	/** Escribe la memoria de un capítulo en el frontmatter de su manuscrito. */
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
		const yamlValue = memory.trim()
			? `memoryContent: |-\n${memory
					.split("\n")
					.map((line) => `  ${line}`)
					.join("\n")}`
			: 'memoryContent: ""';
		// vault.process() para read-modify-write atómico y no corromper el
		// estado del editor cuando el capítulo está abierto en Obsidian.
		await plugin.app.vault.process(file, (raw) => {
			const match = raw.match(/^---\s*[\s\S]*?---/);
			if (!match) {
				return `---\n${yamlValue}\n---\n\n${raw}`;
			}
			const body = match[0].replace(/^---\s*/, "").replace(/---\s*$/, "");
			const lines = body.split("\n");
			const kept: string[] = [];
			for (let i = 0; i < lines.length; i++) {
				if (/^\s*memoryContent\s*:/.test(lines[i])) {
					while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1]))
						i++;
					continue;
				}
				kept.push(lines[i]);
			}
			const nextFrontmatter = `---\n${kept
				.join("\n")
				.replace(/\n+$/, "")}\n${yamlValue}\n---`;
			return raw.replace(match[0], nextFrontmatter);
		});
	}

	async function generateAllMemory() {
		setBatchBusy(true);
		setBatchStatus("Generating accumulated memory...");
		try {
			const list = chapters();
			for (let i = 0; i < list.length; i++) {
				const memory = buildChapterMemory(list[i], list);
				await writeChapterMemory(list[i], memory);
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
			const memory = buildChapterMemory(chapter, chapters());
			await writeChapterMemory(chapter, memory);
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
		if (!settings.proveedor.modelo) {
			setBatchStatus("Configure a model in Settings.");
			return;
		}

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
				settings.proveedor.id,
				settings.apiToken[settings.proveedor.id] ?? ""
			);
			const result = await requestDraftCompletion(
				api,
				prompt,
				settings.proveedor.modelo,
				800,
				settings.aiOptions.temperature,
				settings.aiOptions.topP
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
		if (!settings.proveedor.modelo) {
			setBatchStatus("Configure a model in Settings.");
			return;
		}

		setBatchBusy(true);
		setBatchStatus(`Generating outline by memory: ${chapter.nombre}`);

		try {
			const list = chapters();
			const chapterIndex = list.findIndex((c) => c.id_capitulo === chapter.id_capitulo);
			const previousOutlines = list
				.slice(0, Math.max(0, chapterIndex))
				.filter((c) => c.outline?.trim())
				.map((c) => `${c.nombre}:\n${c.outline.trim()}`)
				.join("\n\n===\n\n");

			const blueprint = await store.readBlueprint();
			const storyBible = buildStoryBibleBlock(blueprint);

			const prompt = buildOutlineByMemoryPrompt(chapter, previousOutlines, storyBible, blueprint);
			const api = new ApiFactory().createApi(
				settings.proveedor.id,
				settings.apiToken[settings.proveedor.id] ?? ""
			);
			const result = await requestDraftCompletion(
				api,
				prompt,
				settings.proveedor.modelo,
				800,
				settings.aiOptions.temperature,
				settings.aiOptions.topP
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
		const manuscript = await readCapituloTexto(chapter.id_capitulo);
		if (!manuscript.trim()) return;
		const prompt = buildOutlinePrompt(chapter, manuscript);
		const api = new ApiFactory().createApi(
			settings.proveedor.id,
			settings.apiToken[settings.proveedor.id] ?? ""
		);
		const result = await requestDraftCompletion(
			api,
			prompt,
			settings.proveedor.modelo,
			800,
			settings.aiOptions.temperature,
			settings.aiOptions.topP
		);
		const outline = normalizeOutline(result.text ?? "");
		if (outline) await updateCapitulo(chapter.id_capitulo, { outline });
	}

	async function generateAllOutlines() {
		if (!store) return;
		if (!plugin.settings.data.proveedor.modelo) {
			setBatchStatus("Configure a model in Settings.");
			return;
		}
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
		if (!settings.proveedor.modelo) {
			alert("Configure a model in Settings.");
			return;
		}
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
				settings.proveedor.id,
				settings.apiToken[settings.proveedor.id] ?? ""
			);
			const list = chapters();
			const draftSettings = buildDraftSettings(settings);
			for (let i = 0; i < list.length; i++) {
				const c = list[i];
				setBatchStatus(
					`Generating draft: ${i + 1}/${list.length} — ${c.nombre}`
				);
				await ensureCapituloArchivo(c.id_capitulo);
				const existing = await readCapituloTexto(c.id_capitulo);
				if (existing.trim()) continue;
				// Memoria de capítulos anteriores para dar contexto.
				const chapterMemory = buildChapterMemory(c, list);
				await writeChapterMemory(c, chapterMemory);
				// Contexto histórico: outlines y contenido real de capítulos previos.
				const prevContextParts: string[] = [];
				for (let j = 0; j < i; j++) {
					const prev = list[j];
					const prevText = await readCapituloTexto(prev.id_capitulo);
					if (prevText.trim() && !isCorruptGeneration(prevText)) {
						prevContextParts.push(
							`Chapter ${prev.nombre}: ${makeContextExcerpt(prevText)}`
						);
					}
				}
				const historicalContext = prevContextParts.join("\n\n");
				let text = "";
				let attempts = 0;
				while (
					attempts++ < 12 &&
					text.trim().split(/\s+/).filter(Boolean).length <
						targetWords * 0.95
				) {
					const currentWords = text
						.trim()
						.split(/\s+/)
						.filter(Boolean).length;
					const remainingWords = Math.max(100, targetWords - currentWords);
					const prompt = `${await buildScenePrompt(
						plugin.app,
						store.activeFolderPath!,
						draftSettings,
						c.outline ?? "",
						text,
						historicalContext,
						targetWords
					)}\n\n[Length control]\nThe current draft has ${currentWords} words and the target is ${targetWords}. ${
						currentWords === 0
							? "Write the complete chapter."
							: `Approximately ${remainingWords} words remain. Continue exactly from the end of the draft.`
					} ${
						currentWords >= targetWords * 0.8
							? "You are close to the target: resolve the plot and finish the chapter in this response; do not add another introduction."
							: "Do not close the chapter prematurely yet."
					}`;
					const requestTokens = Math.max(
						512,
						Math.min(Math.ceil(remainingWords * 1.5) + 200, 8192)
					);
					const result = await requestDraftCompletion(
						api,
						prompt,
						settings.proveedor.modelo,
						requestTokens,
						settings.aiOptions.temperature,
						settings.aiOptions.topP
					);
					const addition = result.text ?? "";
					if (!addition.trim()) break;
					if (isCorruptGeneration(addition)) {
						setBatchStatus(
							`The AI returned an invalid response for ${c.nombre}; the chapter was stopped.`
						);
						break;
					}
					text += `${text ? "\n\n" : ""}${addition}`;
				}
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
		if (!settings.proveedor.modelo) {
			alert("Configure a model in Settings.");
			return;
		}
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
			const list = chapters();
			// Memoria de capítulos anteriores para dar contexto.
			const chapterMemory = buildChapterMemory(chapter, list);
			await writeChapterMemory(chapter, chapterMemory);
			// Contexto histórico del contenido real de capítulos previos.
			const historyParts: string[] = [];
			for (const c of list) {
				if (c.id_capitulo === chapter.id_capitulo) break;
				const prevText = await readCapituloTexto(c.id_capitulo);
				if (prevText.trim() && !isCorruptGeneration(prevText))
					historyParts.push(
						`Chapter ${c.nombre}: ${makeContextExcerpt(prevText)}`
					);
			}
			const historicalContext = historyParts.join("\n\n");
			const draftSettings = buildDraftSettings(settings);
			const api = new ApiFactory().createApi(
				settings.proveedor.id,
				settings.apiToken[settings.proveedor.id] ?? ""
			);
			let text = "";
			let attempts = 0;
			while (
				attempts++ < 12 &&
				text.trim().split(/\s+/).filter(Boolean).length <
					targetWords * 0.95
			) {
				const currentWords = text
					.trim()
					.split(/\s+/)
					.filter(Boolean).length;
				const remainingWords = Math.max(100, targetWords - currentWords);
				const prompt = `${await buildScenePrompt(
					plugin.app,
					store.activeFolderPath!,
					draftSettings,
					chapter.outline ?? "",
					text,
					historicalContext,
					targetWords
				)}\n\n[Length control]\nThe current draft has ${currentWords} words and the target is ${targetWords}. Approximately ${remainingWords} words remain. ${
					currentWords >= targetWords * 0.8
						? "Close the plot in this response."
						: "Keep developing the chapter without restarting it."
				}`;
				const result = await requestDraftCompletion(
					api,
					prompt,
					settings.proveedor.modelo,
					Math.max(512, Math.min(Math.ceil(remainingWords * 1.5) + 200, 8192)),
					settings.aiOptions.temperature,
					settings.aiOptions.topP
				);
				const addition = result.text ?? "";
				if (!addition.trim()) break;
				if (isCorruptGeneration(addition)) {
					setBatchStatus(
						`The AI returned an invalid response for ${chapter.nombre}; the chapter was stopped.`
					);
					break;
				}
				text += `${text ? "\n\n" : ""}${addition}`;
			}
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
		generateChapterOutline,
		generateChapterOutlineByMemory,
		generateAllOutlines,
		createAllManuscripts,
		createChapterManuscript,
		generateDrafts,
		generateSingleDraft,
	};
}
