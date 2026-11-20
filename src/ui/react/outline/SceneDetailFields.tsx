import { Notice } from "obsidian";
import type { Categoria, ChapterScene, EntradaCodex } from "../../../domain";
import { parseSceneWords } from "../../../utils/chapterScenes";
import { parseStoryDay } from "../../../utils/chapterInfo";
import { CommitInput } from "../components/CommitInput";
import { CodexEntrySelect } from "./CodexEntrySelect";

export interface SceneDetailFieldsProps {
	scene: ChapterScene;
	entries: EntradaCodex[];
	categories: Categoria[];
	onChange: (patch: Partial<ChapterScene>) => Promise<void>;
}

interface TextField {
	key: "goal" | "conflict" | "outcome";
	label: string;
	placeholder: string;
}

const TEXT_FIELDS: TextField[] = [
	{
		key: "goal",
		label: "Goal",
		placeholder: "What the point-of-view character wants",
	},
	{
		key: "conflict",
		label: "Conflict",
		placeholder: "What stands in the way",
	},
	{
		key: "outcome",
		label: "Outcome / hook",
		placeholder: "How it ends, or what pulls into the next scene",
	},
];

/** The optional fields of a scene, shown under "More". */
export function SceneDetailFields({
	scene,
	entries,
	categories,
	onChange,
}: SceneDetailFieldsProps) {
	const saveDay = async (value: string) => {
		try {
			await onChange({ story_day: parseStoryDay(value) });
		} catch (error: any) {
			new Notice(error?.message ?? String(error));
		}
	};

	const saveWords = async (value: string) => {
		try {
			await onChange({ target_words: parseSceneWords(value) });
		} catch (error: any) {
			new Notice(error?.message ?? String(error));
		}
	};

	return (
		<div className="nw-scene-details">
			<label className="nw-chapter-info-field">
				<span>Point of view</span>
				<CodexEntrySelect
					value={scene.pov_entry_id}
					entries={entries}
					categories={categories}
					preferredCategory="Characters"
					emptyLabel="Same as chapter"
					ariaLabel="Point of view of the scene"
					onChange={(id) => void onChange({ pov_entry_id: id })}
				/>
			</label>
			<label className="nw-chapter-info-field">
				<span>Setting</span>
				<CodexEntrySelect
					value={scene.location_entry_id}
					entries={entries}
					categories={categories}
					preferredCategory="Locations"
					emptyLabel="Same as chapter"
					ariaLabel="Setting of the scene"
					onChange={(id) => void onChange({ location_entry_id: id })}
				/>
			</label>
			{TEXT_FIELDS.map((field) => (
				<label key={field.key} className="nw-chapter-info-field nw-scene-wide">
					<span>{field.label}</span>
					<CommitInput
						value={scene[field.key] ?? ""}
						placeholder={field.placeholder}
						ariaLabel={field.label}
						onCommit={(value) => onChange({ [field.key]: value.trim() })}
					/>
				</label>
			))}
			<label className="nw-chapter-info-field">
				<span>Day</span>
				<CommitInput
					type="number"
					value={scene.story_day?.toString() ?? ""}
					placeholder="Same as before"
					title="Day inside the story. Empty: the day of the scene before"
					ariaLabel="Story day of the scene"
					onCommit={saveDay}
				/>
			</label>
			<label className="nw-chapter-info-field">
				<span>Words</span>
				<CommitInput
					type="number"
					value={scene.target_words?.toString() ?? ""}
					placeholder="Share of chapter"
					title="Words for this scene. Empty: a share of the chapter"
					ariaLabel="Target words of the scene"
					onCommit={saveWords}
				/>
			</label>
		</div>
	);
}
