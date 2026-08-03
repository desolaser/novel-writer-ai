import React, { useState } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { Icon } from '../../components/Icon';
import { Acto, Capitulo } from '../../../../domain';

export function PlanearTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { actos, capitulos, createActo, createCapitulo, updateActo, deleteActo, updateCapitulo, deleteCapitulo } = useNovelWriter();
	const [selected, setSelected] = useState<string | null>(null);
	const [outline, setOutline] = useState('');
	const chapter = capitulos.find(c => c.id_capitulo === selected);
	const selectChapter = (c: Capitulo) => { setSelected(c.id_capitulo); setOutline(c.outline ?? ''); };
	return <div className="nw-planear"><div className="nw-estructura-tree"><ActoTree actos={actos} capitulos={capitulos} selected={selected} onSelect={selectChapter} createActo={createActo} createCapitulo={createCapitulo} updateActo={updateActo} deleteActo={deleteActo} updateCapitulo={updateCapitulo} deleteCapitulo={deleteCapitulo} /></div><div className="nw-planear-editor">{chapter ? <><h3>Outline del capítulo <span className="nw-muted">{chapter.nombre}</span></h3><textarea className="nw-textarea nw-textarea-large" value={outline} onChange={e => setOutline(e.target.value)} onBlur={() => void updateCapitulo(chapter.id_capitulo, { outline })} placeholder="Resumen de lo que pasará en el capítulo..." /></> : <p className="nw-muted">Selecciona un capítulo para editar su outline.</p>}</div></div>;
}

interface Props { actos: Acto[]; capitulos: Capitulo[]; selected: string | null; onSelect: (c: Capitulo) => void; createActo: (n: string) => Promise<any>; createCapitulo: (id: string, n: string, o: number) => Promise<any>; updateActo: (id: string, p: Partial<Acto>) => Promise<void>; deleteActo: (id: string) => Promise<void>; updateCapitulo: (id: string, p: Partial<Capitulo>) => Promise<void>; deleteCapitulo: (id: string) => Promise<void>; }
function ActoTree(p: Props) {
	const [newAct, setNewAct] = useState(''); const [newCap, setNewCap] = useState(''); const [adding, setAdding] = useState<string | null>(null);
	return <><div className="nw-tree-toolbar"><input className="nw-input" value={newAct} onChange={e => setNewAct(e.target.value)} placeholder="Nuevo acto" /><button className="nw-btn nw-btn-primary" onClick={async () => { if (newAct.trim()) { await p.createActo(newAct.trim()); setNewAct(''); } }}>+ Acto</button></div>{p.actos.map(a => { const caps = p.capitulos.filter(c => c.id_acto === a.id_acto); return <div className="nw-acto-node" key={a.id_acto}><div className="nw-acto-row"><span className="nw-acto-name">{a.nombre}</span><span className="nw-node-count">{caps.length}</span><button className="nw-btn nw-btn-icon nw-btn-danger" onClick={() => { if (confirm(`Borrar acto "${a.nombre}"?`)) void p.deleteActo(a.id_acto); }}><Icon.Trash width={12} height={12} /></button></div>{caps.map(c => <div className="nw-cap-node" key={c.id_capitulo}><button className={'nw-cap-btn' + (p.selected === c.id_capitulo ? ' active' : '')} onClick={() => p.onSelect(c)}>{c.nombre}</button><button className="nw-btn nw-btn-icon nw-btn-danger" onClick={() => { if (confirm(`Borrar "${c.nombre}"?`)) void p.deleteCapitulo(c.id_capitulo); }}><Icon.Trash width={12} height={12} /></button></div>)}<button className="nw-cap-add" onClick={() => setAdding(a.id_acto)}>+ Capítulo</button>{adding === a.id_acto && <div className="nw-cap-add-row"><input className="nw-input" autoFocus value={newCap} onChange={e => setNewCap(e.target.value)} onKeyDown={async e => { if (e.key === 'Enter' && newCap.trim()) { await p.createCapitulo(a.id_acto, newCap.trim(), caps.length); setNewCap(''); setAdding(null); } }} /><button className="nw-btn nw-btn-primary" onClick={async () => { if (newCap.trim()) { await p.createCapitulo(a.id_acto, newCap.trim(), caps.length); setNewCap(''); setAdding(null); } }}><Icon.Plus /></button></div>}</div>; })}</>;
}
