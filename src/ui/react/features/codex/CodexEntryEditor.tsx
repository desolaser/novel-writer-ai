import React, { useState, useEffect, useRef } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import { AiContextPolicy, TipoDetalle } from '../../../../domain';
import type NovelWriterPlugin from '../../../../../main';
import { DEFAULT_COLORS as PALETTE } from '../../../../constants/novel';
import { Icon } from '../../components/Icon';
import { DetallesModal } from './DetallesModal';
import { ThumbnailCropModal } from './ThumbnailCropModal';

type Tab = 'detalles' | 'investigacion' | 'relaciones' | 'menciones' | 'tracking';

export function CodexEntryEditor({ plugin, onClose }: { plugin: NovelWriterPlugin; onClose?: () => void }) {
	const storeState = useNovelWriter() as any;
	const {
		entradas, editingEntryId, setEditingEntry, updateEntry, deleteEntry, archiveEntry,
		addReferencia, removeReferencia, setEntryTags, findOrCreateTag, tags, categorias, novels,
		store, refreshEntry, moveEntryToNovel, setEntryThumbnail,
	} = storeState;

	const entry = entradas.find((e: any) => e.id_entrada_codex === editingEntryId) ?? null;
	const [tab, setTab] = useState<Tab>('detalles');
	const [draft, setDraft] = useState<any>(entry);
	const [dirty, setDirty] = useState(false);
	const [tagInputOpen, setTagInputOpen] = useState(false);
	const [tagInput, setTagInput] = useState('');
	const [newUrl, setNewUrl] = useState('');
	const [menuOpen, setMenuOpen] = useState(false);
	const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
	const thumbInputRef = useRef<HTMLInputElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		setDraft(entry); setDirty(false);
		setMenuOpen(false); setTagInputOpen(false);
		setTab('detalles'); setCollapsed(new Set());
	}, [editingEntryId]);

	useEffect(() => {
		if (!menuOpen) return;
		const onDoc = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [menuOpen]);

	if (!entry || !draft) {
		return <div className="nw-empty-state"><button className="nw-btn" onClick={() => setEditingEntry(null)}>Volver</button></div>;
	}

	const mergeLive = (d: any) => ({ ...d, detalles: entry.detalles ?? d.detalles, referencias_externas: entry.referencias_externas ?? d.referencias_externas, tags: entry.tags ?? d.tags, thumbnail: entry.thumbnail ?? d.thumbnail });
	const patch = (p: any) => { setDraft({ ...draft, ...p }); setDirty(true); };
	const save = async () => { const merged = mergeLive(draft); await updateEntry(merged); setDraft(merged); setDirty(false); };
	const patchAndSave = async (p: any) => { const next = { ...draft, ...p }; const merged = mergeLive(next); setDraft(next); await updateEntry(merged); setDirty(false); };
	const addTag = async () => {
		const names = tagInput.split(',').map((s: string) => s.trim()).filter(Boolean);
		if (names.length === 0) return;
		const ids = [...(draft.tags ?? [])];
		for (const n of names) {
			const t = await findOrCreateTag(capitalize(n));
			if (!ids.includes(t.id_tag)) ids.push(t.id_tag);
		}
		setTagInput('');
		await setEntryTags(entry.id_entrada_codex, ids);
		setDraft({ ...draft, tags: ids });
	};
	const removeTag = async (id: string) => {
		const next = (draft.tags ?? []).filter((t: string) => t !== id);
		await setEntryTags(entry.id_entrada_codex, next);
		setDraft({ ...draft, tags: next });
	};

	const onPickThumbnail = (file: File) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = async () => {
			if (img.width === img.height) {
				URL.revokeObjectURL(url);
				const canvas = document.createElement('canvas');
				canvas.width = 256; canvas.height = 256;
				const ctx = canvas.getContext('2d')!;
				ctx.drawImage(img, 0, 0, 256, 256);
				await setEntryThumbnail(entry.id_entrada_codex, canvas.toDataURL('image/png'));
			} else {
				new ThumbnailCropModal(plugin.app as any, url, async (dataUrl) => {
					URL.revokeObjectURL(url);
					await setEntryThumbnail(entry.id_entrada_codex, dataUrl);
				}).open();
			}
		};
		img.src = url;
	};
	const onClearThumbnail = async () => { setMenuOpen(false); await setEntryThumbnail(entry.id_entrada_codex, null); };
	const onSelectColor = async (color: string | null) => { setMenuOpen(false); await patchAndSave({ color }); };
	const onSelectMove = async (targetNovelId: string) => { setMenuOpen(false); if (targetNovelId === entry.id_novela) return; await moveEntryToNovel(entry.id_entrada_codex, targetNovelId); setEditingEntry(null); };
	const onArchive = async () => { setMenuOpen(false); await archiveEntry(entry.id_entrada_codex, !entry.archivado); setEditingEntry(null); };
	const onDelete = async () => { setMenuOpen(false); if (confirm('Borrar entrada definitivamente?')) { await deleteEntry(entry.id_entrada_codex); setEditingEntry(null); onClose?.(); } };

	const otherNovels = ((novels ?? []) as any[]).filter((n: any) => n.novela && n.novela.id_novela !== entry.id_novela);
	return (
		<div className="nw-entry-editor">
			<div className="nw-editor-top">
				<div className="nw-editor-top-left">
					<div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start" }}>
						{/* <button className="nw-btn nw-btn-icon nw-editor-back-btn" onClick={() => { setEditingEntry(null); onClose?.(); }} title="Cerrar"><Icon.X width={16} height={16} /></button> */}
						<CategoriaPicker value={draft.id_categoria} categorias={categorias} onChange={(v) => patchAndSave({ id_categoria: v })} />
					</div>
					<input
						className="nw-entry-name-input"
						style={draft.color ? { color: draft.color } : undefined}
						value={draft.nombre}
						onChange={(e) => patch({ nombre: e.target.value })}
						onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); save(); } }}
						placeholder="Nombre"
					/>
					<div className="nw-entry-tags-inline">
						{(draft.tags ?? []).map((id: string) => {
							const t = tags.find((x: any) => x.id_tag === id);
							return (
								<span key={id} className="nw-tag-chip" style={t?.color ? { background: t.color } : {}}>
									{t?.nombre ?? '?'}
									<button className="nw-tag-x" onClick={(e) => { e.stopPropagation(); removeTag(id); }}>
										<Icon.X width={10} height={10} />
									</button>
								</span>
							);
						})}
						{tagInputOpen ? (
							<input
								className="nw-input nw-tag-input"
								placeholder="Add tags (comma sep)..."
								value={tagInput}
								onChange={(e) => setTagInput(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); }
									if (e.key === 'Escape') { setTagInput(''); setTagInputOpen(false); }
								}}
								onBlur={() => { if (tagInput) addTag(); else setTagInputOpen(false); }}
								autoFocus
							/>
						) : (
							<button className="nw-btn-link" onClick={() => setTagInputOpen(true)}>+ Add Tags/Labels</button>
						)}
					</div>
				</div>
				<div className="nw-editor-top-right">
					<ThumbnailControl
						thumbnail={entry.thumbnail}
						onPick={onPickThumbnail}
						fileInputRef={thumbInputRef}
					/>
					<div ref={menuRef} style={{ position: 'relative' }}>
						<button className="nw-btn nw-btn-icon" onClick={() => setMenuOpen(!menuOpen)} title="Opciones">
							<Icon.MenuThreePoints />
						</button>
						{menuOpen && (
							<ThreeDotsMenu
								entry={entry}
								otherNovels={otherNovels}
								onSelectColor={onSelectColor}
								onSelectMove={onSelectMove}
								onClearThumbnail={onClearThumbnail}
								onArchive={onArchive}
								onDelete={onDelete}
							/>
						)}
					</div>
				</div>
			</div>

			<div className="nw-codex-editor-bar">
				<div className="nw-tab-bar nw-tab-bar-compact">
					<button className={tab === 'detalles' ? 'active' : ''} onClick={() => setTab('detalles')}>Details</button>
					<button className={tab === 'investigacion' ? 'active' : ''} onClick={() => setTab('investigacion')}>Research</button>
					<button className={tab === 'relaciones' ? 'active' : ''} onClick={() => setTab('relaciones')}>Relations</button>
					<button className={tab === 'menciones' ? 'active' : ''} onClick={() => setTab('menciones')}>Mentions</button>
					<button className={tab === 'tracking' ? 'active' : ''} onClick={() => setTab('tracking')}>Tracking</button>
				</div>
				<span className="nw-mentions">0 mentions</span>
			</div>

			<div className="nw-tab-content">
				{tab === 'detalles' && (
					<div className="nw-entry-tab">
						<div className="nw-field nw-field-stacked">
							<label>Aliases/Nicknames</label>
							<input className="nw-input" value={draft.alias} onChange={(e) => patch({ alias: e.target.value })} onBlur={() => { if (dirty) save(); }} placeholder="Add aliases, ..." />
						</div>
						<div className="nw-field nw-field-stacked">
							<label>Description</label>
							<textarea className="nw-textarea" rows={6} value={draft.descripcion} onChange={(e) => patch({ descripcion: e.target.value })} placeholder="Write a short summary here..." onBlur={() => { if (dirty) save(); }} />
						</div>
						<DetallesFields plugin={plugin} entry={entry} collapsed={collapsed} setCollapsed={setCollapsed} refreshEntry={refreshEntry} />
					</div>
				)}
				{tab === 'investigacion' && (
					<div className="nw-entry-tab">
						<div className="nw-field nw-field-stacked">
							<label>Notes (private, AI never sees)</label>
							<textarea className="nw-textarea" rows={10} value={draft.notas} onChange={(e) => patch({ notas: e.target.value })} onBlur={() => { if (dirty) save(); }} placeholder="Notes..." />
						</div>
					</div>
				)}
				{tab === 'relaciones' && (
					<div className="nw-entry-tab">
						<div className="nw-field nw-field-stacked">
							<label>External References</label>
							<p className="nw-muted" style={{ padding: 0, fontSize: 11 }}>Add links to external sites like Google Maps, Notion, YouTube or other websites so you can keep track of your research and inspiration.</p>
							<div className="nw-refs-list">
								{(draft.referencias_externas ?? []).map((r: any) => (
									<div key={r.id_referencia_externa} className="nw-ref-item">
										<RefFavicon url={r.url} />
										<a className="nw-ref-link" href={ensureHttp(r.url)} target="_blank" rel="noreferrer">{r.url}</a>
										<button className="nw-btn nw-btn-icon nw-btn-danger" onClick={async () => {
											const next = (draft.referencias_externas ?? []).filter((x: any) => x.id_referencia_externa !== r.id_referencia_externa);
											setDraft({ ...draft, referencias_externas: next });
											await removeReferencia(entry.id_entrada_codex, r.id_referencia_externa);
										}}><Icon.Trash width={12} height={12} /></button>
									</div>
								))}
								<div className="nw-ref-add">
									<input className="nw-input" placeholder="https://..." value={newUrl} onChange={(e) => setNewUrl(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { (async () => { const url = newUrl.trim(); if (!url) return; setNewUrl(''); const ref = await addReferencia(entry.id_entrada_codex, url); if (ref) setDraft({ ...draft, referencias_externas: [...(draft.referencias_externas ?? []), ref] }); else { const fresh = await store.readEntry(entry.id_entrada_codex); if (fresh) setDraft(fresh); } })(); } }} />
									<button className="nw-btn nw-btn-primary" onClick={async () => { const url = newUrl.trim(); if (!url) return; setNewUrl(''); const ref = await addReferencia(entry.id_entrada_codex, url); if (ref) setDraft({ ...draft, referencias_externas: [...(draft.referencias_externas ?? []), ref] }); else { const fresh = await store.readEntry(entry.id_entrada_codex); if (fresh) setDraft(fresh); } }}>Agregar</button>
								</div>
							</div>
						</div>
					</div>
				)}
				{tab === 'menciones' && (
					<div className="nw-entry-tab">
						<p className="nw-muted">Esta entrada aún no ha sido mencionada en ningún capítulo. Las menciones se rastrean al escribir capítulos.</p>
					</div>
				)}
				{tab === 'tracking' && (
					<div className="nw-entry-tab">
						<label className="nw-checkbox"><input type="checkbox" checked={draft.tracking_por_nombre} onChange={(e) => patchAndSave({ tracking_por_nombre: e.target.checked })} /> Obtener esta entrada por nombre/alias</label>
						<label className="nw-checkbox"><input type="checkbox" checked={draft.case_sensitive} onChange={(e) => patchAndSave({ case_sensitive: e.target.checked })} /> Matching sensible a mayusculas/minusculas</label>
						<div className="nw-ai-policy">
							<strong>Contexto de IA:</strong>
							{[
								{ v: AiContextPolicy.Always, l: 'Siempre incluir' },
								{ v: AiContextPolicy.OnDetect, l: 'Solo si detectado' },
								{ v: AiContextPolicy.NeverIfDetected, l: 'No incluir si detectado' },
								{ v: AiContextPolicy.Never, l: 'Nunca incluir' },
							].map((o) => (
								<label key={o.v} className="nw-radio">
									<input type="radio" name="policy" checked={draft.ai_context_policy === o.v} onChange={() => patchAndSave({ ai_context_policy: o.v })} /> {o.l}
								</label>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
function CategoriaPicker({ value, categorias, onChange }: { value: string; categorias: any[]; onChange: (v: string) => void }) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
	useEffect(() => {
		if (!open) return;
		const wrap = wrapRef.current; if (!wrap) return;
		const btn = wrap.querySelector('button');
		const r = btn?.getBoundingClientRect() ?? wrap.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		const above = spaceBelow < 240 && spaceAbove > spaceBelow;
		setDropStyle({ left: 0, right: 'auto', top: above ? 'auto' : '100%', bottom: above ? '100%' : 'auto', maxHeight: Math.min(above ? spaceAbove - 8 : spaceBelow - 8, 280) });
		const onDoc = (e: MouseEvent) => { if (!wrap.contains(e.target as Node)) setOpen(false); };
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [open]);
	const sel = categorias.find((c) => c.id_categoria === value);
	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<button type="button" className="nw-btn nw-categoria-picker" onClick={() => setOpen(!open)}>
				{sel && <span className="nw-color-dot" style={{ background: sel.color }} />}
				<span>{sel?.nombre ?? 'Categoria'}</span>
				<Icon.ChevronDown width={12} height={12} />
			</button>
			{open && (
				<div className="nw-dropdown nw-popover" style={{ minWidth: 200, ...dropStyle, overflowY: 'auto' }}>
					{categorias.map((c) => (
						<button key={c.id_categoria} type="button" className={'nw-popover-item' + (c.id_categoria === value ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(c.id_categoria); setOpen(false); }}>
							<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{c.id_categoria === value ? <Icon.Check width={12} height={12} /> : null}</span>
							<span className="nw-color-dot" style={{ background: c.color }} />
							<span style={{ flex: 1 }}>{c.nombre}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

function ThumbnailControl({ thumbnail, onPick, fileInputRef }: { thumbnail: string | null; onPick: (f: File) => void; fileInputRef: React.RefObject<HTMLInputElement | null> }) {
	return (
		<div className="nw-thumbnail-wrap">
			{thumbnail ? (
				<img className="nw-thumbnail-avatar" src={thumbnail} alt="thumbnail" />
			) : (
				<div className="nw-thumbnail-avatar nw-thumbnail-empty" title="Sin thumbnail">
					<Icon.Plus width={20} height={20} />
				</div>
			)}
			<input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); e.currentTarget.value = ''; }} />
			<button className="nw-btn nw-btn-icon nw-thumbnail-btn" title="Cambiar thumbnail" onClick={() => fileInputRef.current?.click()}>
				<Icon.Edit width={12} height={12} />
			</button>
		</div>
	);
}
function ThreeDotsMenu({ entry, otherNovels, onSelectColor, onSelectMove, onClearThumbnail, onArchive, onDelete }: { entry: any; otherNovels: any[]; onSelectColor: (c: string | null) => void; onSelectMove: (id: string) => void; onClearThumbnail: () => void; onArchive: () => void; onDelete: () => void }) {
	const [colorOpen, setColorOpen] = useState(false);
	const [moveOpen, setMoveOpen] = useState(false);
	const colorNames = ['Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Gray', 'Black'];
	return (
		<div className="nw-dropdown nw-popover nw-threedots-menu" style={{ top: '100%', right: 0, left: 'auto', minWidth: 220, maxHeight: 480, overflowY: 'auto' }}>
			<div className="nw-popover-section-title">Color</div>
			{!colorOpen ? (
				<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setColorOpen(true)}>
					{entry.color ? <span className="nw-color-dot" style={{ background: entry.color }} /> : <span className="nw-color-dot" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--background-modifier-border)' }} />}
					<span style={{ flex: 1 }}>{entry.color ? colorNames[PALETTE.indexOf(entry.color)] ?? 'Custom' : 'Default'}</span>
					<Icon.ChevronRight width={12} height={12} />
				</button>
			) : (
				<div>
					{PALETTE.map((c, i) => (
						<button key={c} type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onSelectColor(c)}>
							<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{entry.color === c ? <Icon.Check width={12} height={12} /> : null}</span>
							<span className="nw-color-dot" style={{ background: c }} />
							<span style={{ flex: 1 }}>{colorNames[i]}</span>
						</button>
					))}
					<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onSelectColor(null)}>
						<span style={{ width: 14 }} />
						<span className="nw-color-dot" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--background-modifier-border)' }} />
						<span style={{ flex: 1 }} className="nw-muted">Sin color</span>
					</button>
				</div>
			)}
			<hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
			<div className="nw-popover-section-title">Move to</div>
			{!moveOpen ? (
				<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setMoveOpen(true)}>
					<span style={{ flex: 1 }}>Seleccionar novela...</span>
					<Icon.ChevronRight width={12} height={12} />
				</button>
			) : (
				<div>
					{otherNovels.length === 0 ? (
						<div className="nw-popover-item nw-muted">No hay otras novelas</div>
					) : otherNovels.map((n) => (
						<button key={n.novela.id_novela} type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onSelectMove(n.novela.id_novela)}>
							<span style={{ flex: 1 }}>{n.novela.nombre}</span>
						</button>
					))}
				</div>
			)}
			{entry.thumbnail && (
				<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={onClearThumbnail}>
					<Icon.X width={14} height={14} />
					<span style={{ flex: 1 }}>Clear Thumbnail</span>
				</button>
			)}
			<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={onArchive}>
				<Icon.MenuThreePoints width={14} height={14} />
				<span style={{ flex: 1 }}>{entry.archivado ? 'Unarchive Entry' : 'Archive Entry'}</span>
			</button>
			<button type="button" className="nw-popover-item nw-popover-danger" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={onDelete}>
				<Icon.Trash width={14} height={14} />
				<span style={{ flex: 1 }}>Delete Entry</span>
			</button>
		</div>
	);
}
function DetallesFields({ plugin, entry, collapsed, setCollapsed, refreshEntry }: { plugin: NovelWriterPlugin; entry: any; collapsed: Set<string>; setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>; refreshEntry: (id: string) => Promise<void> }) {
	const { store, entradas, categorias, detalles, getDetallesByCategoria, listOpcionesByDetalle, setDetalleValor } = useNovelWriter() as any;
	const [catDetalles, setCatDetalles] = useState<any[]>([]);
	const [opcionesMap, setOpcionesMap] = useState<Record<string, any[]>>({});
	const [addOpen, setAddOpen] = useState(false);
	const [version, setVersion] = useState(0);
	const addWrapRef = useRef<HTMLDivElement | null>(null);
	const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});

	useEffect(() => {
		if (!entry?.id_categoria) return;
		let cancelled = false;
		(async () => {
			try {
				const ds = await getDetallesByCategoria(entry.id_categoria);
				if (cancelled) return;
				setCatDetalles(ds);
				const om: Record<string, any[]> = {};
				for (const d of ds) if (d.tipo_detalle === TipoDetalle.Dropdown) om[d.id_detalle] = await listOpcionesByDetalle(d.id_detalle);
				if (cancelled) return;
				setOpcionesMap(om);
			} catch (err) { console.error('DetallesFields load error', err); }
		})();
		return () => { cancelled = true; };
	}, [entry?.id_categoria, version]);

	useEffect(() => {
		if (!addOpen) return;
		const wrap = addWrapRef.current; if (!wrap) return;
		const btn = wrap.querySelector('button');
		const r = btn?.getBoundingClientRect() ?? wrap.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		const need = 320;
		const above = spaceBelow < need && spaceAbove > spaceBelow;
		setDropStyle({ left: 0, right: 'auto', top: above ? 'auto' : '100%', bottom: above ? '100%' : 'auto', maxHeight: Math.min(above ? spaceAbove - 8 : spaceBelow - 8, 360) });
	}, [addOpen]);

	const entryDetalles = entry.detalles ?? [];
	const entryDetalleIds = entryDetalles.map((d: any) => d.id_detalle);
	const disponibles = catDetalles.filter((d: any) => !entryDetalleIds.includes(d.id_detalle));

	const reload = async () => { await refreshEntry(entry.id_entrada_codex); setVersion((v) => v + 1); };
	const doAdd = async (idDetalle: string) => { setAddOpen(false); await setDetalleValor(entry.id_entrada_codex, idDetalle, null); await reload(); };
	const doAddAll = async () => { setAddOpen(false); for (const d of disponibles) await setDetalleValor(entry.id_entrada_codex, d.id_detalle, null); await reload(); };
	const doRemove = async (idDetalle: string) => { if (!store) return; await store.removeDetalleValor(entry.id_entrada_codex, idDetalle); await reload(); };
	const doSetValue = async (idDetalle: string, valor: string | null) => { await setDetalleValor(entry.id_entrada_codex, idDetalle, valor); await refreshEntry(entry.id_entrada_codex); };

	const tipoLabel = (t: string) => ({ text: 'Text', line: 'Line', dropdown: 'Dropdown', codex_ref: 'Ref. Codex' } as any)[t] ?? t;
	const refGroups = groupEntriesByCategory(entradas, categorias, entry.id_entrada_codex);
	const toggleCollapsed = (id: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

	return (
		<div>
			<div className="nw-field-label-row">Detalles de la entrada</div>
			{entryDetalles.length === 0 && <p className="nw-muted" style={{ fontSize: 11 }}>No hay detalles. Agrega los disponibles para esta categoria.</p>}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
				{entryDetalles.map((ed: any) => {
					const d = detalles.find((x: any) => x.id_detalle === ed.id_detalle) ?? catDetalles.find((x: any) => x.id_detalle === ed.id_detalle);
					if (!d) return null;
					const opts = opcionesMap[d.id_detalle] ?? [];
					const isText = d.tipo_detalle === TipoDetalle.Text;
					const isCollapsed = collapsed.has(ed.id_entrada_codex_detalle);
					return (
						<div key={ed.id_entrada_codex_detalle} className="nw-detail-card">
							{isText ? (
								<div className="nw-detail-block-input">
									<div className="nw-detail-header">
										<DetailLabelMenu d={d} onRemove={() => doRemove(d.id_detalle)} onEdit={() => { new DetallesModal((plugin as any).app, plugin, { initialId: d.id_detalle, initialTab: 'general' }).open(); }} />
										<button type="button" className="nw-btn nw-btn-icon nw-detail-toggle" onClick={() => toggleCollapsed(ed.id_entrada_codex_detalle)} title={isCollapsed ? 'Expandir' : 'Colapsar'}>
											{isCollapsed ? <Icon.ChevronRight width={14} height={14} /> : <Icon.ChevronDown width={14} height={14} />}
										</button>
										<span className="nw-detail-type">{tipoLabel(d.tipo_detalle)}</span>
										{d.incluir_ia && <span className="nw-detail-ia">IA</span>}
									</div>
									{isText && !isCollapsed && (
										<div className="nw-detail-body">
											<textarea className="nw-textarea" rows={4} defaultValue={ed.valor ?? ''} placeholder="Valor..." onBlur={(e) => doSetValue(d.id_detalle, e.target.value)} />
										</div>
									)}
								</div>		
							) : (
								<div className="nw-detail-inline-input">
									<DetailLabelMenu d={d} onRemove={() => doRemove(d.id_detalle)} onEdit={() => { new DetallesModal((plugin as any).app, plugin, { initialId: d.id_detalle, initialTab: 'general' }).open(); }} />
									<div className="nw-detail-inline-input-body">
										{d.tipo_detalle === TipoDetalle.Line && (
											<input className="nw-input" defaultValue={ed.valor ?? ''} placeholder="Valor..." onBlur={(e) => doSetValue(d.id_detalle, e.target.value)} />
										)}
										{d.tipo_detalle === TipoDetalle.Dropdown && (
											<DropdownField value={ed.valor ?? null} options={opts} onChange={(v) => doSetValue(d.id_detalle, v)} onManageOptions={() => { new DetallesModal((plugin as any).app, plugin, { initialId: d.id_detalle, initialTab: 'opciones' }).open(); }} />
										)}
										{d.tipo_detalle === TipoDetalle.CodexRef && (
											<RefPicker value={ed.valor ?? null} groups={refGroups} onChange={(v) => doSetValue(d.id_detalle, v)} />
										)}
									</div>
									<span className="nw-detail-type">{tipoLabel(d.tipo_detalle)}</span>
									{d.incluir_ia && <span className="nw-detail-ia">IA</span>}
								</div>
							)}
						</div>
					);
				})}
			</div>
			<div ref={addWrapRef} style={{ position: 'relative', marginTop: 8 }}>
				<button className="nw-btn nw-btn-primary" onClick={() => setAddOpen(!addOpen)}>+ Agregar Detalle</button>
				{addOpen && (
					<div className="nw-dropdown" style={{ minWidth: 280, ...dropStyle, overflowY: 'auto' }}>
						<div className="nw-dropdown-item" onClick={() => { setAddOpen(false); new DetallesModal((plugin as any).app, plugin).open(); }}><span>Manejar Detalles</span></div>
						{disponibles.length > 0 && (
							<div className="nw-dropdown-item" style={{ fontWeight: 600 }} onClick={doAddAll}>+ Agregar detalles faltantes ({disponibles.length})</div>
						)}
						<hr />
						{disponibles.length > 0 ? disponibles.map((d: any) => (
							<button key={d.id_detalle} className="nw-dropdown-item" style={{ display: 'block', width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit' }} onClick={() => doAdd(d.id_detalle)}>{d.nombre || '(sin nombre)'} <span className="nw-muted" style={{ fontSize: 10 }}>({tipoLabel(d.tipo_detalle)})</span></button>
						)) : <div className="nw-dropdown-item nw-muted">No hay mas detalles disponibles</div>}
					</div>
				)}
			</div>
		</div>
	);
}

function DetailLabelMenu({ d, onRemove, onEdit }: { d: any; onRemove: () => void; onEdit: () => void }) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [style, setStyle] = useState<React.CSSProperties>({});
	useEffect(() => {
		if (!open) return;
		const wrap = wrapRef.current; if (!wrap) return;
		const r = wrap.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		const above = spaceBelow < 120 && spaceAbove > spaceBelow;
		setStyle({ left: 0, right: 'auto', top: above ? 'auto' : '100%', bottom: above ? '100%' : 'auto' });
		const onDoc = (e: MouseEvent) => { if (!wrap.contains(e.target as Node)) setOpen(false); };
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [open]);
	return (
		<div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
			<button type="button" className="nw-detail-label-btn" onClick={() => setOpen(!open)}>
				{d.nombre || '(sin nombre)'}
			</button>
			{open && (
				<div className="nw-dropdown nw-popover" style={{ minWidth: 180, ...style }}>
					<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setOpen(false); onEdit(); }}>
						<Icon.Edit width={14} height={14} />
						<span style={{ flex: 1 }}>Edit this detail</span>
					</button>
					<button type="button" className="nw-popover-item nw-popover-danger" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setOpen(false); onRemove(); }}>
						<Icon.Trash width={14} height={14} />
						<span style={{ flex: 1 }}>Remove this detail</span>
					</button>
				</div>
			)}
		</div>
	);
}
function DropdownField({ value, options, onChange, onManageOptions }: { value: string | null; options: any[]; onChange: (v: string | null) => void; onManageOptions: () => void }) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
	useEffect(() => {
		if (!open) return;
		const wrap = wrapRef.current; if (!wrap) return;
		const btn = wrap.querySelector('button');
		const r = btn?.getBoundingClientRect() ?? wrap.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		const need = 220;
		const above = spaceBelow < need && spaceAbove > spaceBelow;
		setDropStyle({ left: 0, right: 'auto', top: above ? 'auto' : '100%', bottom: above ? '100%' : 'auto', maxHeight: Math.min(above ? spaceAbove - 8 : spaceBelow - 8, 320) });
		const onDoc = (e: MouseEvent) => { if (!wrap.contains(e.target as Node)) setOpen(false); };
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [open]);
	const selected = options.find((o) => o.id_opcion_detalle === value) || null;
	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<button type="button" className="nw-select nw-dropdown-trigger" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
				{selected ? (
					<>
						<span className="nw-color-dot" style={{ background: selected.color }} />
						<span style={{ flex: 1 }}>{selected.nombre}</span>
					</>
				) : (
					<span className="nw-muted" style={{ flex: 1 }}>(sin seleccionar)</span>
				)}
				<span style={{ color: 'var(--text-muted)' }}>{open ? '\u25B2' : '\u25BC'}</span>
			</button>
			{open && (
				<div className="nw-dropdown nw-popover" style={{ minWidth: 220, ...dropStyle, overflowY: 'auto' }}>
					<button type="button" className={'nw-popover-item' + (value == null ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(null); setOpen(false); }}>
						<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value == null ? <Icon.Check width={12} height={12} /> : null}</span>
						<span className="nw-muted">(sin seleccionar)</span>
					</button>
					{options.map((o) => (
						<button key={o.id_opcion_detalle} type="button" className={'nw-popover-item' + (value === o.id_opcion_detalle ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(o.id_opcion_detalle); setOpen(false); }}>
							<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value === o.id_opcion_detalle ? <Icon.Check width={12} height={12} /> : null}</span>
							<span className="nw-color-dot" style={{ background: o.color }} />
							<span style={{ flex: 1 }}>{o.nombre}</span>
						</button>
					))}
					{options.length === 0 && <div className="nw-dropdown-item nw-muted">No hay opciones. Agrega algunas.</div>}
					<hr style={{ margin: 0, border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
					<button type="button" className="nw-popover-item nw-popover-manage" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setOpen(false); onManageOptions(); }}>
						<Icon.Settings width={14} height={14} />
						<span>Manage options</span>
					</button>
				</div>
			)}
		</div>
	);
}
function RefPicker({ value, groups, onChange }: { value: string | null; groups: { key: string; label: string; entries: any[] }[]; onChange: (v: string | null) => void }) {
	const [open, setOpen] = useState(false);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [dropStyle, setDropStyle] = useState<React.CSSProperties>({});
	useEffect(() => {
		if (!open) return;
		const wrap = wrapRef.current; if (!wrap) return;
		const btn = wrap.querySelector('button');
		const r = btn?.getBoundingClientRect() ?? wrap.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		const need = 280;
		const above = spaceBelow < need && spaceAbove > spaceBelow;
		setDropStyle({ left: 0, right: 'auto', top: above ? 'auto' : '100%', bottom: above ? '100%' : 'auto', maxHeight: Math.min(above ? spaceAbove - 8 : spaceBelow - 8, 380) });
		const onDoc = (e: MouseEvent) => { if (!wrap.contains(e.target as Node)) setOpen(false); };
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, [open]);
	const allEntries: any[] = groups.flatMap((g) => g.entries);
	const selected = allEntries.find((e) => e.id_entrada_codex === value) || null;
	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<button type="button" className="nw-select nw-dropdown-trigger" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
				{selected ? (
					<>
						{selected.thumbnail ? <img className="nw-ref-avatar" src={selected.thumbnail} alt="" /> : <span className="nw-ref-avatar-placeholder"><Icon.Link width={12} height={12} /></span>}
						<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.nombre || '(sin nombre)'}</span>
					</>
				) : (
					<span className="nw-muted" style={{ flex: 1 }}>(sin seleccionar)</span>
				)}
				<span style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
			</button>
			{open && (
				<div className="nw-dropdown nw-popover nw-ref-picker" style={{ minWidth: 240, ...dropStyle, overflowY: 'auto' }}>
					<button type="button" className={'nw-popover-item' + (value == null ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(null); setOpen(false); }}>
						<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value == null ? <Icon.Check width={12} height={12} /> : null}</span>
						<Icon.X width={14} height={14} />
						<span style={{ flex: 1 }} className="nw-muted">Clear selection</span>
					</button>
					{groups.length === 0 && <div className="nw-popover-item nw-muted">No hay entradas disponibles</div>}
					{groups.map((g) => (
						<div key={g.key}>
							<div className="nw-popover-group-title">{g.label}</div>
							{g.entries.map((e: any) => (
								<button key={e.id_entrada_codex} type="button" className={'nw-popover-item' + (value === e.id_entrada_codex ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(e.id_entrada_codex); setOpen(false); }}>
									<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value === e.id_entrada_codex ? <Icon.Check width={12} height={12} /> : null}</span>
									{e.thumbnail ? <img className="nw-ref-avatar" src={e.thumbnail} alt="" /> : <span className="nw-ref-avatar-placeholder"><Icon.Link width={12} height={12} /></span>}
									<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nombre || '(sin nombre)'}</span>
								</button>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function groupEntriesByCategory(entradas: any[], categorias: any[], excludeId: string) {
	const groups: { key: string; label: string; entries: any[] }[] = [];
	const byCat = new Map<string, any[]>();
	for (const e of entradas) {
		if (!e || e.archivado) continue;
		if (e.id_entrada_codex === excludeId) continue;
		const arr = byCat.get(e.id_categoria) ?? [];
		arr.push(e); byCat.set(e.id_categoria, arr);
	}
	for (const c of categorias) {
		const arr = byCat.get(c.id_categoria) ?? [];
		if (arr.length > 0) groups.push({ key: c.id_categoria, label: c.nombre, entries: arr });
	}
	const sinCat = entradas.filter((e: any) => e && !e.archivado && e.id_entrada_codex !== excludeId && !categorias.find((c: any) => c.id_categoria === e.id_categoria));
	if (sinCat.length > 0) groups.push({ key: '__sin__', label: 'Sin categoria', entries: sinCat });
	return groups;
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
function RefFavicon({ url }: { url: string }) {
	const src = faviconUrl(url);
	const [errored, setErrored] = useState(false);
	if (!src || errored) return <Icon.Link width={14} height={14} />;
	return <img className="nw-ref-favicon" src={src} alt="" width={14} height={14} onError={() => setErrored(true)} />;
}
function ensureHttp(url: string): string {
	return /^https?:\/\//.test(url) ? url : `https://${url}`;
}
function getDomain(url: string): string {
	try { return new URL(ensureHttp(url)).hostname.replace(/^www\./, ""); } catch { return ""; }
}
function faviconUrl(url: string): string {
	const d = getDomain(url); return d ? `https://www.google.com/s2/favicons?domain=${d}&sz=32` : "";
}
