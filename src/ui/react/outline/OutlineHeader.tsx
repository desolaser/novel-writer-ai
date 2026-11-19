import { Icon } from "../components/Icon";

export interface OutlineHeaderProps {
	batchBusy: boolean;
	chaptersCount: number;
	onGenerateAllMemory: () => void;
	onGenerateAllOutlines: () => void;
	onCreateAllManuscripts: () => void;
	onGenerateDrafts: () => void;
	onOpenSetup: () => void;
	onExport: () => void;
}

/**
 * Cabecera del outline: título y acciones en lote. El largo de los borradores
 * sale del Story Bible (words per chapter), no de aquí.
 */
export function OutlineHeader({
	batchBusy,
	chaptersCount,
	onGenerateAllMemory,
	onGenerateAllOutlines,
	onCreateAllManuscripts,
	onGenerateDrafts,
	onOpenSetup,
	onExport,
}: OutlineHeaderProps) {
	const hasChapters = chaptersCount > 0;

	return (
		<div className="nw-outline-title">
			<strong>Outline</strong>
			<div className="nw-outline-actions">
				<button
					className="nw-btn"
					disabled={batchBusy}
					onClick={onOpenSetup}
					title="Lay out acts and chapters from a premise"
				>
					Setup
				</button>
				<button
					className="nw-btn nw-btn-primary"
					disabled={batchBusy || !hasChapters}
					onClick={onGenerateAllMemory}
					aria-label="Generate Memory"
				>
					<Icon.Magic />
				</button>
				<button
					className="nw-btn nw-btn-primary"
					disabled={batchBusy || !hasChapters}
					onClick={onGenerateAllOutlines}
					aria-label="Generate Outlines"
				>
					<Icon.Paintbrush />
				</button>
				<button
					className="nw-btn nw-btn-primary"
					disabled={batchBusy || !hasChapters}
					onClick={onCreateAllManuscripts}
					aria-label="Create manuscripts"
				>
					<Icon.Save />
				</button>
				<button
					className="nw-btn"
					disabled={!hasChapters}
					onClick={onExport}
					title="Export the novel (EPUB, Word, HTML, Markdown)"
					aria-label="Export novel"
				>
					<Icon.Download />
				</button>
				<button
					className="nw-btn nw-btn-experimental"
					title="Experimental feature: final length depends on the provider and model"
					disabled={batchBusy || !hasChapters}
					onClick={onGenerateDrafts}
				>
					Generate drafts
				</button>
			</div>
		</div>
	);
}
