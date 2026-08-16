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
	buildDraftSettings,
	makeContextExcerpt,
	isCorruptGeneration,
	normalizeOutline,
	requestDraftCompletion,
} from "./outlineGenerators";

/** Operaciones de IA / batch del outline, desacopladas de la UI. */
export interface OutlineActions {
	batchBusy: boolean;
	batchStatus: string;
	generateAllMemory: () => Promise<void>;
	generateChapterMemory: (chapter: Capitulo) => Promise<void>;
	generateChapterOutline: (chapter: Capitulo) => Promise<void>;
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
		setBatchStatus("Generando memoria acumulada...");
		try {
			const list = chapters();
			for (let i = 0; i < list.length; i++) {
				const memory = buildChapterMemory(list[i], list);
				await writeChapterMemory(list[i], memory);
				setBatchStatus(`Memoria: ${i + 1}/${list.length}`);
			}
			setBatchStatus(`Memoria generada para ${list.length} capítulos.`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function generateChapterMemory(chapter: Capitulo) {
		setBatchBusy(true);
		setBatchStatus(`Generando memoria: ${chapter.nombre}`);
		try {
			const memory = buildChapterMemory(chapter, chapters());
			await writeChapterMemory(chapter, memory);
			setBatchStatus(`Memoria actualizada: ${chapter.nombre}`);
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
			setBatchStatus("Configura un modelo en Settings.");
			return;
		}

		setBatchBusy(true);
		setBatchStatus(`Generando outline: ${chapter.nombre}`);

		try {
			const manuscript = await readCapituloTexto(chapter.id_capitulo);
			if (!manuscript.trim()) {
				setBatchStatus(`El manuscrito de ${chapter.nombre} está vacío.`);
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
				setBatchStatus(`La IA no devolvió un outline para ${chapter.nombre}.`);
				return;
			}
			await updateCapitulo(chapter.id_capitulo, { outline });
			setBatchStatus(`Outline actualizado: ${chapter.nombre}`);
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
			setBatchStatus("Configura un modelo en Settings.");
			return;
		}
		setBatchBusy(true);
		try {
			const list = chapters();
			for (let i = 0; i < list.length; i++) {
				setBatchStatus(
					`Generando outline: ${i + 1}/${list.length} — ${list[i].nombre}`
				);
				await generateChapterOutlineForBatch(list[i]);
			}
			setBatchStatus(`Outlines generados para ${list.length} capítulos.`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function createAllManuscripts() {
		if (!store) return;
		setBatchBusy(true);
		setBatchStatus("Creando archivos...");
		try {
			const list = chapters();
			for (let i = 0; i < list.length; i++) {
				await ensureCapituloArchivo(list[i].id_capitulo);
				setBatchStatus(`Creando archivos: ${i + 1}/${list.length}`);
			}
			setBatchStatus(`Listo: ${list.length} manuscritos preparados.`);
		} catch (e: any) {
			setBatchStatus("Error: " + (e?.message ?? String(e)));
		} finally {
			setBatchBusy(false);
		}
	}

	async function createChapterManuscript(chapter: Capitulo) {
		setBatchBusy(true);
		setBatchStatus(`Creando manuscrito: ${chapter.nombre}`);
		try {
			await ensureCapituloArchivo(chapter.id_capitulo);
			setBatchStatus(`Manuscrito preparado: ${chapter.nombre}`);
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
			alert("Configura un modelo en Settings.");
			return;
		}
		if (
			!confirm(
				"Se generarán drafts solamente para capítulos sin contenido. ¿Continuar?"
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
					`Generando draft: ${i + 1}/${list.length} — ${c.nombre}`
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
							`Capítulo ${prev.nombre}: ${makeContextExcerpt(prevText)}`
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
					)}\n\n[Control de extensión]\nEl draft actual tiene ${currentWords} palabras y el objetivo es ${targetWords}. ${
						currentWords === 0
							? "Escribe el capítulo completo."
							: `Faltan aproximadamente ${remainingWords} palabras. Continúa exactamente desde el final del draft.`
					} ${
						currentWords >= targetWords * 0.8
							? "Estás cerca del objetivo: resuelve la trama y termina el capítulo en esta respuesta; no agregues otra introducción."
							: "Todavía no cierres prematuramente el capítulo."
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
							`La IA devolvió una respuesta inválida para ${c.nombre}; se detuvo el capítulo.`
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
			setBatchStatus(`Listo: ${draftsGenerated} drafts generados.`);
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
			alert("Configura un modelo en Settings.");
			return;
		}
		setBatchBusy(true);
		setBatchStatus(`Generando draft: ${chapter.nombre}`);
		try {
			await ensureCapituloArchivo(chapter.id_capitulo);
			const existing = await readCapituloTexto(chapter.id_capitulo);
			if (
				existing.trim() &&
				!confirm(
					`El capítulo "${chapter.nombre}" ya tiene contenido. Se borrará y se generará un draft desde cero. ¿Continuar?`
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
						`Capítulo ${c.nombre}: ${makeContextExcerpt(prevText)}`
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
				)}\n\n[Control de extensión]\nEl draft actual tiene ${currentWords} palabras y el objetivo es ${targetWords}. Faltan aproximadamente ${remainingWords} palabras. ${
					currentWords >= targetWords * 0.8
						? "Cierra la trama en esta respuesta."
						: "Continúa desarrollando el capítulo sin reiniciarlo."
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
						`La IA devolvió una respuesta inválida para ${chapter.nombre}; se detuvo el capítulo.`
					);
					break;
				}
				text += `${text ? "\n\n" : ""}${addition}`;
			}
			await ensureCapituloArchivo(chapter.id_capitulo);
			await writeCapituloTexto(chapter.id_capitulo, text);
			setBatchStatus(`Draft listo: ${chapter.nombre}`);
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
		generateAllOutlines,
		createAllManuscripts,
		createChapterManuscript,
		generateDrafts,
		generateSingleDraft,
	};
}
