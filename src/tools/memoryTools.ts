import type {
	ChapterToolContext,
	MemoryToolContext,
} from '../interfaces/tool-context';
import type { PromptMetaKey } from '../types/PromptMeta';
import { joinGeneratedMemory, splitGeneratedMemory } from '../utils/generatedMemory';
import { resolveChapter } from './chapterTools';

/**
 * Memory and author note, the two texts the autocomplete sends with every
 * request. They live at the chapter level (frontmatter of its manuscript) or
 * the novel level (`_config.md` in the novel folder). The story history the
 * outline generates inside a chapter memory is kept intact: these tools only
 * read and write the author's part.
 */

type MemoryContext = ChapterToolContext & MemoryToolContext;

const FIELDS: Record<string, PromptMetaKey> = {
	memory: 'memoryContent',
	author_note: 'authorNote',
};

const LABELS: Record<PromptMetaKey, string> = {
	memoryContent: 'Memory',
	authorNote: 'Author note',
};

interface Scope {
	chapterId: string | null;
	label: string;
}

function resolveScope(args: Record<string, string>, context: MemoryContext): Scope {
	if (!args.chapter?.trim()) return { chapterId: null, label: 'the novel' };
	const chapter = resolveChapter(args.chapter, context);
	return { chapterId: chapter.id_capitulo, label: `chapter "${chapter.nombre}"` };
}

async function describeField(key: PromptMetaKey, scope: Scope, context: MemoryContext): Promise<string> {
	const layers = await context.readPromptMeta(scope.chapterId, key);
	const parts = splitGeneratedMemory(layers.own ?? '');
	const lines = [`${LABELS[key]} of ${scope.label}: ${parts.authored || '(empty)'}`];
	if (parts.generated) {
		lines.push(`Generated story context (kept by the outline, read-only): ${parts.generated}`);
	}
	if (layers.own === null && layers.inherited.trim()) {
		lines.push(`Inherited from a higher level: ${layers.inherited.trim()}`);
	}
	return lines.join('\n');
}

export async function readMemory(args: Record<string, string>, context: MemoryContext): Promise<string> {
	const scope = resolveScope(args, context);
	const memory = await describeField('memoryContent', scope, context);
	const note = await describeField('authorNote', scope, context);
	return `${memory}\n\n${note}`;
}

export async function writeMemory(args: Record<string, string>, context: MemoryContext): Promise<string> {
	const field = (args.field ?? 'memory').trim().toLowerCase();
	const key = FIELDS[field];
	if (!key) throw new Error('Argument "field" must be memory or author_note.');
	const content = (args.content ?? '').trim();
	const append = (args.mode ?? 'replace').trim().toLowerCase() === 'append';
	if (!content && append) throw new Error('Argument "content" is required to append.');

	const scope = resolveScope(args, context);
	const layers = await context.readPromptMeta(scope.chapterId, key);
	const parts = splitGeneratedMemory(layers.own ?? '');
	const authored = append && parts.authored ? `${parts.authored}\n\n${content}` : content;
	await context.writePromptMeta(scope.chapterId, key, joinGeneratedMemory({ ...parts, authored }));

	const verb = append ? 'Extended' : (content ? 'Replaced' : 'Cleared');
	return `${verb} the ${LABELS[key].toLowerCase()} of ${scope.label}.`;
}
