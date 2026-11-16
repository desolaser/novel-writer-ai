import React, { useEffect, useState } from "react";
import { Notice } from "obsidian";
import { useShallow } from "zustand/react/shallow";
import { useNovelWriter } from "./store/novelWriterStore";
import type NovelWriterPlugin from "../../../main";
import type { Acto, Capitulo } from "../../domain";
import { useOutlineActions } from "./outline/useOutlineActions";
import { OutlineHeader } from "./outline/OutlineHeader";
import { AddActo } from "./outline/AddActo";
import { ActoSection } from "./outline/ActoSection";
import { ChapterFileModal } from "./outline/modals";
import { openNovelBlueprintModal } from "./features/blueprint/NovelBlueprintModal";
import { confirmDialog } from "../modals/ConfirmModal";

/** Outline de una columna: orquesta estado de UI y delega en componentes de `./outline`. */
export function OutlineRoot({ plugin }: { plugin: NovelWriterPlugin }) {
	const {
		actos,
		capitulos,
		createActo,
		createCapitulo,
		updateActo,
		deleteActo,
		updateCapitulo,
		deleteCapitulo,
		linkCapituloArchivo,
		store,
		novels,
	} = useNovelWriter(
		// Only what the outline renders. Without a selector every store change
		// (chat, codex, settings) re-rendered the whole outline while typing.
		useShallow((state) => ({
			actos: state.actos,
			capitulos: state.capitulos,
			createActo: state.createActo,
			createCapitulo: state.createCapitulo,
			updateActo: state.updateActo,
			deleteActo: state.deleteActo,
			updateCapitulo: state.updateCapitulo,
			deleteCapitulo: state.deleteCapitulo,
			linkCapituloArchivo: state.linkCapituloArchivo,
			store: state.store,
			novels: state.novels,
		}))
	);

	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [editingCap, setEditingCap] = useState<string | null>(null);
	const [editingAct, setEditingAct] = useState<string | null>(null);
	const [newAct, setNewAct] = useState("");
	const [addingTo, setAddingTo] = useState<string | null>(null);
	const [capName, setCapName] = useState("");
	const [openChapterMenu, setOpenChapterMenu] = useState<string | null>(null);
	const [reorderingChapter, setReorderingChapter] = useState<string | null>(null);
	const [draggedChapter, setDraggedChapter] = useState<string | null>(null);
	const [reorderingAct, setReorderingAct] = useState<string | null>(null);
	const [draggedAct, setDraggedAct] = useState<string | null>(null);
	const [collapsedActs, setCollapsedActs] = useState<Set<string>>(new Set());
	const [targetWords, setTargetWords] = useState(
		plugin.settings.data.draftWordCount || 2000
	);

	const {
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
	} = useOutlineActions(plugin, targetWords);

	useEffect(() => {
		const openChapter = (event: Event) => {
			const id = (event as CustomEvent<string>).detail;
			if (!id) return;
			setExpanded((current) => new Set(current).add(id));
			window.setTimeout(
				() =>
					document
						.querySelector(`[data-nw-chapter-id="${id}"]`)
						?.scrollIntoView({
							behavior: "smooth",
							block: "center",
						}),
				0
			);
		};
		window.addEventListener("novel-writer:open-outline-chapter", openChapter);
		return () =>
			window.removeEventListener(
				"novel-writer:open-outline-chapter",
				openChapter
			);
	}, []);

	if (novels.length === 0)
		return (
			<div className="nw-empty-state">
				<p>Create a novel to use the outline.</p>
			</div>
		);

	const toggle = (id: string) =>
		setExpanded((prev) => {
			const n = new Set(prev);
			n.has(id) ? n.delete(id) : n.add(id);
			return n;
		});

	// The fields keep their own text while the author types (AutoSaveTextarea),
	// so a save only has to persist it.
	const saveActSummary = (id: string, value: string) =>
		updateActo(id, { resumen: value });

	const saveOutline = (id: string, value: string) =>
		updateCapitulo(id, { outline: value });

	const addActo = async () => {
		if (newAct.trim()) {
			await createActo(newAct.trim());
			setNewAct("");
		}
	};

	const addCap = async (idActo: string) => {
		if (!capName.trim()) return;
		const c = await createCapitulo(
			idActo,
			capName.trim(),
			capitulos.filter((x) => x.id_acto === idActo).length
		);
		setExpanded((s) => new Set(s).add(c.id_capitulo));
		setCapName("");
		setAddingTo(null);
	};

	const closeChapterMenu = () => setOpenChapterMenu(null);

	const commitActName = (acto: Acto, name: string) => {
		if (name && name !== acto.nombre)
			void updateActo(acto.id_acto, { nombre: name });
		setEditingAct(null);
	};

	const commitCapName = (chapter: Capitulo, name: string) => {
		if (name && name !== chapter.nombre)
			// Renaming also renames the manuscript, which fails on a name collision.
			// Without this the rename was silently dropped and the old name came back.
			void updateCapitulo(chapter.id_capitulo, { nombre: name }).catch((error: any) =>
				new Notice(`Could not rename the chapter: ${error?.message ?? String(error)}`)
			);
		setEditingCap(null);
	};

	const deleteAct = async (acto: Acto) => {
		const question = `Delete act "${acto.nombre}"?`;
		if (await confirmDialog(plugin.app, question))
			await deleteActo(acto.id_acto);
	};

	const deleteChapter = async (chapter: Capitulo) => {
		closeChapterMenu();
		const question = `Delete "${chapter.nombre}"?`;
		if (await confirmDialog(plugin.app, question))
			await deleteCapitulo(chapter.id_capitulo);
	};

	const linkChapterFile = (chapter: Capitulo) => {
		closeChapterMenu();
		new ChapterFileModal(plugin.app, (file) =>
			linkCapituloArchivo(chapter.id_capitulo, file.path)
		).open();
	};

	const reorderChapters = async (sourceId: string, targetId: string) => {
		if (reorderingChapter || sourceId === targetId) return;
		const chapter = capitulos.find((item) => item.id_capitulo === sourceId);
		const targetChapter = capitulos.find(
			(item) => item.id_capitulo === targetId
		);
		if (!chapter || !targetChapter) return;

		closeChapterMenu();
		setReorderingChapter(chapter.id_capitulo);
		try {
			if (chapter.id_acto === targetChapter.id_acto) {
				const chaptersInAct = capitulos
					.filter((item) => item.id_acto === chapter.id_acto)
					.sort((first, second) => first.orden - second.orden);
				const sourceIndex = chaptersInAct.findIndex(
					(item) => item.id_capitulo === chapter.id_capitulo
				);
				const targetIndex = chaptersInAct.findIndex(
					(item) => item.id_capitulo === targetChapter.id_capitulo
				);
				const [movedChapter] = chaptersInAct.splice(sourceIndex, 1);
				chaptersInAct.splice(targetIndex, 0, movedChapter);
				for (const [orden, item] of chaptersInAct.entries()) {
					if (item.orden !== orden)
						await updateCapitulo(item.id_capitulo, { orden });
				}
			} else {
				const sourceAct = capitulos
					.filter((item) => item.id_acto === chapter.id_acto && item.id_capitulo !== chapter.id_capitulo)
					.sort((first, second) => first.orden - second.orden);
				for (const [orden, item] of sourceAct.entries()) {
					if (item.orden !== orden)
						await updateCapitulo(item.id_capitulo, { orden });
				}
				const targetAct = capitulos
					.filter((item) => item.id_acto === targetChapter.id_acto)
					.sort((first, second) => first.orden - second.orden);
				const targetIndex = targetAct.findIndex(
					(item) => item.id_capitulo === targetChapter.id_capitulo
				);
				targetAct.splice(targetIndex, 0, chapter);
				await updateCapitulo(chapter.id_capitulo, { id_acto: targetChapter.id_acto });
				for (const [orden, item] of targetAct.entries()) {
					if (item.orden !== orden)
						await updateCapitulo(item.id_capitulo, { orden });
				}
			}
		} finally {
			setReorderingChapter(null);
		}
	};

	const reorderActs = async (sourceId: string, targetId: string) => {
		if (reorderingAct || sourceId === targetId) return;
		const orderedActs = [...actos].sort(
			(first, second) => first.orden - second.orden
		);
		const sourceIndex = orderedActs.findIndex((item) => item.id_acto === sourceId);
		const targetIndex = orderedActs.findIndex((item) => item.id_acto === targetId);
		if (sourceIndex < 0 || targetIndex < 0) return;
		const [movedAct] = orderedActs.splice(sourceIndex, 1);
		orderedActs.splice(targetIndex, 0, movedAct);

		setReorderingAct(sourceId);
		try {
			for (const [orden, acto] of orderedActs.entries()) {
				if (acto.orden !== orden) await updateActo(acto.id_acto, { orden });
			}
		} finally {
			setReorderingAct(null);
		}
	};

	const toggleActCollapse = (id: string) =>
		setCollapsedActs((prev) => {
			const next = new Set(prev);
			next.has(id) ? next.delete(id) : next.add(id);
			return next;
		});

	const openChapter = (path: string) => {
		const fullPath = path.startsWith("escritura/")
			? `${store?.activeFolderPath ?? ""}/${path}`
			: path;
		void plugin.app.workspace.openLinkText(fullPath, "", false);
	};

	const onTargetWordsChange = (n: number) => {
		setTargetWords(n);
		plugin.settings.data.draftWordCount = n;
		void plugin.settings.save();
	};

	return (
		<div className="nw-outline-view nw-outline-single-column">
			<OutlineHeader
				targetWords={targetWords}
				onTargetWordsChange={onTargetWordsChange}
				batchBusy={batchBusy}
				chaptersCount={capitulos.length}
				onGenerateAllMemory={() => void generateAllMemory()}
				onGenerateAllOutlines={() => void generateAllOutlines()}
				onCreateAllManuscripts={() => void createAllManuscripts()}
				onGenerateDrafts={() => void generateDrafts()}
				onOpenSetup={() => openNovelBlueprintModal(plugin)}
			/>
			{batchStatus && (
				<div className="nw-outline-status">{batchStatus}</div>
			)}
			<AddActo value={newAct} onChange={setNewAct} onCreate={() => void addActo()} />
			{[...actos].sort((first, second) => first.orden - second.orden).map((a) => {
				const caps = capitulos
					.filter((c) => c.id_acto === a.id_acto)
					.sort((first, second) => first.orden - second.orden);
				return (
					<ActoSection
						key={a.id_acto}
						acto={a}
						chapters={caps}
						collapsed={collapsedActs.has(a.id_acto)}
						onToggleCollapse={() => toggleActCollapse(a.id_acto)}
						editingAct={editingAct === a.id_acto}
						onStartEditingAct={() => setEditingAct(a.id_acto)}
						onCommitActName={(name) => commitActName(a, name)}
						onCancelEditingAct={() => setEditingAct(null)}
						onDeleteAct={() => void deleteAct(a)}
						reorderingAct={Boolean(reorderingAct)}
						draggedAct={draggedAct}
						onDragStartAct={() => setDraggedAct(a.id_acto)}
						onDragEndAct={() => setDraggedAct(null)}
						onDropAct={() => {
							if (draggedAct) void reorderActs(draggedAct, a.id_acto);
							setDraggedAct(null);
						}}
						onSaveActSummary={(value) => saveActSummary(a.id_acto, value)}
						onGenerateActSummary={() => void generateActSummary(a)}
						expanded={expanded}
						editingCap={editingCap}
						openChapterMenu={openChapterMenu}
						batchBusy={batchBusy}
						reorderingChapter={reorderingChapter}
						draggedChapter={draggedChapter}
						onToggleChapter={toggle}
						onStartEditingCap={setEditingCap}
						onCommitCapName={commitCapName}
						onCancelEditingCap={() => setEditingCap(null)}
						onToggleChapterMenu={setOpenChapterMenu}
						onSaveOutline={saveOutline}
						onOpenManuscript={openChapter}
						onGenerateChapterOutline={(chapter) => {
							closeChapterMenu();
							void generateChapterOutline(chapter);
						}}
						onGenerateChapterOutlineByMemory={(chapter) => {
							closeChapterMenu();
							void generateChapterOutlineByMemory(chapter);
						}}
						onGenerateChapterMemory={(chapter) => {
							closeChapterMenu();
							void generateChapterMemory(chapter);
						}}
						onGenerateChapterDraft={(chapter) => {
							closeChapterMenu();
							void generateSingleDraft(chapter);
						}}
						onCreateChapterManuscript={(chapter) => {
							closeChapterMenu();
							void createChapterManuscript(chapter);
						}}
						onLinkChapterFile={linkChapterFile}
						onDeleteChapter={(chapter) => void deleteChapter(chapter)}
						onDragStartChapter={setDraggedChapter}
						onDragEndChapter={() => setDraggedChapter(null)}
						onDropChapter={(targetId) => {
							if (draggedChapter)
								void reorderChapters(draggedChapter, targetId);
							setDraggedChapter(null);
						}}
						adding={addingTo === a.id_acto}
						newChapterName={capName}
						onNewChapterNameChange={setCapName}
						onStartAddingChapter={() => {
							setAddingTo(a.id_acto);
							setCapName("");
						}}
						onCancelAddingChapter={() => setAddingTo(null)}
						onAddChapter={() => void addCap(a.id_acto)}
					/>
				);
			})}
		</div>
	);
}
