import { useEffect, useState } from 'react';
import { buildStoryBibleBlock } from '../../../../../context/blueprintPrompt';

interface UseStoryBibleParams {
	store: any;
	activeChatId: string | null;
}

/**
 * The active novel's story bible (premise, style, tense, language), rebuilt
 * whenever the novel or the conversation changes — which is also when an edit
 * made in Novel Setup gets picked up. `roleplayLanguage` is the same bible with
 * only the language line, used while roleplaying so a character isn't handed the
 * full premise as extra instructions.
 */
export function useStoryBible({ store, activeChatId }: UseStoryBibleParams) {
	const [storyBible, setStoryBible] = useState('');
	const [roleplayLanguage, setRoleplayLanguage] = useState('');
	const [bibleEnabled, setBibleEnabled] = useState(true);

	useEffect(() => {
		let cancelled = false;
		void (async () => {
			if (!store?.activeFolderPath) {
				setStoryBible('');
				setRoleplayLanguage('');
				return;
			}
			try {
				const blueprint = await store.readBlueprint();
				if (cancelled) return;
				setStoryBible(buildStoryBibleBlock(blueprint));
				setRoleplayLanguage(buildStoryBibleBlock(blueprint, { languageOnly: true }));
			} catch {
				if (!cancelled) {
					setStoryBible('');
					setRoleplayLanguage('');
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [store, store?.activeNovelId, activeChatId]);

	return { storyBible, roleplayLanguage, bibleEnabled, setBibleEnabled };
}
