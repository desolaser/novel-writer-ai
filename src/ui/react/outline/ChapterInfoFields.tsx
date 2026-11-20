import { Notice } from "obsidian";
import { useShallow } from "zustand/react/shallow";
import type { Capitulo, ChapterInfo, ChapterStatus } from "../../../domain";
import { CHAPTER_STATUSES } from "../../../constants/chapterStatus";
import { checkDayRange, parseStoryDay } from "../../../utils/chapterInfo";
import { useNovelWriter } from "../store/novelWriterStore";
import { CommitInput } from "../components/CommitInput";
import { CodexEntrySelect } from "./CodexEntrySelect";

export interface ChapterInfoFieldsProps {
	chapter: Capitulo;
}

/**
 * Status, point of view, setting and story time of an expanded chapter.
 *
 * It reads the codex from the store itself instead of through the Outline:
 * the Outline subscribes only to acts and chapters, so a codex change does not
 * re-render it. Only expanded chapters mount this block.
 */
export function ChapterInfoFields({ chapter }: ChapterInfoFieldsProps) {
	const { entries, categories, updateCapitulo } = useNovelWriter(
		useShallow((state) => ({
			entries: state.entradas,
			categories: state.categorias,
			updateCapitulo: state.updateCapitulo,
		}))
	);

	const save = async (patch: ChapterInfo) => {
		try {
			await updateCapitulo(chapter.id_capitulo, patch);
		} catch (error: any) {
			new Notice(`Could not save the chapter: ${error?.message ?? error}`);
		}
	};

	const saveDay = async (value: string) => {
		try {
			const day = parseStoryDay(value);
			checkDayRange(day, chapter.story_day_end ?? null);
			await save({ story_day: day });
		} catch (error: any) {
			new Notice(error?.message ?? String(error));
		}
	};

	const saveEndDay = async (value: string) => {
		try {
			const end = parseStoryDay(value);
			checkDayRange(chapter.story_day, end);
			await save({ story_day_end: end });
		} catch (error: any) {
			new Notice(error?.message ?? String(error));
		}
	};

	return (
		<div className="nw-chapter-info">
			<label className="nw-chapter-info-field">
				<span>Status</span>
				<select
					className="dropdown nw-chapter-info-select"
					value={chapter.status ?? ""}
					onChange={(event) => {
						const status = (event.target.value || undefined) as
							| ChapterStatus
							| undefined;
						void save({ status });
					}}
				>
					<option value="">Not set</option>
					{CHAPTER_STATUSES.map((status) => (
						<option key={status.id} value={status.id} title={status.hint}>
							{status.label}
						</option>
					))}
				</select>
			</label>
			<label className="nw-chapter-info-field">
				<span>Point of view</span>
				<CodexEntrySelect
					value={chapter.pov_entry_id}
					entries={entries}
					categories={categories}
					preferredCategory="Characters"
					ariaLabel="Point of view character"
					onChange={(id) => void save({ pov_entry_id: id })}
				/>
			</label>
			<label className="nw-chapter-info-field">
				<span>Setting</span>
				<CodexEntrySelect
					value={chapter.location_entry_id}
					entries={entries}
					categories={categories}
					preferredCategory="Locations"
					ariaLabel="Main setting of the chapter"
					onChange={(id) => void save({ location_entry_id: id })}
				/>
			</label>
			<div className="nw-chapter-info-field nw-chapter-info-wide">
				<span>Story time</span>
				<div className="nw-chapter-info-time">
					<CommitInput
						type="number"
						className="nw-chapter-info-day"
						value={chapter.story_day?.toString() ?? ""}
						placeholder="Day"
						title="Day inside the story, to sort chapters chronologically"
						ariaLabel="Story day"
						onCommit={saveDay}
					/>
					<span className="nw-chapter-info-to">to</span>
					<CommitInput
						type="number"
						className="nw-chapter-info-day"
						value={chapter.story_day_end?.toString() ?? ""}
						placeholder="Day"
						title="Last day, for a chapter that spans several. Empty: one day"
						ariaLabel="Last story day"
						onCommit={saveEndDay}
					/>
					<CommitInput
						className="nw-chapter-info-when"
						value={chapter.story_time ?? ""}
						placeholder="When (free text)"
						title="Free label, e.g. 'third moon of winter'"
						ariaLabel="When it happens"
						onCommit={(value) => save({ story_time: value.trim() })}
					/>
				</div>
			</div>
			<label className="nw-chapter-info-field">
				<span>Published</span>
				<input
					type="date"
					className="nw-chapter-info-published"
					value={chapter.published_on ?? ""}
					title="Date it went online; empty if not published yet"
					onChange={(event) =>
						void save({ published_on: event.target.value || null })
					}
				/>
			</label>
		</div>
	);
}
