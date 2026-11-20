import { useCallback, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type NovelWriterPlugin from "../../../../../main";
import type { TimelineLaneMode } from "../../../../types/StoryTimeline";
import { buildStoryTimeline } from "../../../../utils/storyTimeline";
import { chapterVaultPath } from "../../../../utils/chapterPaths";
import { chaptersInOrder } from "../../../../utils/novelMetrics";
import { useNovelWriter } from "../../store/novelWriterStore";
import { useChapterMentions } from "./useChapterMentions";
import { TimelineToolbar } from "./TimelineToolbar";
import { TimelineGrid } from "./TimelineGrid";
import { UndatedTray } from "./UndatedTray";
import { TimelineDetails } from "./TimelineDetails";
import { clearChapter, moveChapter } from "./timelineChanges";

const LANE_MODES: TimelineLaneMode[] = ["pov", "setting", "characters", "none"];

/** The lane choice is remembered (`uiPrefs.timelineLanes`). */
function useLaneMode(): [TimelineLaneMode, (mode: TimelineLaneMode) => void] {
	const settings = useNovelWriter((state) => state.settings);
	const saved = settings?.data.uiPrefs.timelineLanes as TimelineLaneMode | undefined;
	const [mode, setMode] = useState<TimelineLaneMode>(
		saved && LANE_MODES.includes(saved) ? saved : "pov",
	);
	const change = (next: TimelineLaneMode) => {
		setMode(next);
		if (!settings) return;
		settings.data.uiPrefs.timelineLanes = next;
		void settings.save();
	};
	return [mode, change];
}

/**
 * The story timeline: chapters by when they happen in the story, in lanes.
 * Drag a bar to another day, or onto "Undated"; click it for its details.
 */
export function TimelineRoot({ plugin }: { plugin: NovelWriterPlugin }) {
	const { actos, capitulos, entradas, categorias, novelId } = useNovelWriter(
		useShallow((state) => ({
			actos: state.actos,
			capitulos: state.capitulos,
			entradas: state.entradas,
			categorias: state.categorias,
			novelId: state.activeNovelId,
		})),
	);
	const [mode, setMode] = useLaneMode();
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [revision, setRevision] = useState(0);
	const chapters = useMemo(() => chaptersInOrder(actos, capitulos), [actos, capitulos]);
	const mentions = useChapterMentions(mode === "characters", chapters, entradas, revision);

	const timeline = useMemo(() => buildStoryTimeline({
		chapters,
		entries: entradas,
		categories: categorias,
		mode,
		mentions: mentions ?? undefined,
	}), [chapters, entradas, categorias, mode, mentions]);

	const openChapter = useCallback((id: string) => {
		const state = useNovelWriter.getState();
		const chapter = state.capitulos.find((item) => item.id_capitulo === id);
		const path = chapter
			? chapterVaultPath(chapter, state.store?.activeFolderPath ?? null)
			: null;
		if (path) void plugin.app.workspace.openLinkText(path, "", false);
	}, [plugin]);

	if (!novelId) return <p className="nw-muted">Open a novel to see its timeline.</p>;

	const selectedIndex = chapters.findIndex((item) => item.id_capitulo === selectedId);
	const selected = selectedIndex >= 0 ? chapters[selectedIndex] : null;
	const waitingForMentions = mode === "characters" && !mentions;

	return (
		<div className="nw-timeline">
			<TimelineToolbar
				mode={mode}
				dated={chapters.length - timeline.undated.length}
				total={chapters.length}
				loading={waitingForMentions}
				onModeChange={setMode}
				onRefresh={() => setRevision((value) => value + 1)}
			/>
			<div className="nw-timeline-body">
				<div className="nw-timeline-main">
					{waitingForMentions && (
						<p className="nw-muted">Reading the manuscripts...</p>
					)}
					{!waitingForMentions && timeline.columns.length === 0 && (
						<p className="nw-timeline-empty">
							No chapter has a story day yet. Click one in "Undated" to give it
							a day, or set it in the Outline (Details).
						</p>
					)}
					{!waitingForMentions && timeline.columns.length > 0 && (
						<TimelineGrid
							timeline={timeline}
							selectedId={selectedId}
							onSelect={setSelectedId}
							onOpen={openChapter}
							onDropOnDay={(id, day) => void moveChapter(id, day)}
						/>
					)}
					<UndatedTray
						chapters={timeline.undated}
						selectedId={selectedId}
						onSelect={setSelectedId}
						onDrop={(id) => void clearChapter(id)}
					/>
				</div>
				{selected && (
					<TimelineDetails
						chapter={selected}
						number={selectedIndex + 1}
						onOpen={() => openChapter(selected.id_capitulo)}
						onShowInOutline={() =>
							void plugin.openOutlineChapter(selected.id_capitulo)}
						onClose={() => setSelectedId(null)}
					/>
				)}
			</div>
		</div>
	);
}
