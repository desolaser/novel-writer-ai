import React, { useRef, useEffect } from 'react';
import { MarkdownRenderer, App } from 'obsidian';

/**
 * Renderiza markdown usando el motor de Obsidian. El contenedor_ref se
 * reutiliza para evitar event listeners duplicados. Debounce por defecto.
 */
export function MarkdownPreview({ app, text, sourcePath = '', debounceMs = 200 }: { app: App; text: string; sourcePath?: string; debounceMs?: number }) {
	const ref = useRef<HTMLDivElement>(null);
	const compRef = useRef<any>(null);
	useEffect(() => {
		if (!ref.current) return;
		if (!compRef.current) {
			compRef.current = { _loaded: false };
		}
		const t = setTimeout(async () => {
			if (!ref.current) return;
			ref.current.empty();
			await MarkdownRenderer.render(app, text, ref.current, sourcePath, compRef.current);
		}, debounceMs);
		return () => clearTimeout(t);
	}, [text, sourcePath, debounceMs]);
	useEffect(() => () => { compRef.current?._loaded && (compRef.current._loaded = false); }, []);
	return <div ref={ref} className="nw-md-preview markdown-rendered" style={{ flex: 1, overflowY: 'auto', padding: '20px' }} />;
}