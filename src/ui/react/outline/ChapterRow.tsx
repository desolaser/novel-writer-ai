import type { Capitulo } from "../../../domain";
import { Icon } from "../components/Icon";
import { InlineRename } from "./InlineRename";
import { ChapterActionsMenu } from "./ChapterActionsMenu";
import { AutoSaveTextarea } from "../components/AutoSaveTextarea";
import { CHAPTER_DRAG_TYPE, carriesDragType } from "./dragTypes";
import { ChapterInfoFields } from "./ChapterInfoFields";
import { ChapterStatusDot } from "./ChapterStatusDot";
import { ChapterScenes } from "./ChapterScenes";

export interface ChapterRowProps {
	chapter: Capitulo;
	expanded: boolean;
	editing: boolean;
	menuOpen: boolean;
	batchBusy: boolean;
	reordering: boolean;
	isDragging: boolean;
	onToggle: () => void;
	onStartRename: () => void;
	onCommitName: (name: string) => void;
	onCancelRename: () => void;
	onOpenManuscript: () => void;
	onToggleMenu: () => void;
	onCreateManuscript: () => void;
	onGenerateOutline: () => void;
	onGenerateOutlineByMemory: () => void;
	onGenerateMemory: () => void;
	onGenerateDraft: () => void;
	onLinkFile: () => void;
	onCopyForPublishing: () => void;
	onDelete: () => void;
	onDragStart: () => void;
	onDragEnd: () => void;
	onDrop: () => void;
	onSaveOutline: (value: string) => Promise<void>;
}

/** Fila de capítulo: colapsado, renombrado, estado, menú y editor inline. */
export function ChapterRow({
	chapter,
	expanded,
	editing,
	menuOpen,
	batchBusy,
	reordering,
	isDragging,
	onToggle,
	onStartRename,
	onCommitName,
	onCancelRename,
	onOpenManuscript,
	onToggleMenu,
	onCreateManuscript,
	onGenerateOutline,
	onGenerateOutlineByMemory,
	onGenerateMemory,
	onGenerateDraft,
	onLinkFile,
	onCopyForPublishing,
	onDelete,
	onDragStart,
	onDragEnd,
	onDrop,
	onSaveOutline,
}: ChapterRowProps) {
	return (
		<div
			className={`nw-outline-chapter${isDragging ? " is-dragging" : ""}`}
			data-nw-chapter-id={chapter.id_capitulo}
			onDragOver={(event) => {
				if (carriesDragType(event, CHAPTER_DRAG_TYPE)) event.preventDefault();
			}}
			onDrop={(event) => {
				if (!carriesDragType(event, CHAPTER_DRAG_TYPE)) return;
				event.preventDefault();
				onDrop();
			}}
		>
			<div className="nw-outline-chapter-row">
				<button
					className="nw-btn-link nw-outline-chapter-drag-handle"
					draggable={!reordering}
					disabled={reordering}
					title="Drag to reorder the chapter"
					aria-label="Drag to reorder the chapter"
					onDragStart={(event) => {
						event.dataTransfer.effectAllowed = "move";
						event.dataTransfer.setData(CHAPTER_DRAG_TYPE, chapter.id_capitulo);
						onDragStart();
					}}
					onDragEnd={onDragEnd}
				>
					⠿
				</button>
				<button
					className="nw-btn-link nw-outline-expand"
					onClick={onToggle}
				>
					{expanded ? "▾" : "▸"}
				</button>
				<ChapterStatusDot status={chapter.status} />
				{editing ? (
					<InlineRename
						defaultValue={chapter.nombre}
						onCommit={onCommitName}
						onCancel={onCancelRename}
					/>
				) : (
					<button
						className="nw-btn-link nw-outline-chapter-name"
						onClick={onStartRename}
						title="Click to rename"
					>
						{chapter.nombre}
						{chapter.outline ? " *" : ""}
					</button>
				)}
				{chapter.published_on && (
					<span
						className="nw-chapter-published"
						title={`Published on ${chapter.published_on}`}
						aria-label={`Published on ${chapter.published_on}`}
					>
						<Icon.Upload width={12} height={12} />
					</span>
				)}
				{!expanded && Boolean(chapter.scenes?.length) && (
					<span
						className="nw-chapter-scene-count"
						title={`${chapter.scenes!.length} scenes`}
					>
						{chapter.scenes!.length} sc.
					</span>
				)}
				<span className="nw-chapter-file-status">
					{chapter.archivo ? "File" : "No file"}
				</span>
				{chapter.archivo && (
					<button
						className="nw-btn nw-btn-icon"
						title="Open manuscript"
						aria-label="Open manuscript"
						onClick={onOpenManuscript}
					>
						<Icon.ExternalLink width={13} height={13} />
					</button>
				)}
				<button
					className="nw-btn nw-btn-icon"
					title="Chapter actions"
					aria-label="Chapter actions"
					onClick={onToggleMenu}
				>
					⋯
				</button>
				{menuOpen && (
					<ChapterActionsMenu
						batchBusy={batchBusy}
						hasFile={Boolean(chapter.archivo)}
						onCreateManuscript={onCreateManuscript}
						onGenerateOutline={onGenerateOutline}
						onGenerateOutlineByMemory={onGenerateOutlineByMemory}
						onGenerateMemory={onGenerateMemory}
						onGenerateDraft={onGenerateDraft}
						onLinkFile={onLinkFile}
						onCopyForPublishing={onCopyForPublishing}
						onDelete={onDelete}
					/>
				)}
			</div>
			{expanded && <ChapterInfoFields chapter={chapter} />}
			{expanded && (
				<AutoSaveTextarea
					className="nw-outline-inline-editor"
					value={chapter.outline ?? ""}
					onSave={onSaveOutline}
					placeholder="Summary of what will happen in this chapter..."
					rows={6}
				/>
			)}
			{expanded && <ChapterScenes chapter={chapter} />}
		</div>
	);
}
