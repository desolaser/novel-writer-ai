import React, { useEffect, useRef, useState } from 'react';
import { useNovelWriter } from './store/novelWriterStore';
import { Icon } from './components/Icon';
import type NovelWriterPlugin from '../../../main';

/** Compact single-column outline: every chapter owns its collapsible outline editor. */
export function OutlineRoot({ plugin }: { plugin: NovelWriterPlugin }) {
	const { actos, capitulos, activeNovelId, createActo, createCapitulo, updateActo, deleteActo, updateCapitulo, deleteCapitulo, novels } = useNovelWriter();
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [editingCap, setEditingCap] = useState<string | null>(null);
	const [newAct, setNewAct] = useState('');
	const [addingTo, setAddingTo] = useState<string | null>(null); const [capName, setCapName] = useState('');
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
	useEffect(() => { const next: Record<string, string> = {}; capitulos.forEach(c => next[c.id_capitulo] = c.outline ?? ''); setDrafts(next); }, [capitulos]);
	if (novels.length === 0) return <div className="nw-empty-state"><p>Crea una novela para usar el outline.</p></div>;
	const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
	const saveOutline = (id: string, value: string) => { setDrafts(d => ({ ...d, [id]: value })); const old = timers.current[id]; if (old) clearTimeout(old); timers.current[id] = setTimeout(() => { void updateCapitulo(id, { outline: value }); }, 600); };
	const addCap = async (idActo: string) => { if (!capName.trim()) return; const c = await createCapitulo(idActo, capName.trim(), capitulos.filter(x => x.id_acto === idActo).length); setExpanded(s => new Set(s).add(c.id_capitulo)); setCapName(''); setAddingTo(null); };

	return <div className="nw-outline-view nw-outline-single-column">
		<div className="nw-outline-title"><strong>Outline</strong><button className="nw-btn nw-btn-primary" onClick={async () => { if (newAct.trim()) { await createActo(newAct.trim()); setNewAct(''); } }}>+ Acto</button></div>
		<div className="nw-outline-add"><input className="nw-input" value={newAct} onChange={e => setNewAct(e.target.value)} placeholder="Nuevo acto" onKeyDown={e => { if (e.key === 'Enter') void (async () => { if (newAct.trim()) { await createActo(newAct.trim()); setNewAct(''); } })(); }} /></div>
		{actos.map(a => { const caps = capitulos.filter(c => c.id_acto === a.id_acto); return <section className="nw-outline-act" key={a.id_acto}>
			<div className="nw-outline-act-header"><span className="nw-acto-name">{a.nombre}</span><span className="nw-node-count">{caps.length}</span><button className="nw-btn nw-btn-icon nw-btn-danger" onClick={() => { if (confirm(`Borrar acto "${a.nombre}"?`)) void deleteActo(a.id_acto); }}><Icon.Trash width={12} height={12} /></button></div>
			{caps.map(c => <div className="nw-outline-chapter" key={c.id_capitulo}>
				<div className="nw-outline-chapter-row">
					<button className="nw-outline-expand" onClick={() => toggle(c.id_capitulo)}>{expanded.has(c.id_capitulo) ? '▾' : '▸'}</button>
					{editingCap === c.id_capitulo ? <input className="nw-input nw-inline-rename" autoFocus defaultValue={c.nombre} onBlur={e => { const n = e.target.value.trim(); if (n && n !== c.nombre) void updateCapitulo(c.id_capitulo, { nombre: n }); setEditingCap(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingCap(null); }} /> : <button className="nw-outline-chapter-name" onClick={() => setEditingCap(c.id_capitulo)} title="Click para renombrar">{c.nombre}{c.outline ? ' *' : ''}</button>}
					<button className="nw-btn nw-btn-icon nw-btn-danger" onClick={() => { if (confirm(`Borrar "${c.nombre}"?`)) void deleteCapitulo(c.id_capitulo); }}><Icon.Trash width={12} height={12} /></button>
				</div>
				{expanded.has(c.id_capitulo) && <textarea className="nw-outline-inline-editor" value={drafts[c.id_capitulo] ?? ''} onChange={e => saveOutline(c.id_capitulo, e.target.value)} placeholder="Resumen de lo que pasará en este capítulo..." />}
			</div>)}
			{addingTo === a.id_acto ? <div className="nw-cap-add-row"><input className="nw-input" autoFocus value={capName} onChange={e => setCapName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void addCap(a.id_acto); if (e.key === 'Escape') setAddingTo(null); }} /><button className="nw-btn nw-btn-primary" onClick={() => void addCap(a.id_acto)}><Icon.Plus /></button></div> : <button className="nw-cap-add" onClick={() => { setAddingTo(a.id_acto); setCapName(''); }}>+ Capítulo</button>}
		</section>; })}
	</div>;
}
