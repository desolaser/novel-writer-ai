import { useCallback, useEffect, useState } from "react";
import type { ChapterContinuity } from "../../../../types/Continuity";
import { onContinuityChange } from "../../../../infrastructure/storage/repos/ContinuityRepo";
import { emptyChapterContinuity, storyTextHash } from "../../../../utils/storyFacts";
import { useNovelWriter } from "../../store/novelWriterStore";
import type { ContinuityChecker } from "./continuityChecker";

export interface ChapterContinuityState {
	entry: ChapterContinuity;
	/** The text changed since the facts were extracted (or never were). */
	stale: boolean;
	error: string;
}

/**
 * A chapter's facts, reloaded whenever the continuity file is written (by
 * this panel, a check or the chat). The text hash is read on mount and on
 * each reload, so "stale" is as fresh as the panel.
 */
export function useChapterContinuity(
	checker: ContinuityChecker,
	chapterId: string,
): ChapterContinuityState {
	const [state, setState] = useState<ChapterContinuityState>({
		entry: emptyChapterContinuity(),
		stale: false,
		error: "",
	});

	const load = useCallback(async () => {
		try {
			const ledger = await checker.readLedger();
			const entry = ledger.chapters[chapterId] ?? emptyChapterContinuity();
			const text = await useNovelWriter.getState().readCapituloTexto(chapterId);
			const stale = Boolean(text.trim())
				&& entry.text_hash !== storyTextHash(text);
			setState({ entry, stale, error: "" });
		} catch (error: any) {
			setState((current) => ({
				...current,
				error: error?.message ?? String(error),
			}));
		}
	}, [checker, chapterId]);

	useEffect(() => {
		let active = true;
		const reload = () => {
			if (active) void load();
		};
		reload();
		const unsubscribe = onContinuityChange(reload);
		return () => {
			active = false;
			unsubscribe();
		};
	}, [load]);

	return state;
}
