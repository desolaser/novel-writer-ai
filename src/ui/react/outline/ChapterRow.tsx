import type { Capitulo } from "../../../domain";
import { Icon } from "../components/Icon";
import { InlineRename } from "./InlineRename";
import { ChapterActionsMenu } from "./ChapterActionsMenu";

export interface ChapterRowProps {
	chapter: Capitulo;
	expanded: boolean;
	editing: boolean;
	menuOpen: boolean;
	draft: string;
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
	onGenerateMemory: () => void;
	onGenerateDraft: () => void;
	onLinkFile: () => void;
	onDelete: () => void;
	onDragStart: () => void;
	onDragEnd: () => void;
	onDrop: () => void;
	onSaveOutline: (value: string) => void;
}

/** Fila de capítulo: colapsado, renombrado, estado, menú y editor inline. */
export function ChapterRow({
	chapter,
	expanded,
	editing,
	menuOpen,
	draft,
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
	onGenerateMemory,
	onGenerateDraft,
	onLinkFile,
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
			onDragOver={(event) => event.preventDefault()}
			onDrop={onDrop}
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
						event.dataTransfer.setData("text/plain", chapter.id_capitulo);
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
						onGenerateMemory={onGenerateMemory}
						onGenerateDraft={onGenerateDraft}
						onLinkFile={onLinkFile}
						onDelete={onDelete}
					/>
				)}
			</div>
			{expanded && (
				<textarea
					className="nw-outline-inline-editor"
					value={draft}
					onChange={(e) => onSaveOutline(e.target.value)}
					placeholder="Summary of what will happen in this chapter..."
					rows={6}
				/>
			)}
		</div>
	);
}
