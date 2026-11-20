import { Notice } from "obsidian";
import type { Capitulo, ChapterInfo, ChapterScene } from "../../../../domain";
import {
	chapterDayRange,
	checkDayRange,
	formatDayRange,
	parseStoryDay,
} from "../../../../utils/chapterInfo";
import { patchScene, sceneLabel } from "../../../../utils/chapterScenes";
import { useNovelWriter } from "../../store/novelWriterStore";
import { CommitInput } from "../../components/CommitInput";

export interface TimelineDetailsProps {
	chapter: Capitulo;
	number: number;
	onOpen: () => void;
	onShowInOutline: () => void;
	onClose: () => void;
}

/**
 * When the selected chapter happens: its day, its last day, its "when" label
 * and the day of each scene. Any day can be typed here, not only the columns
 * the timeline already shows.
 */
export function TimelineDetails({
	chapter,
	number,
	onOpen,
	onShowInOutline,
	onClose,
}: TimelineDetailsProps) {
	const range = chapterDayRange(chapter);
	const scenes = chapter.scenes ?? [];

	const save = async (patch: ChapterInfo) => {
		try {
			await useNovelWriter.getState().updateCapitulo(chapter.id_capitulo, patch);
		} catch (error: any) {
			new Notice(`Could not save the chapter: ${error?.message ?? error}`);
		}
	};

	const saveDay = async (value: string, field: "start" | "end") => {
		try {
			const day = parseStoryDay(value);
			if (field === "start") {
				checkDayRange(day, chapter.story_day_end ?? null);
				await save({ story_day: day });
			} else {
				checkDayRange(chapter.story_day, day);
				await save({ story_day_end: day });
			}
		} catch (error: any) {
			new Notice(error?.message ?? String(error));
		}
	};

	const saveSceneDay = async (scene: ChapterScene, value: string) => {
		try {
			const day = parseStoryDay(value);
			await useNovelWriter.getState().changeChapterScenes(
				chapter.id_capitulo,
				(list) => patchScene(list, scene.id, { story_day: day }),
			);
		} catch (error: any) {
			new Notice(error?.message ?? String(error));
		}
	};

	return (
		<aside className="nw-timeline-details">
			<div className="nw-timeline-details-head">
				<strong>#{number} {chapter.nombre}</strong>
				<button className="nw-btn nw-btn-icon" aria-label="Close" onClick={onClose}>
					×
				</button>
			</div>
			<p className="nw-timeline-hint">
				{range ? `Covers ${formatDayRange(range)}.` : "No day yet."}
			</p>
			<label className="nw-timeline-field">
				<span>Day</span>
				<CommitInput
					type="number"
					value={chapter.story_day?.toString() ?? ""}
					ariaLabel="Story day"
					onCommit={(value) => saveDay(value, "start")}
				/>
			</label>
			<label className="nw-timeline-field">
				<span>To day</span>
				<CommitInput
					type="number"
					value={chapter.story_day_end?.toString() ?? ""}
					placeholder="One day"
					ariaLabel="Last story day"
					onCommit={(value) => saveDay(value, "end")}
				/>
			</label>
			<label className="nw-timeline-field">
				<span>When</span>
				<CommitInput
					value={chapter.story_time ?? ""}
					placeholder="Free text"
					ariaLabel="When it happens"
					onCommit={(value) => save({ story_time: value.trim() })}
				/>
			</label>
			{scenes.length > 0 && (
				<div className="nw-timeline-scenes">
					<span className="nw-timeline-subtitle">Scenes</span>
					{scenes.map((scene, index) => (
						<label key={scene.id} className="nw-timeline-field">
							<span title={sceneLabel(scene, index)}>
								{index + 1}. {sceneLabel(scene, index)}
							</span>
							<CommitInput
								type="number"
								value={scene.story_day?.toString() ?? ""}
								placeholder="Same as before"
								ariaLabel={`Day of scene ${index + 1}`}
								onCommit={(value) => saveSceneDay(scene, value)}
							/>
						</label>
					))}
				</div>
			)}
			<div className="nw-timeline-details-buttons">
				<button disabled={!chapter.archivo} onClick={onOpen}>
					Open manuscript
				</button>
				<button onClick={onShowInOutline}>Show in Outline</button>
			</div>
		</aside>
	);
}
