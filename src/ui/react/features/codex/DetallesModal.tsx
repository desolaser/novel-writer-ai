import { App, Modal } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import { DEFAULT_COLORS as PALETTE } from '../../../../constants/novel';
import { Icon } from '../../components/Icon';
import { TipoDetalle, OpcionDetalle, nowISO } from '../../../../domain';
import { genId } from '../../../../utils/ids';
import type NovelWriterPlugin from '../../../../../main';

export class DetallesModal extends Modal {
	private root: Root | null = null;
	private plugin: NovelWriterPlugin;
	private initialId: string | null;
	private initialTab: 'general' | 'ai' | 'opciones' | null;
	constructor(app: App, plugin: NovelWriterPlugin, opts: { initialId?: string | null; initialTab?: 'general' | 'ai' | 'opciones' } = {}) { super(app); this.plugin = plugin; this.modalEl.addClass('nw-modal-large'); this.initialId = opts.initialId ?? null; this.initialTab = opts.initialTab ?? null; }
	async onOpen() {
		await useNovelWriter.getState().reloadAll();
		this.root = createRoot(this.contentEl);
		this.root.render(React.createElement(DetallesView, { plugin: this.plugin, initialId: this.initialId, initialTab: this.initialTab }));
	}
	async onClose() { if (this.root) { this.root.unmount(); this.root = null; } }
}

function DetallesView({ plugin, initialId, initialTab }: { plugin: NovelWriterPlugin; initialId?: string | null; initialTab?: 'general' | 'ai' | 'opciones' | null }) {
	const { detalles, categorias, createDetalle, updateDetalle, listAllDetallesExtended, setDetalleCategorias, store } = useNovelWriter() as any;
	const [selected, setSelected] = React.useState<string | null>((initialId && detalles.find((d: any) => d.id_detalle === initialId) ? initialId : null) ?? detalles[0]?.id_detalle ?? null);
	const [query, setQuery] = React.useState('');
	const [tab, setTab] = React.useState<'general' | 'ai' | 'opciones'>(initialTab ?? 'general');
	const [detalleCats, setDetalleCats] = React.useState<string[]>([]);

	const sel = detalles.find((d: any) => d.id_detalle === selected);
	const extended = useNovelWriter().detalles;

	React.useEffect(() => {
		if (!sel || !store) return;
		// Cargar categorias asociadas a este detalle
		store.listDetallesExtended().then((data: any) => {
			const rels = (data?.detalle_categorias ?? []).filter((dc: any) => dc.id_detalle === sel.id_detalle);
			setDetalleCats(rels.map((r: any) => r.id_categoria));
		});
	}, [sel?.id_detalle]);

	const tipos = [
		{ v: TipoDetalle.Text, l: 'Text (textarea)', icon: 'T' },
		{ v: TipoDetalle.Line, l: 'Line (input)', icon: 'L' },
		{ v: TipoDetalle.Dropdown, l: 'Dropdown', icon: 'D' },
		{ v: TipoDetalle.CodexRef, l: 'Ref. Codex', icon: 'R' },
	];

	// Crear detalle con defaults y seleccionarlo
	const doCreate = async () => {
		const d = await createDetalle('', TipoDetalle.Text, true);
		// d es un Detalle; seleccionarlo
		const all = useNovelWriter().detalles;
		const nD = all[all.length - 1];
		if (nD) { setSelected(nD.id_detalle); setTab('general'); }
	};

	const typeIcon = (t: TipoDetalle) => tipos.find(x => x.v === t)?.icon ?? '?';
	const filtered = detalles.filter((d: any) => (d.nombre || '').toLowerCase().includes(query.toLowerCase()) || !d.nombre);

	return (
		<div className="nw-modal-2col">
			<div className="nw-modal-left">
				<h3>Detalles</h3>
				<input className="nw-input" placeholder="Buscar..." value={query} onChange={e => setQuery(e.target.value)} />
				<button className="nw-btn nw-btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={doCreate}>+ Nuevo detalle</button>
				<div className="nw-modal-list">
					{filtered.map((d: any) => {
						return (
							<button key={d.id_detalle} className={`nw-list-item ${d.id_detalle === selected ? 'active' : ''}`} onClick={() => setSelected(d.id_detalle)}>
								<span style={{ display: 'inline-flex', width: 16, justifyContent: 'center', fontWeight: 700, marginRight: 4 }}>{typeIcon(d.tipo_detalle)}</span>
								<span style={{ flex: 1 }}>{d.nombre || '(sin nombre)'}</span>
								{d.incluir_ia && <span title="Incluido en IA" style={{ color: 'var(--text-accent)', fontSize: 10 }}>IA</span>}
							</button>
						);
					})}
				</div>
			</div>
			<div className="nw-modal-right nw-modal-right-fill">
				{sel ? (
					<div className="nw-detalles-edit" style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%', overflow: 'hidden' }}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
							<h3 style={{ flex: 1, margin: 0 }}>Editar detalle</h3>
							<button className="nw-btn nw-btn-danger" onClick={async () => { if (confirm('Borrar detalle?')) { await useNovelWriter.getState().deleteDetalle(sel.id_detalle); setSelected(null); } }} title="Borrar"><Icon.Trash /></button>
						</div>
						<div className="nw-tab-bar" style={{ flexShrink: 0 }}>
							<button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>General</button>
							<button className={tab === 'ai' ? 'active' : ''} onClick={() => setTab('ai')}>IA</button>
							{sel.tipo_detalle === TipoDetalle.Dropdown && <button className={tab === 'opciones' ? 'active' : ''} onClick={() => setTab('opciones')}>Opciones</button>}
						</div>
						<div style={{ flex: 1, overflowY: 'auto' }}>
							{tab === 'general' && (
								<div className="nw-entry-tab" style={{ gap: 8 }}>
									<label>Nombre</label>
									<input className="nw-input" value={sel.nombre} placeholder="Detalle sin nombre" onChange={e => updateDetalle({ ...sel, nombre: e.target.value })} onBlur={() => updateDetalle({ ...sel })} />
									<label>Tipo de detalle</label>
									<select className="nw-select" value={sel.tipo_detalle} onChange={e => updateDetalle({ ...sel, tipo_detalle: e.target.value as TipoDetalle })}>
										{tipos.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}
									</select>
									<label>Tipos asociados (categorias)</label>
									<div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
										{categorias.map((c: any) => (
											<label key={c.id_categoria} className="nw-checkbox">
												<input type="checkbox" checked={detalleCats.includes(c.id_categoria)} onChange={async (e) => {
													let next = [...detalleCats];
													if (e.target.checked) { if (!next.includes(c.id_categoria)) next.push(c.id_categoria); }
													else { next = next.filter(x => x !== c.id_categoria); }
													setDetalleCats(next);
													await setDetalleCategorias(sel.id_detalle, next);
												}} />
												<span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c.color, marginRight: 4 }} />
												{c.nombre}
											</label>
										))}
									</div>
								</div>
							)}
							{tab === 'ai' && (
								<div className="nw-entry-tab" style={{ gap: 8 }}>
									<label className="nw-checkbox"><input type="checkbox" checked={sel.incluir_ia} onChange={e => updateDetalle({ ...sel, incluir_ia: e.target.checked })} /> Incluir en IA</label>
								</div>
							)}
							{tab === 'opciones' && <DetalleOpciones detalle={sel} store={store} />}
						</div>
					</div>
				) : (
					<p className="nw-muted">Selecciona o crea un detalle.</p>
				)}
			</div>
		</div>
	);
}

function DetalleOpciones({ detalle, store }: { detalle: any; store: any }) {
	const [opciones, setOpciones] = React.useState<any[]>([]);
	React.useEffect(() => { if (store) store.listOpcionesByDetalle(detalle.id_detalle).then((o: any[]) => setOpciones(o.sort((a: any, b: any) => a.orden - b.orden))); }, [detalle.id_detalle]);

	const addOpcion = async () => {
		const op: OpcionDetalle = {
			id_opcion_detalle: genId(), nombre: 'Nueva opcion', color: PALETTE[0], orden: opciones.length, id_detalle: detalle.id_detalle,
			created_at: nowISO(), updated_at: nowISO(),
		};
		await useNovelWriter.getState().upsertOpcion(op);
		setOpciones([...opciones, op]);
	};
	const move = (i: number, dir: number) => {
		const j = i + dir; if (j < 0 || j >= opciones.length) return;
		const arr = [...opciones]; const [item] = arr.splice(i, 1); arr.splice(j, 0, item);
		arr.forEach((o, k) => { o.orden = k; useNovelWriter.getState().upsertOpcion(o); });
		setOpciones(arr);
	};

	return (
		<div className="nw-entry-tab" style={{ gap: 6 }}>
			<label>Opciones de Dropdown</label>
			<p className="nw-muted" style={{ fontSize: 11 }}>Define las opciones para el dropdown/menu.</p>
			<div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
				{opciones.map((o: any, i: number) => (
					<div key={o.id_opcion_detalle} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
						<button className="nw-btn nw-btn-icon" onClick={() => move(i, -1)} disabled={i === 0} title="Subir">▲</button>
						<button className="nw-btn nw-btn-icon" onClick={() => move(i, 1)} disabled={i === opciones.length - 1} title="Bajar">▼</button>
						<input className="nw-input" style={{ flex: 1 }} value={o.nombre} onChange={async e => { const n = { ...o, nombre: e.target.value }; setOpciones(opciones.map(x => x.id_opcion_detalle === o.id_opcion_detalle ? n : x)); await useNovelWriter.getState().upsertOpcion(n); }} placeholder="Nombre opcion" />
						<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 16px)', gap: 4 }}>
							{PALETTE.slice(0, 10).map(c => (
								<button key={c} className="nw-color-swatch" style={{ background: c, width: 16, height: 16, outline: o.color === c ? '2px solid var(--text-normal)' : 'none' }} onClick={() => { const n = { ...o, color: c }; setOpciones(opciones.map(x => x.id_opcion_detalle === o.id_opcion_detalle ? n : x)); useNovelWriter.getState().upsertOpcion(n); }} />
							))}
						</div>
						<input type="color" style={{ width: 24, height: 20, padding: 0, border: 'none', background: 'none' }} value={o.color} onChange={e => { const n = { ...o, color: e.target.value }; setOpciones(opciones.map(x => x.id_opcion_detalle === o.id_opcion_detalle ? n : x)); useNovelWriter.getState().upsertOpcion(n); }} title="Color picker" />
						<button className="nw-btn nw-btn-icon nw-btn-danger" onClick={() => { useNovelWriter.getState().deleteOpcion(o.id_opcion_detalle); setOpciones(opciones.filter(x => x.id_opcion_detalle !== o.id_opcion_detalle)); }} title="Borrar"><Icon.Trash width={12} height={12} /></button>
					</div>
				))}
			</div>
			<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
				<button className="nw-btn nw-btn-primary" onClick={addOpcion}>+ Agregar Opcion</button>
				<button className="nw-btn" onClick={() => { const s = [...opciones].sort((a, b) => a.nombre.localeCompare(b.nombre)); s.forEach((o, k) => { o.orden = k; useNovelWriter.getState().upsertOpcion(o); }); setOpciones(s); }}>Ordenar alfabeticamente</button>
			</div>
		</div>
	);
}