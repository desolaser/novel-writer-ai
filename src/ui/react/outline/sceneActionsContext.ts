import { createContext, useContext } from "react";
import type { Capitulo } from "../../../domain";

/**
 * What the scene list needs from the Outline: its AI actions and a way to
 * ask the author. `outlineRoot.tsx` provides it, so the callbacks don't pass
 * through every act and chapter row on the way down.
 */
export interface SceneActions {
	batchBusy: boolean;
	splitIntoScenes: (chapter: Capitulo) => void;
	draftScene: (chapter: Capitulo, sceneId: string) => void;
	confirm: (question: string) => Promise<boolean>;
}

const SceneActionsContext = createContext<SceneActions | null>(null);

export const SceneActionsProvider = SceneActionsContext.Provider;

export function useSceneActions(): SceneActions {
	const actions = useContext(SceneActionsContext);
	if (!actions) throw new Error("Scene actions are only available in the Outline.");
	return actions;
}
