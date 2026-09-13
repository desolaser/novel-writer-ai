import { useEffect, useRef } from 'react';
import { MarkdownRenderer } from 'obsidian';
import type NovelWriterPlugin from '../../../../../main';

/** Tiny markdown block renderer using Obsidian's built-in renderer. */
export function MarkdownBlock({ plugin, content }: { plugin: NovelWriterPlugin; content: string }) {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.empty();
		void MarkdownRenderer.renderMarkdown(content, el, '', plugin);
	}, [content, plugin]);
	return <div ref={ref} className="nw-markdown-body" />;
}
