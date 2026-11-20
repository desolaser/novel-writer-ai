import type NovelWriterPlugin from '../../../../../../main';
import type { ContinuityToolContext } from '../../../../../interfaces/tool-context';
import { useNovelWriter } from '../../../store/novelWriterStore';
import { ContinuityChecker } from '../../continuity/continuityChecker';

/** Adapter for `check_continuity`: the Outline's checker, on the active novel. */
export function createContinuityToolContext(
	plugin: NovelWriterPlugin,
): ContinuityToolContext {
	const checker = new ContinuityChecker(plugin);
	return {
		checkContinuity: async (chapterId) => {
			const chapter = useNovelWriter.getState().capitulos
				.find((item) => item.id_capitulo === chapterId);
			if (!chapter) throw new Error('That chapter no longer exists.');
			return checker.check(chapter);
		},
	};
}
