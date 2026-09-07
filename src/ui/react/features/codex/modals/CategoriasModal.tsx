import { App, Modal } from 'obsidian';
import { Root, createRoot } from 'react-dom/client';
import React from 'react';
import { useNovelWriter } from '../../../store/novelWriterStore';
import { DEFAULT_COLORS as PALETTE } from '../../../../../constants/novel';
import { Icon } from '../../../components/Icon';
import { Categoria } from '../../../../../domain';
import type NovelWriterPlugin from '../../../../../../main';

export class CategoriasModal extends Modal {
	private root: Root | null = null;
	private plugin: NovelWriterPlugin;
	constructor(app: App, plugin: NovelWriterPlugin) { super(app); this.plugin = plugin; this.modalEl.addClass('nw-modal-large'); }
	async onOpen() {
		await useNovelWriter.getState().reloadAll();
		this.root = createRoot(this.contentEl);
		this.root.render(React.createElement(CategoriasView, { plugin: this.plugin, close: () => this.close() }));
	}
	async onClose() { if (this.root) { this.root.unmount(); this.root = null; } }
}

function CategoriasView() {
	const store = useNovelWriter();
	const custom = store.categorias.filter(c => !c.system);
	const { createCategoria, updateCategoria, deleteCategoria, entradas } = store;
	const [selected, setSelected] = React.useState<string | null>(custom[0]?.id_categoria ?? null);
	const [query, setQuery] = React.useState('');
	const [draft, setDraft] = React.useState<Categoria | null>(null);

	React.useEffect(() => { if (selected) { const c = custom.find(x => x.id_categoria === selected); setDraft(c ?? null); } }, [selected, custom.length]);

	const filtered = custom.filter(c => c.nombre.toLowerCase().includes(query.toLowerCase()));
	const count = (id: string) => entradas.filter(e => e.id_categoria === id).length;

	const doCreate = async () => {
		await createCategoria("", PALETTE[0]);
		// seleccionar la nueva
		setTimeout(() => { 
			const all = useNovelWriter.getState().categorias; 
			const nC = all.find(c => c.nombre === "" && !c.system); 
			if (nC) setSelected(nC.id_categoria); }
		, 100);
	};

	const doSave = async () => { if (draft) await updateCategoria(draft); };
	const doDelete = async () => {
		if (!draft) return;
		if (count(draft.id_categoria) > 0) { alert('This category has entries. Move them first.'); return; }
		if (confirm('Delete category?')) { await deleteCategoria(draft.id_categoria); setSelected(null); setDraft(null); }
	};

	return (
		<div className="nw-modal-2col">
			<div className="nw-modal-left">
				<h3>Custom categories</h3>
				<input className="nw-input" placeholder="Search..." value={query} onChange={e => setQuery(e.target.value)} />
				<button className="nw-btn nw-btn-primary" style={{ width: '100%', marginTop: 8 }} onClick={() => doCreate()}>+ New category</button>
				<div className="nw-modal-list">
					{filtered.map(c => (
						<button key={c.id_categoria} className={`nw-list-item ${c.id_categoria === selected ? 'active' : ''}`} onClick={() => setSelected(c.id_categoria)}>
							<span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: c.color, marginRight: 6 }} />
							<span style={{ flex: 1 }}>{c.nombre == "" ? "Unnamed" : c.nombre}</span>
							<span className="nw-node-count">{count(c.id_categoria)}</span>
						</button>
					))}
					{filtered.length === 0 && <p className="nw-muted">No custom categories.</p>}
				</div>
			</div>
			<div className="nw-modal-right">
				{draft ? (
					<div className="nw-entry-tab" style={{ gap: 10, height: '100%' }}>
						<h3 style={{ margin: 0 }}>Edit category</h3>
						<label>Name</label>
						<input 
							className="nw-input" 
							value={draft.nombre} 
							onChange={e => setDraft({ ...draft, nombre: e.target.value })}
							placeholder='Unnamed'
						/>
						<label>Color</label>
						<div className="nw-color-row">
							{PALETTE.map(c => (
								<button key={c} className="nw-color-swatch" style={{ background: c, outline: draft.color === c ? '2px solid var(--text-normal)' : 'none' }} onClick={() => setDraft({ ...draft, color: c })} />
							))}
							<input type="color" value={draft.color} onChange={e => setDraft({ ...draft, color: e.target.value })} style={{ width: 32, height: 24, padding: 0, border: 'none', background: 'none' }} />
						</div>
						<div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
							<button className="nw-btn nw-btn-primary" onClick={doSave}>Save</button>
							<button className="nw-btn nw-btn-danger" onClick={doDelete}><Icon.Trash /> Delete</button>
						</div>
					</div>
				) : (
					<p className="nw-muted">Select or create a custom category.</p>
				)}
			</div>
		</div>
	);
}