import type { Acto, Capitulo, ChatContextKind } from '../../../../domain';

export const stripFrontmatter = (content: string) => content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n)?/, '');

export const includesQuery = (query: string, ...values: Array<string | null | undefined>) =>
	values.join(' ').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());

/**
 * Groups chapters by act, ordered by each act's `orden`. Chapter numbering
 * restarts inside every act, so a flat list sorted by `orden` alone would
 * interleave "Chapter 1" of act 2 with "Chapter 1" of act 1; a divider per
 * act keeps the order legible.
 */
export const groupChaptersByAct = (chapters: Capitulo[], actos: Acto[]): Array<{ acto: Acto; chapters: Capitulo[] }> =>
	[...actos]
		.sort((a, b) => a.orden - b.orden)
		.map(acto => ({ acto, chapters: chapters.filter(chapter => chapter.id_acto === acto.id_acto).sort((a, b) => a.orden - b.orden) }))
		.filter(group => group.chapters.length > 0);

export const kindIcon = (kind: ChatContextKind) => (
	<span className="nw-context-icon">
		{kind === 'chapter' ? '📖' : kind === 'outline' ? '📜' : kind === 'folder' ? '📁' : kind === 'character' ? '🧑' : '📝'}
	</span>
);
