import type { Acto } from "../../../domain";
import { Icon } from "../components/Icon";
import { InlineRename } from "./InlineRename";

export interface ActoHeaderProps {
	acto: Acto;
	chaptersCount: number;
	collapsed: boolean;
	onToggleCollapse: () => void;
	editing: boolean;
	onStartEditing: () => void;
	onCommitName: (name: string) => void;
	onCancelEditing: () => void;
	onDelete: () => void;
	reordering: boolean;
	isDragging: boolean;
	onDragStart: () => void;
	onDragEnd: () => void;
	onDrop: () => void;
}

/** Cabecera de un acto: renombrado, contador de capítulos y borrado. */
export function ActoHeader({
	acto,
	chaptersCount,
	collapsed,
	onToggleCollapse,
	editing,
	onStartEditing,
	onCommitName,
	onCancelEditing,
	onDelete,
	reordering,
	isDragging,
	onDragStart,
	onDragEnd,
	onDrop,
}: ActoHeaderProps) {
	return (
		<div
			className={`nw-outline-act-header${isDragging ? " is-dragging" : ""}`}
			onDragOver={(event) => event.preventDefault()}
			onDrop={onDrop}
		>
			<button
				className="nw-btn-link nw-outline-chapter-drag-handle"
				draggable={!reordering}
				disabled={reordering}
				title="Drag to reorder the act"
				aria-label="Drag to reorder the act"
				onDragStart={(event) => {
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", acto.id_acto);
					onDragStart();
				}}
				onDragEnd={onDragEnd}
			>
				⠿
			</button>
			<button
				className="nw-btn-link nw-outline-expand"
				onClick={onToggleCollapse}
				title={collapsed ? "Expand act" : "Collapse act"}
				aria-label={collapsed ? "Expand act" : "Collapse act"}
			>
				{collapsed ? "▸" : "▾"}
			</button>
			{editing ? (
				<InlineRename
					defaultValue={acto.nombre}
					onCommit={onCommitName}
					onCancel={onCancelEditing}
				/>
			) : (
				<button
					className="nw-btn-link nw-outline-act-name"
					onClick={onStartEditing}
					title="Click to rename act"
				>
					{acto.nombre}
				</button>
			)}
			<span className="nw-node-count">{chaptersCount}</span>
			<button
				className="nw-btn nw-btn-icon nw-btn-danger"
				onClick={onDelete}
			>
				<Icon.Trash width={12} height={12} />
			</button>
		</div>
	);
}
