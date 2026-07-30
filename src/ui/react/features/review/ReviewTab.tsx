import React, { useEffect, useRef, useState } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import UPlot from 'uplot';

export function ReviewTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { escenas, capitulos, actos, store } = useNovelWriter();
	const [data, setData] = useState<number[]>([]);
	const chartRef = useRef<HTMLDivElement>(null);
	const uRef = useRef<UPlot | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			if (!store) return;
			const counts: number[] = [];
			for (const e of escenas) {
				const t = await store.readEscenaTexto(e);
				counts.push(t.trim() ? t.trim().split(/\s+/).length : 0);
			}
			if (!cancelled) setData(counts);
		})();
		return () => { cancelled = true; };
	}, [escenas.length, store]);

	useEffect(() => {
		if (!chartRef.current || data.length === 0) return;
		if (uRef.current) { uRef.current.destroy(); uRef.current = null; }
		const labels = escenas.map((_, i) => i + 1) as any[];
		const u = new UPlot({
			width: chartRef.current.clientWidth || 600,
			height: 200,
			series: [{}, { label: 'Palabras', stroke: '#3498db', width: 2, points: { show: false } }],
			scales: { x: { time: false } },
			axes: [{}, { size: 40 }],
		}, [labels, data], chartRef.current);
		uRef.current = u;
		return () => { u.destroy(); uRef.current = null; };
	}, [data]);

	const total = data.reduce((a, b) => a + b, 0);
	const caps = capitulos.map(c => {
		const escs = escenas.filter(e => e.id_capitulo === c.id_capitulo);
		const sum = escs.reduce((a, e) => a + (data[escenas.indexOf(e)] ?? 0), 0);
		return { nombre: c.nombre, words: sum, escenas: escs.length };
	});

	return (
		<div className="nw-review">
			<div className="nw-review-stats">
				<div className="nw-stat-card"><div className="nw-stat-value">{total}</div><div className="nw-stat-label">Palabras totales</div></div>
				<div className="nw-stat-card"><div className="nw-stat-value">{actos.length}</div><div className="nw-stat-label">Actos</div></div>
				<div className="nw-stat-card"><div className="nw-stat-value">{capitulos.length}</div><div className="nw-stat-label">Capitulos</div></div>
				<div className="nw-stat-card"><div className="nw-stat-value">{escenas.length}</div><div className="nw-stat-label">Escenas</div></div>
			</div>
			<div className="nw-review-chart" ref={chartRef} />
			<div className="nw-review-table">
				<h3>Palabras por capitulo</h3>
				<table>
					<thead><tr><th>Capitulo</th><th>Escenas</th><th>Palabras</th></tr></thead>
					<tbody>
						{caps.map((c, i) => (
							<tr key={i}><td>{c.nombre}</td><td>{c.escenas}</td><td>{c.words}</td></tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}