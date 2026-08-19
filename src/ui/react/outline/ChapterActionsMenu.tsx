export interface ChapterActionsMenuProps {
	batchBusy: boolean;
	hasFile: boolean;
	onCreateManuscript: () => void;
	onGenerateOutline: () => void;
	onGenerateMemory: () => void;
	onGenerateDraft: () => void;
	onLinkFile: () => void;
	onDelete: () => void;
}

/** Menú desplegable de acciones por capítulo. */
export function ChapterActionsMenu({
	batchBusy,
	hasFile,
	onCreateManuscript,
	onGenerateOutline,
	onGenerateMemory,
	onGenerateDraft,
	onLinkFile,
	onDelete,
}: ChapterActionsMenuProps) {
	return (
		<div className="nw-chapter-actions-menu">
			<button disabled={batchBusy} onClick={onCreateManuscript}>
				Generate manuscript
			</button>
			<button disabled={batchBusy || !hasFile} onClick={onGenerateOutline}>
				Generate Outline
			</button>
			<button disabled={batchBusy} onClick={onGenerateMemory}>
				Generate memory
			</button>
			<button disabled={batchBusy} onClick={onGenerateDraft}>
				Generate draft
			</button>
			<button onClick={onLinkFile}>Link Markdown file</button>
			<button className="nw-btn-danger" onClick={onDelete}>
				Delete chapter
			</button>
		</div>
	);
}
