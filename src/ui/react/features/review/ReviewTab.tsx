import React, { useEffect, useState } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';

export function ReviewTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { capitulos, actos, store } = useNovelWriter();
	const [words, setWords] = useState<Record<string, number>>({});
	useEffect(() => {
		let cancelled = false;
		void (async () => {
			if (!store) return;
			const next: Record<string, number> = {};
			for (const chapter of capitulos) {
				const text = await store.readCapituloTexto(chapter.id_capitulo);
				next[chapter.id_capitulo] = text.trim() ? text.trim().split(/\s+/).length : 0;
			}
			if (!cancelled) setWords(next);
		})();
		return () => { cancelled = true; };
	}, [capitulos, store]);
	const total = Object.values(words).reduce((sum, count) => sum + count, 0);
	return <div className="nw-review"><div className="nw-review-stats"><div className="nw-stat-card"><div className="nw-stat-value">{total}</div><div className="nw-stat-label">Palabras totales</div></div><div className="nw-stat-card"><div className="nw-stat-value">{actos.length}</div><div className="nw-stat-label">Actos</div></div><div className="nw-stat-card"><div className="nw-stat-value">{capitulos.length}</div><div className="nw-stat-label">Capítulos</div></div></div><div className="nw-review-table"><h3>Palabras por capítulo</h3><table><thead><tr><th>Capítulo</th><th>Palabras</th></tr></thead><tbody>{capitulos.map(chapter => <tr key={chapter.id_capitulo}><td>{chapter.nombre}</td><td>{words[chapter.id_capitulo] ?? 0}</td></tr>)}</tbody></table></div></div>;
}
