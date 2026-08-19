import { Icon } from "../components/Icon";

export interface OutlineHeaderProps {
	targetWords: number;
	onTargetWordsChange: (value: number) => void;
	batchBusy: boolean;
	chaptersCount: number;
	onGenerateAllMemory: () => void;
	onGenerateAllOutlines: () => void;
	onCreateAllManuscripts: () => void;
	onGenerateDrafts: () => void;
}

/** Cabecera del outline: título, ajuste de longitud y acciones en lote. */
export function OutlineHeader({
	targetWords,
	onTargetWordsChange,
	batchBusy,
	chaptersCount,
	onGenerateAllMemory,
	onGenerateAllOutlines,
	onCreateAllManuscripts,
	onGenerateDrafts,
}: OutlineHeaderProps) {
	const hasChapters = chaptersCount > 0;

	return (
		<div className="nw-outline-title">
			<strong>Outline</strong>
			<div className="nw-outline-actions">
				<label className="nw-draft-length">
					Words{" "}
					<input
						type="number"
						min={100}
						max={20000}
						step={100}
						value={targetWords}
						onChange={(e) => {
							const n = Math.max(100, Number(e.target.value) || 2000);
							onTargetWordsChange(n);
						}}
					/>
				</label>
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
