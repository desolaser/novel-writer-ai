import type { Acto, Capitulo } from "../../../domain";
import { ActoHeader } from "./ActoHeader";
import { ChapterRow } from "./ChapterRow";
import { AddChapter } from "./AddChapter";

export interface ActoSectionProps {
	acto: Acto;
	chapters: Capitulo[];
	collapsed: boolean;
	onToggleCollapse: () => void;
	// Cabecera del acto
	editingAct: boolean;
	onStartEditingAct: () => void;
	onCommitActName: (name: string) => void;
	onCancelEditingAct: () => void;
	onDeleteAct: () => void;
	reorderingAct: boolean;
	draggedAct: string | null;
	onDragStartAct: () => void;
	onDragEndAct: () => void;
	onDropAct: () => void;
	// Estado compartido de capítulos
	expanded: Set<string>;
	editingCap: string | null;
	openChapterMenu: string | null;
	drafts: Record<string, string>;
	batchBusy: boolean;
	reorderingChapter: string | null;
	draggedChapter: string | null;
	onToggleChapter: (id: string) => void;
	onStartEditingCap: (id: string) => void;
	onCommitCapName: (chapter: Capitulo, name: string) => void;
	onCancelEditingCap: () => void;
	onToggleChapterMenu: (id: string | null) => void;
	onSaveOutline: (id: string, value: string) => void;
	onOpenManuscript: (path: string) => void;
	onGenerateChapterOutline: (chapter: Capitulo) => void;
	onGenerateChapterOutlineByMemory: (chapter: Capitulo) => void;
	onGenerateChapterMemory: (chapter: Capitulo) => void;
	onGenerateChapterDraft: (chapter: Capitulo) => void;
	onCreateChapterManuscript: (chapter: Capitulo) => void;
	onLinkChapterFile: (chapter: Capitulo) => void;
	onDeleteChapter: (chapter: Capitulo) => void;
	onDragStartChapter: (id: string) => void;
	onDragEndChapter: () => void;
	onDropChapter: (targetId: string) => void;
	// Añadir capítulo
	adding: boolean;
	newChapterName: string;
	onNewChapterNameChange: (value: string) => void;
	onStartAddingChapter: () => void;
	onCancelAddingChapter: () => void;
	onAddChapter: () => void;
}

/** Sección de un acto: cabecera + capítulos + fila para añadir capítulo. */
export function ActoSection(props: ActoSectionProps) {
	const {
		acto,
		chapters,
		collapsed,
		onToggleCollapse,
		editingAct,
		onStartEditingAct,
		onCommitActName,
		onCancelEditingAct,
		onDeleteAct,
		reorderingAct,
		draggedAct,
		onDragStartAct,
		onDragEndAct,
		onDropAct,
		expanded,
		editingCap,
		openChapterMenu,
		drafts,
		batchBusy,
		reorderingChapter,
		draggedChapter,
		onToggleChapter,
		onStartEditingCap,
		onCommitCapName,
		onCancelEditingCap,
		onToggleChapterMenu,
		onSaveOutline,
		onOpenManuscript,
		onGenerateChapterOutline,
		onGenerateChapterOutlineByMemory,
		onGenerateChapterMemory,
		onGenerateChapterDraft,
		onCreateChapterManuscript,
		onLinkChapterFile,
		onDeleteChapter,
		onDragStartChapter,
		onDragEndChapter,
		onDropChapter,
		adding,
		newChapterName,
		onNewChapterNameChange,
		onStartAddingChapter,
		onCancelAddingChapter,
		onAddChapter,
	} = props;

	return (
		<section className="nw-outline-act">
			<ActoHeader
				acto={acto}
				chaptersCount={chapters.length}
				collapsed={collapsed}
				onToggleCollapse={onToggleCollapse}
				editing={editingAct}
				onStartEditing={onStartEditingAct}
				onCommitName={onCommitActName}
				onCancelEditing={onCancelEditingAct}
				onDelete={onDeleteAct}
				reordering={reorderingAct}
				isDragging={draggedAct === acto.id_acto}
				onDragStart={onDragStartAct}
				onDragEnd={onDragEndAct}
				onDrop={onDropAct}
			/>
			{!collapsed && chapters.map((chapter) => {
				const isExpanded = expanded.has(chapter.id_capitulo);
				const isEditing = editingCap === chapter.id_capitulo;
				const menuOpen = openChapterMenu === chapter.id_capitulo;
				return (
					<ChapterRow
						key={chapter.id_capitulo}
						chapter={chapter}
						expanded={isExpanded}
						editing={isEditing}
						menuOpen={menuOpen}
						draft={drafts[chapter.id_capitulo] ?? ""}
						batchBusy={batchBusy}
						reordering={reorderingChapter === chapter.id_capitulo}
						isDragging={draggedChapter === chapter.id_capitulo}
						onToggle={() => onToggleChapter(chapter.id_capitulo)}
						onStartRename={() => onStartEditingCap(chapter.id_capitulo)}
						onCommitName={(name) => onCommitCapName(chapter, name)}
						onCancelRename={onCancelEditingCap}
						onOpenManuscript={() =>
							chapter.archivo && onOpenManuscript(chapter.archivo)
						}
						onToggleMenu={() =>
							onToggleChapterMenu(
								menuOpen ? null : chapter.id_capitulo
							)
						}
						onGenerateOutline={() =>
							onGenerateChapterOutline(chapter)
						}
						onGenerateOutlineByMemory={() =>
							onGenerateChapterOutlineByMemory(chapter)
						}
						onGenerateMemory={() =>
							onGenerateChapterMemory(chapter)
						}
						onGenerateDraft={() =>
							onGenerateChapterDraft(chapter)
						}
						onCreateManuscript={() =>
							onCreateChapterManuscript(chapter)
						}
						onLinkFile={() => onLinkChapterFile(chapter)}
						onDelete={() => onDeleteChapter(chapter)}
						onDragStart={() => onDragStartChapter(chapter.id_capitulo)}
						onDragEnd={onDragEndChapter}
						onDrop={() => onDropChapter(chapter.id_capitulo)}
						onSaveOutline={(value) =>
							onSaveOutline(chapter.id_capitulo, value)
						}
					/>
				);
			})}
			{!collapsed && (
				<AddChapter
					adding={adding}
					name={newChapterName}
					onNameChange={onNewChapterNameChange}
					onStartAdding={onStartAddingChapter}
					onCancel={onCancelAddingChapter}
					onAdd={onAddChapter}
				/>
			)}
		</section>
	);
}
