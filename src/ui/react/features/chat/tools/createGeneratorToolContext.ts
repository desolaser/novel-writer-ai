import type NovelWriterPlugin from '../../../../../../main';
import type { Capitulo } from '../../../../../domain';
import type { GeneratorToolContext } from '../../../../../interfaces/tool-context';
import { useNovelWriter } from '../../../store/novelWriterStore';
import { OutlineGenerator } from '../../../outline/outlineGenerator';
import { isCorruptGeneration } from '../../../outline/outlineGenerators';
import { draftLengthFromWords, type DraftLength } from '../../../../../utils/draftLength';

/** Steers each continuation of a draft into its range, like the Outline view. */
function guidance(length: DraftLength) {
	return ({ currentWords, remainingWords }: { currentWords: number; remainingWords: number }) => {
		if (currentWords === 0) return 'Write the complete chapter.';
		const close = currentWords >= length.min * 0.8
			? 'Close the plot in this response.'
			: 'Keep developing the chapter without restarting it.';
		return `Approximately ${remainingWords} words remain. ${close}`;
	};
}

/** Adapter for the generator tools: the Outline view's generators, on the active novel. */
export function createGeneratorToolContext(plugin: NovelWriterPlugin): GeneratorToolContext {
	const generator = new OutlineGenerator(plugin);
	const state = () => useNovelWriter.getState();

	const chapterOf = (id: string): Capitulo => {
		const chapter = state().capitulos.find((item) => item.id_capitulo === id);
		if (!chapter) throw new Error('That chapter no longer exists.');
		return chapter;
	};

	return {
		generateOutline: (chapterId, source) => source === 'story_so_far'
			? generator.outlineFromStory(chapterOf(chapterId))
			: generator.outlineFromManuscript(chapterOf(chapterId)),

		summarizeAct: (actId) => {
			const act = state().actos.find((item) => item.id_acto === actId);
			if (!act) throw new Error('That act no longer exists.');
			return generator.summarizeAct(act);
		},

		draftChapter: async (chapterId, words) => {
			const chapter = chapterOf(chapterId);
			const length = words ? draftLengthFromWords(words) : await generator.draftLength();
			await generator.ensureActSummaries();
			let invalid = false;
			const text = await generator.draftText(chapter, length, guidance(length), () => {
				invalid = true;
			});
			if (invalid || !text.trim() || isCorruptGeneration(text)) {
				throw new Error('The writing model returned an invalid draft; nothing was saved.');
			}
			await state().writeCapituloTexto(chapterId, text);
			return { text, length };
		},

		refreshStoryContext: async (chapterId) => {
			const chapters = chapterId ? [chapterOf(chapterId)] : generator.chapters();
			for (const chapter of chapters) await generator.refreshStoryContext(chapter);
			return chapters.length;
		},
	};
}
