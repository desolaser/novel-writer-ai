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
				Generar manuscrito
			</button>
			<button disabled={batchBusy || !hasFile} onClick={onGenerateOutline}>
				Generar Outline
			</button>
			<button disabled={batchBusy} onClick={onGenerateMemory}>
				Generar memoria
			</button>
			<button disabled={batchBusy} onClick={onGenerateDraft}>
				Generar draft
			</button>
			<button onClick={onLinkFile}>Vincular archivo Markdown</button>
			<button className="nw-btn-danger" onClick={onDelete}>
				Borrar capítulo
			</button>
		</div>
	);
}
