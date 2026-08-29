import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "obsidian";
import type NovelWriterPlugin from "../../../../../main";
import { useNovelWriter } from "../../store/novelWriterStore";
import type { Acto, BlueprintField, Capitulo, NovelBlueprint } from "../../../../domain";
import { createEmptyBlueprint } from "../../../../domain";
import {
	STRUCTURE_TEMPLATES,
	getStructureTemplate,
	suggestChapterLength,
} from "../../../../constants/structures";
import type { AcceptedDeduction } from "./useBlueprintAi";
import {
	BlueprintAct,
	buildStructureFromTemplate,
	countChapters,
	minChaptersFor,
	parseStructureMarkdown,
	renderStructureMarkdown,
} from "../../../../utils/structureMarkdown";

/** Turns the stored structure into the shape the markdown renderer expects. */
function toBlueprintActs(actos: Acto[], capitulos: Capitulo[]): BlueprintAct[] {
	return [...actos]
		.sort((first, second) => first.orden - second.orden)
		.map((acto) => ({
			nombre: acto.nombre,
			purpose: "",
			capitulos: capitulos
				.filter((chapter) => chapter.id_acto === acto.id_acto)
				.sort((first, second) => first.orden - second.orden)
				.map((chapter) => ({ nombre: chapter.nombre, outline: chapter.outline ?? "" })),
		}));
}

/**
 * True once the author put something of their own in the structure. A brand new
 * novel starts with a single empty chapter, which is not worth protecting.
 */
export function hasAuthoredStructure(actos: Acto[], capitulos: Capitulo[]): boolean {
	if (actos.length > 1 || capitulos.length > 1) return true;
	return capitulos.some((chapter) => (chapter.outline ?? "").trim() || chapter.archivo);
}

export interface BlueprintController {
	blueprint: NovelBlueprint | null;
	busy: boolean;
	/** Chapters actually written in the markdown, which may differ from `chapterCount`. */
	markdownChapters: number;
	minChapters: number;
	/** Chapter length the pacing table suggests for the current platform and genre. */
	suggestion: ReturnType<typeof suggestChapterLength>;
	setField: <K extends keyof NovelBlueprint>(key: K, value: NovelBlueprint[K]) => void;
	/** Writes accepted AI deductions and badges those fields as deduced. */
	acceptDeductions: (accepted: AcceptedDeduction[]) => void;
	setStructure: (id: string) => void;
	setChapterCount: (count: number) => void;
	setStructureMarkdown: (markdown: string) => void;
	useSuggestedLength: () => void;
	rebuildStructure: () => void;
	apply: () => Promise<void>;
}

/**
 * State of the blueprint modal: loads it, keeps the structure markdown in sync
 * with the form, saves with a debounce and applies the result to the outline.
 */
export function useBlueprint(plugin: NovelWriterPlugin, close: () => void): BlueprintController {
	const { store, activeNovelId, novels, actos, capitulos, replaceEstructura, updateNovel } =
		useNovelWriter();
	const [blueprint, setBlueprint] = useState<NovelBlueprint | null>(null);
	/** Latest blueprint, for callbacks that outlive the render they were created in. */
	const latest = useRef<NovelBlueprint | null>(null);
	latest.current = blueprint;
	const [busy, setBusy] = useState(false);
	const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	// The structure is only seeded once per novel; later edits must not be overwritten.
	const loadedFor = useRef<string | null>(null);

	// Loading depends only on the novel: the structure is read once, with
	// getState(), instead of being a dependency. Subscribing to it would restart
	// this effect whenever something else reloads the store, and a restart while
	// the first read is still in flight would leave the modal loading forever.
	useEffect(() => {
		if (!store?.activeFolderPath || !activeNovelId) return;
		if (loadedFor.current === activeNovelId) return;
		loadedFor.current = activeNovelId;
		void (async () => {
			try {
				const state = useNovelWriter.getState();
				const novela = state.novels.find(
					(item) => item.novela.id_novela === activeNovelId
				)?.novela;
				const stored = await store.readBlueprint();
				const next = stored ?? createEmptyBlueprint(activeNovelId, novela?.nombre ?? "");
				if (!next.structureMarkdown.trim()) {
					const current = toBlueprintActs(state.actos, state.capitulos);
					if (current.length && hasAuthoredStructure(state.actos, state.capitulos)) {
						// The novel already has a structure: show it instead of a template.
						next.structureMarkdown = renderStructureMarkdown(current);
						next.chapterCount = countChapters(current);
						next.structureEdited = true;
					} else {
						const template = getStructureTemplate(next.structure) ?? STRUCTURE_TEMPLATES[0];
						next.structureMarkdown = renderStructureMarkdown(
							buildStructureFromTemplate(template, next.chapterCount)
						);
					}
				}
				setBlueprint(next);
			} catch (error: any) {
				// Let a later render retry instead of staying stuck on the loading state.
				loadedFor.current = null;
				new Notice(`Could not load the blueprint: ${error?.message ?? String(error)}`);
			}
		})();
	}, [store, activeNovelId]);

	// Edits are saved with a debounce, so closing the modal has to write whatever
	// is still pending instead of dropping the last keystrokes.
	const pending = useRef<NovelBlueprint | null>(null);
	const flush = useRef<() => void>(() => undefined);
	flush.current = () => {
		if (saveTimer.current) clearTimeout(saveTimer.current);
		saveTimer.current = null;
		const next = pending.current;
		pending.current = null;
		if (next) void store?.writeBlueprint(next);
	};

	useEffect(() => () => flush.current(), []);

	const persist = useCallback(
		(next: NovelBlueprint) => {
			pending.current = next;
			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = setTimeout(() => {
				saveTimer.current = null;
				pending.current = null;
				void store?.writeBlueprint(next);
			}, 600);
		},
		[store]
	);

	const commit = useCallback(
		(next: NovelBlueprint) => {
			setBlueprint(next);
			persist(next);
		},
		[persist]
	);

	const setField = useCallback(
		<K extends keyof NovelBlueprint>(key: K, value: NovelBlueprint[K]) => {
			if (!blueprint) return;
			// Editing a field by hand makes it the author's decision again, so it
			// stops being reported as deduced.
			const inferred = blueprint.inferred.filter((field) => String(field) !== String(key));
			commit({ ...blueprint, [key]: value, inferred });
		},
		[blueprint, commit]
	);

	/**
	 * Applies accepted deductions in a single write and badges those fields. They
	 * arrive as a batch because applying them one by one would make every write
	 * start from the same blueprint and only the last one would survive.
	 */
	const acceptDeductions = useCallback(
		(accepted: AcceptedDeduction[]) => {
			if (!blueprint || accepted.length === 0) return;
			let next: NovelBlueprint = { ...blueprint };
			const inferred = new Set<BlueprintField>(blueprint.inferred);
			for (const item of accepted) {
				next = { ...next, ...item.patch };
				inferred.add(item.field);
			}
			commit({ ...next, inferred: Array.from(inferred) });
		},
		[blueprint, commit]
	);

	/** Re-renders the markdown from the template, keeping the chapters already written. */
	const rebuild = useCallback((source: NovelBlueprint): NovelBlueprint => {
		const template = getStructureTemplate(source.structure) ?? STRUCTURE_TEMPLATES[0];
		const previous = parseStructureMarkdown(source.structureMarkdown);
		return {
			...source,
			structureMarkdown: renderStructureMarkdown(
				buildStructureFromTemplate(template, source.chapterCount, previous)
			),
			structureEdited: false,
		};
	}, []);

	/**
	 * Re-lays out the structure only when nothing would be lost. Hand edits are
	 * left alone here on purpose: this runs from field changes, and the chapter
	 * count commits on blur, so opening a native dialog would swallow the click
	 * that was moving focus into the markdown textarea and leave it unfocused.
	 * Replacing hand edits is the job of the explicit Rebuild button.
	 */
	const rebuildIfClean = useCallback(
		(source: NovelBlueprint): NovelBlueprint =>
			source.structureEdited ? source : rebuild(source),
		[rebuild]
	);

	const setStructure = useCallback(
		(id: string) => {
			if (!blueprint) return;
			const template = getStructureTemplate(id) ?? STRUCTURE_TEMPLATES[0];
			const minimum = minChaptersFor(template);
			const chapterCount = Math.max(minimum, blueprint.chapterCount);
			if (chapterCount !== blueprint.chapterCount)
				new Notice(`"${template.nombre}" needs at least ${minimum} chapters.`);
			commit(rebuildIfClean({ ...blueprint, structure: id, chapterCount }));
		},
		[blueprint, commit, rebuildIfClean]
	);

	const setChapterCount = useCallback(
		(count: number) => {
			if (!blueprint) return;
			const template = getStructureTemplate(blueprint.structure) ?? STRUCTURE_TEMPLATES[0];
			const chapterCount = Math.max(minChaptersFor(template), Math.min(300, Math.round(count) || 1));
			commit(rebuildIfClean({ ...blueprint, chapterCount }));
		},
		[blueprint, commit, rebuildIfClean]
	);

	// Reads the blueprint from the ref instead of the closure: outline generation
	// writes the markdown once per act across awaits, and a value captured several
	// renders ago would undo whatever the author edited meanwhile.
	const setStructureMarkdown = useCallback(
		(markdown: string) => {
			const current = latest.current;
			if (!current) return;
			commit({ ...current, structureMarkdown: markdown, structureEdited: true });
		},
		[commit]
	);

	/**
	 * Explicit rebuild. Safe to confirm here: it runs from a button click, not
	 * from a blur, so no pending focus change is lost to the dialog.
	 */
	const rebuildStructure = useCallback(() => {
		if (!blueprint) return;
		if (
			blueprint.structureEdited &&
			!confirm("The structure was edited by hand. Rebuild it and discard those edits?")
		)
			return;
		commit(rebuild(blueprint));
	}, [blueprint, commit, rebuild]);

	const suggestion = useMemo(
		() => suggestChapterLength(blueprint?.audience ?? "undefined", blueprint?.genre ?? ""),
		[blueprint?.audience, blueprint?.genre]
	);

	const useSuggestedLength = useCallback(() => {
		// Taking the table value is the author picking it, not a deduction.
		setField("wordsPerChapter", { ...suggestion.range });
	}, [setField, suggestion]);

	const markdownChapters = useMemo(
		() => countChapters(parseStructureMarkdown(blueprint?.structureMarkdown ?? "")),
		[blueprint?.structureMarkdown]
	);

	const minChapters = useMemo(
		() => minChaptersFor(getStructureTemplate(blueprint?.structure ?? "") ?? STRUCTURE_TEMPLATES[0]),
		[blueprint?.structure]
	);

	const apply = useCallback(async () => {
		if (!blueprint || !store) return;
		const parsed = parseStructureMarkdown(blueprint.structureMarkdown);
		if (!parsed.length) {
			new Notice("The structure is empty: it needs at least one act with one chapter.");
			return;
		}
		if (
			hasAuthoredStructure(actos, capitulos) &&
			!confirm(
				`This replaces the current structure (${actos.length} acts, ${capitulos.length} chapters) with ${parsed.length} acts and ${countChapters(parsed)} chapters.\n\nManuscript files are not deleted, and chapters that keep their name keep their file. Continue?`
			)
		)
			return;

		setBusy(true);
		try {
			await replaceEstructura(
				parsed.map((act) => ({
					nombre: act.nombre,
					capitulos: act.capitulos.map((chapter) => ({
						nombre: chapter.nombre,
						outline: chapter.outline,
					})),
				}))
			);

			const novela = novels.find((item) => item.novela.id_novela === activeNovelId)?.novela;
			const title = blueprint.title.trim();
			if (novela && title && title !== novela.nombre)
				await updateNovel(novela.id_novela, { nombre: title, autor: novela.autor });

			// The outline uses this as the target length of generated drafts.
			plugin.settings.data.draftWordCount = Math.round(
				(blueprint.wordsPerChapter.min + blueprint.wordsPerChapter.max) / 2
			);
			await plugin.settings.save();

			if (saveTimer.current) clearTimeout(saveTimer.current);
			saveTimer.current = null;
			pending.current = null;
			await store.writeBlueprint(blueprint);
			new Notice(
				`Structure applied: ${parsed.length} acts, ${countChapters(parsed)} chapters.`
			);
			close();
		} catch (error: any) {
			new Notice(`Could not apply the structure: ${error?.message ?? String(error)}`);
		} finally {
			setBusy(false);
		}
	}, [blueprint, store, actos, capitulos, replaceEstructura, novels, activeNovelId, updateNovel, plugin, close]);

	return {
		blueprint,
		busy,
		markdownChapters,
		minChapters,
		suggestion,
		setField,
		acceptDeductions,
		setStructure,
		setChapterCount,
		setStructureMarkdown,
		useSuggestedLength,
		rebuildStructure,
		apply,
	};
}
