import React, { useState, useEffect, useRef } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { Icon } from '../../components/Icon';
import { Acto, Capitulo } from '../../../../domain';

export function PlanearTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { actos, capitulos, escenas, createActo, createCapitulo, createEscena, deleteEscena, updateEscena, updateActo, deleteActo, updateCapitulo, deleteCapitulo, store } = useNovelWriter();
	const [selEsc, setSelEsc] = useState<string | null>(null);
	const [outline, setOutline] = useState('');
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const escaSel = escenas.find(e => e.id_escena === selEsc);

	useEffect(() => { setOutline(escaSel?.outline ?? ''); }, [selEsc]);

	// autosave outline silencioso (sin reloadAll)
	useEffect(() => {
		if (!escaSel || outline === escaSel.outline) return;
		if (timerRef.current) clearTimeout(timerRef.current);
		timerRef.current = setTimeout(async () => {
			await store!.updateEscena(escaSel.id_escena, { outline });
		}, 600);
		return () => { if (timerRef.current) clearTimeout(timerRef.current); };
	}, [outline, escaSel?.id_escena]);

	const getCap = (id: string) => capitulos.find(c => c.id_capitulo === id);

	return (
		<div className="nw-planear">
			<div className="nw-estructura-tree">
				<ActoTree
					actos={actos} capitulos={capitulos} escenas={(escenas as any[])} selEsc={selEsc}
					createActo={createActo} createCapitulo={createCapitulo} createEscena={createEscena}
					updateActo={updateActo} deleteActo={deleteActo}
					updateCapitulo={updateCapitulo} deleteCapitulo={deleteCapitulo}
					setSelEsc={setSelEsc}
				/>
			</div>
			<div className="nw-planear-editor">
				{escaSel ? (
					<>
						<h3>Outline de la escena <span className="nw-muted">{getCap(escaSel.id_capitulo)?.nombre}</span></h3>
						<textarea className="nw-textarea nw-textarea-large" value={outline} onChange={e => setOutline(e.target.value)} placeholder="Resumen de lo que pasara en esta escena..." />
						<div className="nw-editor-actions">
							<button className="nw-btn nw-btn-danger" onClick={async () => { if (confirm('Borrar escena?')) { await deleteEscena(escaSel.id_escena); setSelEsc(null); } }}><Icon.Trash /> Borrar escena</button>
						</div>
					</>
				) : (
					<p className="nw-muted">Selecciona o crea una escena para escribir su outline.</p>
				)}
			</div>
		</div>
	);
}

interface ActoTreeProps {
	actos: Acto[]; capitulos: Capitulo[]; escenas: any[];
	selEsc: string | null;
	createActo: (n: string) => Promise<any>;
	createCapitulo: (idActo: string, n: string, orden: number) => Promise<any>;
	createEscena: (idCap: string, orden: number) => Promise<any>;
	updateActo: (id: string, patch: Partial<Acto>) => Promise<void>;
	deleteActo: (id: string) => Promise<void>;
	updateCapitulo: (id: string, patch: Partial<Capitulo>) => Promise<void>;
	deleteCapitulo: (id: string) => Promise<void>;
	setSelEsc: (id: string | null) => void;
}

function ActoTree(p: ActoTreeProps) {
	const [renamingActo, setRenamingActo] = useState<string | null>(null);
	const [renamingCap, setRenamingCap] = useState<string | null>(null);
	const [newActo, setNewActo] = useState(''); const [addingActo, setAddingActo] = useState(false);
	const [newCap, setNewCap] = useState(''); const [addingCap, setAddingCap] = useState<string | null>(null);
	const [selCap, setSelCap] = useState<string | null>(null);

	const doCreateActo = async () => { if (!newActo.trim()) return; await p.createActo(newActo.trim()); setNewActo(''); setAddingActo(false); };
	const doCreateCap = async (idActo: string) => { if (!newCap.trim()) return; const capsA = p.capitulos.filter(c => c.id_acto === idActo); await p.createCapitulo(idActo, newCap.trim(), capsA.length); setNewCap(''); setAddingCap(null); };
	const doRenameActo = (a: Acto, value?: string) => { const n = (value ?? '').trim() || a.nombre; if (n !== a.nombre) p.updateActo(a.id_acto, { nombre: n }); setRenamingActo(null); };
	const doRenameCap = (c: Capitulo, value?: string) => { const n = (value ?? '').trim() || c.nombre; if (n !== c.nombre) p.updateCapitulo(c.id_capitulo, { nombre: n }); setRenamingCap(null); };

	return (
		<>
			<div className="nw-tree-toolbar">
				{addingActo ? (
					<>
						<input className="nw-input" placeholder="Nombre del acto" value={newActo} onChange={e => setNewActo(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') doCreateActo(); if (e.key === 'Escape') { setAddingActo(false); setNewActo(''); } }} />
						<button className="nw-btn nw-btn-primary" onClick={doCreateActo}><Icon.Plus /></button>
						<button className="nw-btn" onClick={() => { setAddingActo(false); setNewActo(''); }}><Icon.X /></button>
					</>
				) : (
					<button className="nw-btn nw-btn-primary" onClick={() => setAddingActo(true)}>+ Acto</button>
				)}
			</div>
			{p.actos.map(a => {
				const caps = p.capitulos.filter(c => c.id_acto === a.id_acto);
				return (
					<div key={a.id_acto} className="nw-acto-node">
						<div className="nw-acto-row">
							{renamingActo === a.id_acto ? (
								<input className="nw-input nw-inline-rename" defaultValue={a.nombre} autoFocus onKeyDown={e => { if (e.key === 'Enter') { doRenameActo(a, (e.target as HTMLInputElement).value); } if (e.key === 'Escape') setRenamingActo(null); }} onBlur={e => doRenameActo(a, e.target.value)} />
							) : (
								<span className="nw-acto-name" onClick={() => setRenamingActo(a.id_acto)} title="Renombrar">{a.nombre}</span>
							)}
							<span className="nw-node-count">{caps.length}</span>
							<button className="nw-btn nw-btn-icon nw-btn-danger" title="Borrar acto" onClick={() => { if (confirm(`Borrar acto "${a.nombre}" y todo su contenido?`)) p.deleteActo(a.id_acto); }}><Icon.Trash width={12} height={12} /></button>
						</div>
						{caps.map(c => {
							const escs = p.escenas.filter(e => e.id_capitulo === c.id_capitulo);
							return (
								<div key={c.id_capitulo} className="nw-cap-node">
									<div className="nw-cap-row">
										{renamingCap === c.id_capitulo ? (
											<input className="nw-input nw-inline-rename" defaultValue={c.nombre} autoFocus onKeyDown={e => { if (e.key === 'Enter') { doRenameCap(c, (e.target as HTMLInputElement).value); } if (e.key === 'Escape') setRenamingCap(null); }} onBlur={e => doRenameCap(c, e.target.value)} />
										) : (
											<span className="nw-cap-name" onClick={() => setRenamingCap(c.id_capitulo)} title="Renombrar">{c.nombre}</span>
										)}
										<span className="nw-node-count">{escs.length}</span>
										<button className="nw-btn nw-btn-icon nw-btn-danger" title="Borrar" onClick={() => { if (confirm(`Borrar "${c.nombre}"?`)) p.deleteCapitulo(c.id_capitulo); }}><Icon.Trash width={12} height={12} /></button>
									</div>
									{c.id_capitulo === selCap && (
										<div className="nw-esc-list">
											{escs.map((e: any, i) => (
												<button key={e.id_escena} className={`nw-esc-btn ${e.id_escena === p.selEsc ? 'active' : ''}`} onClick={() => p.setSelEsc(e.id_escena)}>
													Escena {i + 1}{e.outline ? ' *' : ''}
												</button>
											))}
											<button className="nw-esc-add" onClick={async () => { const nE = await p.createEscena(c.id_capitulo, escs.length); p.setSelEsc(nE.id_escena); }}>+ Escena</button>
										</div>
									)}
								</div>
							);
						})}
						{addingCap === a.id_acto ? (
							<div className="nw-cap-add-row">
								<input className="nw-input" placeholder="Nombre capitulo" value={newCap} onChange={e => setNewCap(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') { doCreateCap(a.id_acto); } if (e.key === 'Escape') { setAddingCap(null); setNewCap(''); } }} />
								<button className="nw-btn nw-btn-primary" onClick={() => doCreateCap(a.id_acto)}><Icon.Plus /></button>
								<button className="nw-btn" onClick={() => { setAddingCap(null); setNewCap(''); }}><Icon.X /></button>
							</div>
						) : (
							<button className="nw-cap-add" onClick={() => { setAddingCap(a.id_acto); setSelCap(a.id_acto && (caps[caps.length - 1]?.id_capitulo ?? null)); }}>+ Capitulo</button>
						)}
					</div>
				);
			})}
		</>
	);
}