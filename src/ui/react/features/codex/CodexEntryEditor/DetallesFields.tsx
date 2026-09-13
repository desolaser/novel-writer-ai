import { useEffect, useRef, useState } from 'react';
import type NovelWriterPlugin from '../../../../../../main';
import { useNovelWriter } from '../../../store/novelWriterStore';
import { TipoDetalle } from '../../../../../domain';
import { Icon } from '../../../components/Icon';
import { DetallesModal } from '../modals/DetallesModal';
import { AiFieldButton } from './ai/AiFieldButton';
import { AiProposalBox } from './ai/AiProposalBox';
import { detailKey } from './ai/useCodexAiFields';
import { usePositionedDropdown } from '../../../hooks/usePositionedDropdown';
import { DetailLabelMenu } from './DetailLabelMenu';
import { DropdownField } from './DropdownField';
import { RefPicker } from './RefPicker';
import { groupEntriesByCategory } from './codexEntryHelpers';

export function DetallesFields({ plugin, entry, collapsed, setCollapsed, refreshEntry }: { plugin: NovelWriterPlugin; entry: any; collapsed: Set<string>; setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>; refreshEntry: (id: string) => Promise<void> }) {
	const { store, entradas, categorias, detalles, getDetallesByCategoria, listOpcionesByDetalle, setDetalleValor, reorderEntryDetalles } = useNovelWriter() as any;
	const [catDetalles, setCatDetalles] = useState<any[]>([]);
	const [opcionesMap, setOpcionesMap] = useState<Record<string, any[]>>({});
	const [addOpen, setAddOpen] = useState(false);
	const [version, setVersion] = useState(0);
	// This dropdown does not close on an outside click: preserved as originally written.
	const { wrapRef: addWrapRef, style: dropStyle } = usePositionedDropdown(addOpen, () => setAddOpen(false), { needed: 320, maxHeight: 360, closeOnOutsideClick: false });

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

	const entryDetalles = entry.detalles ?? [];
	const entryDetalleIds = entryDetalles.map((d: any) => d.id_detalle);
	const disponibles = catDetalles.filter((d: any) => !entryDetalleIds.includes(d.id_detalle));

	const reload = async () => { await refreshEntry(entry.id_entrada_codex); setVersion((v) => v + 1); };
	const doAdd = async (idDetalle: string) => { setAddOpen(false); await setDetalleValor(entry.id_entrada_codex, idDetalle, null); await reload(); };
	const doAddAll = async () => {
		setAddOpen(false);
		const sorted = [...disponibles].sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0));
		for (const d of sorted) await setDetalleValor(entry.id_entrada_codex, d.id_detalle, null);
		const allIds = [...entryDetalles.map((d: any) => d.id_detalle), ...sorted.map((d: any) => d.id_detalle)];
		await reorderEntryDetalles(entry.id_entrada_codex, allIds);
		await reload();
	};
	const doRemove = async (idDetalle: string) => { if (!store) return; await store.removeDetalleValor(entry.id_entrada_codex, idDetalle); await reload(); };
	const doSetValue = async (idDetalle: string, valor: string | null) => { await setDetalleValor(entry.id_entrada_codex, idDetalle, valor); await refreshEntry(entry.id_entrada_codex); };

	const tipoLabel = (t: string) => ({ text: 'Text', line: 'Line', dropdown: 'Dropdown', codex_ref: 'Ref. Codex' } as any)[t] ?? t;
	const refGroups = groupEntriesByCategory(entradas, categorias, entry.id_entrada_codex);
	const toggleCollapsed = (id: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

	const dragIdRef = useRef<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const onDetailDragStart = (id: string) => (e: React.DragEvent) => { dragIdRef.current = id; e.dataTransfer.effectAllowed = 'move'; };
	const onDetailDragOver = (id: string) => (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverId(id); };
	const onDetailDrop = (targetId: string) => async (e: React.DragEvent) => {
		e.preventDefault(); setDragOverId(null);
		const srcId = dragIdRef.current; dragIdRef.current = null;
		if (!srcId || srcId === targetId) return;
		const ids = entryDetalles.map((d: any) => d.id_detalle);
		const srcIdx = ids.indexOf(srcId); const tgtIdx = ids.indexOf(targetId);
		if (srcIdx < 0 || tgtIdx < 0) return;
		ids.splice(srcIdx, 1); ids.splice(tgtIdx, 0, srcId);
		await reorderEntryDetalles(entry.id_entrada_codex, ids);
		await reload();
	};
	const onDetailDragEnd = () => { dragIdRef.current = null; setDragOverId(null); };

	return (
		<div>
			<div className="nw-field-label-row">Entry details</div>
			{entryDetalles.length === 0 && <p className="nw-muted" style={{ fontSize: 11 }}>No details. Add the available ones for this category.</p>}
			<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
				{entryDetalles.map((ed: any) => {
					const d = detalles.find((x: any) => x.id_detalle === ed.id_detalle) ?? catDetalles.find((x: any) => x.id_detalle === ed.id_detalle);
					if (!d) return null;
					const opts = opcionesMap[d.id_detalle] ?? [];
					const isText = d.tipo_detalle === TipoDetalle.Text;
					const isCollapsed = collapsed.has(ed.id_entrada_codex_detalle);
					return (
						<div key={ed.id_entrada_codex_detalle}
							className={`nw-detail-card${dragOverId === ed.id_detalle ? ' nw-drag-over' : ''}`}
							draggable
							onDragStart={onDetailDragStart(ed.id_detalle)}
							onDragOver={onDetailDragOver(ed.id_detalle)}
							onDrop={onDetailDrop(ed.id_detalle)}
							onDragEnd={onDetailDragEnd}
						>
							{isText ? (
								<div className="nw-detail-block-input">
									<div className="nw-detail-header">
										<span className="nw-drag-handle"><Icon.GripVertical width={12} height={12} /></span>
										<DetailLabelMenu d={d} onRemove={() => doRemove(d.id_detalle)} onEdit={() => { new DetallesModal((plugin as any).app, plugin, { initialId: d.id_detalle, initialTab: 'general' }).open(); }} />
										<button type="button" className="nw-btn nw-btn-icon nw-detail-toggle" onClick={() => toggleCollapsed(ed.id_entrada_codex_detalle)} title={isCollapsed ? 'Expand' : 'Collapse'}>
											{isCollapsed ? <Icon.ChevronRight width={14} height={14} /> : <Icon.ChevronDown width={14} height={14} />}
										</button>
										<span className="nw-detail-type">{tipoLabel(d.tipo_detalle)}</span>
										{d.incluir_ia && <span className="nw-detail-ia">AI</span>}
										<AiFieldButton fieldKey={detailKey(d.id_detalle)} />
									</div>
									{isText && !isCollapsed && (
										<div className="nw-detail-body">
											<textarea key={ed.valor ?? ''} className="nw-textarea" rows={4} defaultValue={ed.valor ?? ''} placeholder="Value..." onBlur={(e) => doSetValue(d.id_detalle, e.target.value)} />
										</div>
									)}
								</div>
							) : (
								<div className="nw-detail-inline-input">
									<span className="nw-drag-handle"><Icon.GripVertical width={12} height={12} /></span>
									<DetailLabelMenu d={d} onRemove={() => doRemove(d.id_detalle)} onEdit={() => { new DetallesModal((plugin as any).app, plugin, { initialId: d.id_detalle, initialTab: 'general' }).open(); }} />
									<div className="nw-detail-inline-input-body">
										{d.tipo_detalle === TipoDetalle.Line && (
											<input key={ed.valor ?? ''} className="nw-input" defaultValue={ed.valor ?? ''} placeholder="Value..." onBlur={(e) => doSetValue(d.id_detalle, e.target.value)} />
										)}
										{d.tipo_detalle === TipoDetalle.Dropdown && (
											<DropdownField value={ed.valor ?? null} options={opts} onChange={(v) => doSetValue(d.id_detalle, v)} onManageOptions={() => { new DetallesModal((plugin as any).app, plugin, { initialId: d.id_detalle, initialTab: 'opciones' }).open(); }} />
										)}
										{d.tipo_detalle === TipoDetalle.CodexRef && (
											<RefPicker value={ed.valor ?? null} groups={refGroups} onChange={(v) => doSetValue(d.id_detalle, v)} />
										)}
									</div>
									<span className="nw-detail-type">{tipoLabel(d.tipo_detalle)}</span>
									{d.incluir_ia && <span className="nw-detail-ia">AI</span>}
									<AiFieldButton fieldKey={detailKey(d.id_detalle)} />
								</div>
							)}
							<AiProposalBox fieldKey={detailKey(d.id_detalle)} />
						</div>
					);
				})}
			</div>
			<div ref={addWrapRef} style={{ position: 'relative', marginTop: 8 }}>
				<button className="nw-btn nw-btn-primary" onClick={() => setAddOpen(!addOpen)}>+ Add Detail</button>
				{addOpen && (
					<div className="nw-dropdown" style={{ minWidth: 280, ...dropStyle, overflowY: 'auto' }}>
						<div className="nw-dropdown-item" onClick={() => { setAddOpen(false); new DetallesModal((plugin as any).app, plugin).open(); }}><span>Manage Details</span></div>
						{disponibles.length > 0 && (
							<div className="nw-dropdown-item" style={{ fontWeight: 600 }} onClick={doAddAll}>+ Add missing details ({disponibles.length})</div>
						)}
						<hr />
						{disponibles.length > 0 ? disponibles.map((d: any) => (
							<button key={d.id_detalle} className="nw-dropdown-item" style={{ display: 'block', width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit' }} onClick={() => doAdd(d.id_detalle)}>{d.nombre || '(unnamed)'} <span className="nw-muted" style={{ fontSize: 10 }}>({tipoLabel(d.tipo_detalle)})</span></button>
						)) : <div className="nw-dropdown-item nw-muted">No more details available</div>}
					</div>
				)}
			</div>
		</div>
	);
}
