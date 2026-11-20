import { useState } from "react";
import type { Categoria, ChapterScene, EntradaCodex } from "../../../domain";
import { AutoSaveTextarea } from "../components/AutoSaveTextarea";
import { CommitInput } from "../components/CommitInput";
import { Icon } from "../components/Icon";
import { SceneDetailFields } from "./SceneDetailFields";

export interface SceneCardProps {
	scene: ChapterScene;
	index: number;
	count: number;
	entries: EntradaCodex[];
	categories: Categoria[];
	busy: boolean;
	onChange: (patch: Partial<ChapterScene>) => Promise<void>;
	onMove: (delta: number) => void;
	onDelete: () => void;
	onDraft: () => void;
}

/** Whether a folded scene has anything set under "More". */
function hasDetails(scene: ChapterScene): boolean {
	return Boolean(
		scene.pov_entry_id || scene.location_entry_id || scene.goal
		|| scene.conflict || scene.outcome || scene.target_words
	);
}

/** One scene: number, title, what happens, and its other fields folded. */
export function SceneCard({
	scene,
	index,
	count,
	entries,
	categories,
	busy,
	onChange,
	onMove,
	onDelete,
	onDraft,
}: SceneCardProps) {
	const [showMore, setShowMore] = useState(false);

	return (
		<div className="nw-scene">
			<div className="nw-scene-head">
				<span className="nw-scene-number">{index + 1}</span>
				<CommitInput
					className="nw-scene-title"
					value={scene.title}
					placeholder={`Scene ${index + 1}`}
					ariaLabel="Scene title"
					onCommit={(title) => onChange({ title: title.trim() })}
				/>
				<button
					className="nw-btn nw-btn-icon"
					disabled={index === 0}
					title="Move up"
					aria-label="Move scene up"
					onClick={() => onMove(-1)}
				>
					↑
				</button>
				<button
					className="nw-btn nw-btn-icon"
					disabled={index === count - 1}
					title="Move down"
					aria-label="Move scene down"
					onClick={() => onMove(1)}
				>
					↓
				</button>
				<button
					className="nw-btn nw-btn-icon"
					disabled={busy}
					title="Draft this scene into the manuscript"
					aria-label="Draft this scene"
					onClick={onDraft}
				>
					<Icon.Edit width={12} height={12} />
				</button>
				<button
					className="nw-btn nw-btn-icon"
					title="Delete scene"
					aria-label="Delete scene"
					onClick={onDelete}
				>
					<Icon.Trash width={12} height={12} />
				</button>
			</div>
			<AutoSaveTextarea
				className="nw-scene-summary"
				value={scene.summary}
				onSave={(summary) => onChange({ summary })}
				placeholder="What happens in this scene..."
				rows={2}
			/>
			<button
				className="nw-btn-link nw-scene-more"
				onClick={() => setShowMore(!showMore)}
			>
				{showMore ? "▾" : "▸"} More
				{!showMore && hasDetails(scene) ? " •" : ""}
			</button>
			{showMore && (
				<SceneDetailFields
					scene={scene}
					entries={entries}
					categories={categories}
					onChange={onChange}
				/>
			)}
		</div>
	);
}
