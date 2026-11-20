import { Notice } from "obsidian";
import { useShallow } from "zustand/react/shallow";
import type { Capitulo, ChapterScene } from "../../../domain";
import {
	createScene,
	insertScene,
	moveScene,
	patchScene,
	removeScene,
	sceneLabel,
} from "../../../utils/chapterScenes";
import { useNovelWriter } from "../store/novelWriterStore";
import { Icon } from "../components/Icon";
import { SceneCard } from "./SceneCard";
import { useSceneActions } from "./sceneActionsContext";

export interface ChapterScenesProps {
	chapter: Capitulo;
}

/**
 * The scenes of an expanded chapter. Like `ChapterInfoFields`, it reads the
 * codex from the store itself so a codex change doesn't re-render the Outline.
 * Every change goes through `changeChapterScenes`, which applies it to the
 * scenes in the file inside the lock: two quick edits never undo each other.
 */
export function ChapterScenes({ chapter }: ChapterScenesProps) {
	const { entries, categories, changeChapterScenes } = useNovelWriter(
		useShallow((state) => ({
			entries: state.entradas,
			categories: state.categorias,
			changeChapterScenes: state.changeChapterScenes,
		}))
	);
	const actions = useSceneActions();
	const scenes = chapter.scenes ?? [];
	const hasOutline = Boolean(chapter.outline?.trim());

	const change = async (update: (list: ChapterScene[]) => ChapterScene[]) => {
		try {
			await changeChapterScenes(chapter.id_capitulo, update);
		} catch (error: any) {
			new Notice(`Could not save the scenes: ${error?.message ?? error}`);
		}
	};

	const deleteScene = async (scene: ChapterScene, index: number) => {
		const hasText = Boolean(scene.title.trim() || scene.summary.trim());
		const proceed = !hasText || await actions.confirm(
			`Delete "${sceneLabel(scene, index)}" from the scene plan? `
				+ "The manuscript is not touched.",
		);
		if (proceed) await change((list) => removeScene(list, scene.id));
	};

	return (
		<div className="nw-scenes">
			<div className="nw-scenes-header">
				<span className="nw-scenes-title">
					Scenes{scenes.length ? ` (${scenes.length})` : ""}
				</span>
				<button
					className="nw-btn nw-btn-icon"
					title="Add a scene"
					aria-label="Add a scene"
					onClick={() =>
						void change((list) => insertScene(list, createScene()))}
				>
					<Icon.Plus width={12} height={12} />
				</button>
				<button
					className="nw-btn nw-btn-icon"
					disabled={actions.batchBusy || !hasOutline}
					title={hasOutline
						? "Split the outline into scenes with AI"
						: "Write the chapter outline first"}
					aria-label="Split into scenes with AI"
					onClick={() => actions.splitIntoScenes(chapter)}
				>
					<Icon.Magic width={12} height={12} />
				</button>
			</div>
			{!scenes.length && (
				<p className="nw-scenes-empty">
					No scenes. With scenes, the draft is written one scene at a time.
				</p>
			)}
			{scenes.map((scene, index) => (
				<SceneCard
					key={scene.id}
					scene={scene}
					index={index}
					count={scenes.length}
					entries={entries}
					categories={categories}
					busy={actions.batchBusy}
					onChange={(patch) =>
						change((list) => patchScene(list, scene.id, patch))}
					onMove={(delta) =>
						void change((list) => moveScene(list, scene.id, delta))}
					onDelete={() => void deleteScene(scene, index)}
					onDraft={() => actions.draftScene(chapter, scene.id)}
				/>
			))}
		</div>
	);
}
