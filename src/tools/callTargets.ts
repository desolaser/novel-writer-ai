import type { ToolContext } from '../interfaces/tool-context';
import type { ToolCall } from '../types/AiTool';
import { orderedChapters, resolveChapter } from './chapterTools';
import { resolveEntry } from './codexShared';
import { orderedActs, resolveAct } from './structureTools';

/**
 * What a call's references point to, for the author to read before approving.
 * The model may write "#11" or part of a name; the card then shows which
 * chapter, act or entry that is. Pure apart from reading the context.
 */

type Resolver = (reference: string, context: ToolContext) => string;

const RESOLVERS: Record<string, Resolver> = {
	chapter: (reference, context) => {
		const chapter = resolveChapter(reference, context);
		const position = orderedChapters(context).indexOf(chapter) + 1;
		return `#${position} ${chapter.nombre}`;
	},
	act: (reference, context) => {
		const act = resolveAct(reference, context);
		return `#${orderedActs(context).indexOf(act) + 1} ${act.nombre}`;
	},
	entry: (reference, context) => resolveEntry(reference, context).nombre,
};

function sameText(first: string, second: string): boolean {
	return first.trim().toLowerCase() === second.trim().toLowerCase();
}

/**
 * Resolved names of the call's references, by argument name. Only the ones
 * that say more than what the model wrote; a reference that does not resolve
 * is left out (the call itself will report it).
 */
export function resolveCallTargets(call: ToolCall, context: ToolContext): Record<string, string> {
	const targets: Record<string, string> = {};
	for (const [name, resolve] of Object.entries(RESOLVERS)) {
		const reference = (call.args[name] ?? '').trim();
		if (!reference) continue;
		try {
			const resolved = resolve(reference, context);
			const plainName = resolved.replace(/^#\d+ /, '');
			if (!sameText(reference, plainName)) targets[name] = resolved;
		} catch {
			// Unresolved: the tool's own error explains it once it runs.
		}
	}
	return targets;
}
