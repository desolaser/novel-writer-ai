import React, { useEffect, useRef, useState } from "react";
import { useNovelWriter } from "./store/novelWriterStore";
import type NovelWriterPlugin from "../../../main";
import type { Acto, Capitulo } from "../../domain";
import { useOutlineActions } from "./outline/useOutlineActions";
import { OutlineHeader } from "./outline/OutlineHeader";
import { AddActo } from "./outline/AddActo";
import { ActoSection } from "./outline/ActoSection";
import { ChapterFileModal } from "./outline/modals";
import { openNovelBlueprintModal } from "./features/blueprint/NovelBlueprintModal";

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
	} = useNovelWriter();

	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [editingCap, setEditingCap] = useState<string | null>(null);
	const [editingAct, setEditingAct] = useState<string | null>(null);
	const [newAct, setNewAct] = useState("");
	const [addingTo, setAddingTo] = useState<string | null>(null);
	const [capName, setCapName] = useState("");
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [openChapterMenu, setOpenChapterMenu] = useState<string | null>(null);
	const [reorderingChapter, setReorderingChapter] = useState<string | null>(null);
	const [draggedChapter, setDraggedChapter] = useState<string | null>(null);
	const [reorderingAct, setReorderingAct] = useState<string | null>(null);
	const [draggedAct, setDraggedAct] = useState<string | null>(null);
	const [targetWords, setTargetWords] = useState(
		plugin.settings.data.draftWordCount || 2000
	);
	const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

	const {
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
	} = useOutlineActions(plugin, targetWords);

	useEffect(() => {
		const next: Record<string, string> = {};
		capitulos.forEach((c) => (next[c.id_capitulo] = c.outline ?? ""));
		setDrafts(next);
	}, [capitulos]);

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

	const saveOutline = (id: string, value: string) => {
		setDrafts((d) => ({ ...d, [id]: value }));
		const old = timers.current[id];
		if (old) clearTimeout(old);
		timers.current[id] = setTimeout(() => {
			void updateCapitulo(id, { outline: value });
		}, 600);
	};

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
			void updateCapitulo(chapter.id_capitulo, { nombre: name });
		setEditingCap(null);
	};

	const deleteAct = (acto: Acto) => {
		if (confirm(`Delete act "${acto.nombre}"?`))
			void deleteActo(acto.id_acto);
	};

	const deleteChapter = (chapter: Capitulo) => {
		closeChapterMenu();
		if (confirm(`Delete "${chapter.nombre}"?`))
			void deleteCapitulo(chapter.id_capitulo);
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
		if (!chapter || !targetChapter || chapter.id_acto !== targetChapter.id_acto)
			return;

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

		closeChapterMenu();
		setReorderingChapter(chapter.id_capitulo);
		try {
			for (const [orden, item] of chaptersInAct.entries()) {
				if (item.orden !== orden)
					await updateCapitulo(item.id_capitulo, { orden });
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
						editingAct={editingAct === a.id_acto}
						onStartEditingAct={() => setEditingAct(a.id_acto)}
						onCommitActName={(name) => commitActName(a, name)}
						onCancelEditingAct={() => setEditingAct(null)}
						onDeleteAct={() => deleteAct(a)}
						reorderingAct={Boolean(reorderingAct)}
						draggedAct={draggedAct}
						onDragStartAct={() => setDraggedAct(a.id_acto)}
						onDragEndAct={() => setDraggedAct(null)}
						onDropAct={() => {
							if (draggedAct) void reorderActs(draggedAct, a.id_acto);
							setDraggedAct(null);
						}}
						expanded={expanded}
						editingCap={editingCap}
						openChapterMenu={openChapterMenu}
						drafts={drafts}
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
						onDeleteChapter={deleteChapter}
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
