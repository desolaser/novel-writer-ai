import { useState, useEffect, useRef } from 'react';
import { useNovelWriter } from '../../../store/novelWriterStore';
import { AiContextPolicy } from '../../../../../domain';
import type NovelWriterPlugin from '../../../../../../main';
import { Icon } from '../../../components/Icon';
import { ThumbnailCropModal } from '../ThumbnailCropModal';
import { canvasToDataUrl, cropToCanvas } from '../../../../../utils/image';
import { ensureHttp } from '../../../../../utils/urls';
import { CodexAiPanel } from './ai/CodexAiPanel';
import { CodexAiProvider, type CodexAiApply } from './ai/CodexAiProvider';
import { AiFieldButton } from './ai/AiFieldButton';
import { AiProposalBox } from './ai/AiProposalBox';
import { ALIAS_KEY, DESCRIPTION_KEY } from './ai/useCodexAiFields';
import { FirstMessageField } from './FirstMessageField';
import { MentionsTab, useMentionCount } from './MentionsTab';
import { isCharacterCategory } from '../../../../../utils/categories';
import { CategoriaPicker } from './CategoriaPicker';
import { ThumbnailControl } from './ThumbnailControl';
import { ThreeDotsMenu } from './ThreeDotsMenu';
import { DetallesFields } from './DetallesFields';
import { RefFavicon } from './RefFavicon';
import { capitalize } from './codexEntryHelpers';

type Tab = 'detalles' | 'investigacion' | 'relaciones' | 'menciones' | 'tracking';

export function CodexEntryEditor({ plugin, onClose }: { plugin: NovelWriterPlugin; onClose?: () => void }) {
	const storeState = useNovelWriter() as any;
	const {
		entradas, editingEntryId, setEditingEntry, updateEntry, deleteEntry, archiveEntry,
		addReferencia, removeReferencia, setEntryTags, findOrCreateTag, tags, categorias, novels,
		store, refreshEntry, moveEntryToNovel, setEntryThumbnail, setDetalleValor
	} = storeState;

	const entry = entradas.find((e: any) => e.id_entrada_codex === editingEntryId) ?? null;
	const mentionCount = useMentionCount(entry, plugin);
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
		return <div className="nw-empty-state"><button className="nw-btn" onClick={() => setEditingEntry(null)}>Back</button></div>;
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
				const out = Math.min(480, img.naturalWidth, img.naturalHeight);
				const canvas = cropToCanvas(img, 0, 0, out, out, out, out);
				await setEntryThumbnail(entry.id_entrada_codex, canvasToDataUrl(canvas, "image/png"));
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
	const onSelectMove = async (targetNovelId: string) => { setMenuOpen(false); if (targetNovelId === entry.id_novela) return; await moveEntryToNovel(entry.id_entrada_codex, targetNovelId); setEditingEntry(null); onClose?.(); };
	const onSelectCopy = async (targetNovelId: string) => { setMenuOpen(false); if (targetNovelId === entry.id_novela) return; await storeState.copyEntryToNovel(entry.id_entrada_codex, targetNovelId); };
	const onArchive = async () => { setMenuOpen(false); await archiveEntry(entry.id_entrada_codex, !entry.archivado); setEditingEntry(null); };
	const onDelete = async () => { setMenuOpen(false); if (confirm('Delete entry permanently?')) { await deleteEntry(entry.id_entrada_codex); setEditingEntry(null); onClose?.(); } };

	const otherNovels = ((novels ?? []) as any[]).filter((n: any) => n.novela && n.novela.id_novela !== entry.id_novela);

	// The first message only makes sense for someone who can speak in a roleplay.
	const isCharacter = isCharacterCategory(categorias.find((c: any) => c.id_categoria === entry.id_categoria));

	// AI suggestions are only written through here, once the author accepts them.
	const aiApply: CodexAiApply = {
		setEntryField: async (key, value) => { await patchAndSave({ [key]: value }); },
		setDetalleValue: async (idDetalle, value) => {
			await setDetalleValor(entry.id_entrada_codex, idDetalle, value);
			await refreshEntry(entry.id_entrada_codex);
		},
	};

	return (
		<CodexAiProvider plugin={plugin} entry={entry} apply={aiApply}>
		<div className="nw-entry-editor">
			<div className="nw-editor-top">
				<div className="nw-editor-top-left">
					<div style={{ display: "flex", flexDirection: "row", justifyContent: "flex-start" }}>
						<CategoriaPicker value={draft.id_categoria} categorias={categorias} onChange={(v) => patchAndSave({ id_categoria: v })} />
					</div>
					<input
						className="nw-entry-name-input"
						style={draft.color ? { color: draft.color } : undefined}
						value={draft.nombre}
						onChange={(e) => patch({ nombre: e.target.value })}
						onKeyDown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); save(); } }}
						placeholder="Name"
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
						<button className="nw-btn nw-btn-icon" onClick={() => setMenuOpen(!menuOpen)} title="Options">
							<Icon.MenuThreePoints />
						</button>
						{menuOpen && (
							<ThreeDotsMenu
								entry={entry}
								otherNovels={otherNovels}
								onSelectColor={onSelectColor}
								onSelectMove={onSelectMove}
								onSelectCopy={onSelectCopy}
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
				<span className="nw-mentions">{mentionCount} {mentionCount === 1 ? 'mention' : 'mentions'}</span>
			</div>

			{/* AI Generation Collapsible Menu */}
			<CodexAiPanel plugin={plugin} entryId={entry.id_entrada_codex} />

			<div className="nw-tab-content">
				{tab === 'detalles' && (
					<div className="nw-entry-tab">
						<div className="nw-field nw-field-stacked">
							<div className="nw-ai-label-row"><label>Aliases/Nicknames</label><AiFieldButton fieldKey={ALIAS_KEY} /></div>
							<input className="nw-input" value={draft.alias} onChange={(e) => patch({ alias: e.target.value })} onBlur={() => { if (dirty) save(); }} placeholder="Add aliases, ..." />
							<AiProposalBox fieldKey={ALIAS_KEY} />
						</div>
						<div className="nw-field nw-field-stacked">
							<div className="nw-ai-label-row"><label>Description</label><AiFieldButton fieldKey={DESCRIPTION_KEY} /></div>
							<textarea className="nw-textarea" rows={6} value={draft.descripcion} onChange={(e) => patch({ descripcion: e.target.value })} placeholder="Write a short summary here..." onBlur={() => { if (dirty) save(); }} />
							<AiProposalBox fieldKey={DESCRIPTION_KEY} />
						</div>
						{isCharacter && (
							<FirstMessageField
								key={entry.id_entrada_codex}
								value={draft.first_message ?? ''}
								onChange={(next) => patch({ first_message: next })}
								onSave={() => { if (dirty) save(); }}
							/>
						)}
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
									<button className="nw-btn nw-btn-primary" onClick={async () => { const url = newUrl.trim(); if (!url) return; setNewUrl(''); const ref = await addReferencia(entry.id_entrada_codex, url); if (ref) setDraft({ ...draft, referencias_externas: [...(draft.referencias_externas ?? []), ref] }); else { const fresh = await store.readEntry(entry.id_entrada_codex); if (fresh) setDraft(fresh); } }}>Add</button>
								</div>
							</div>
						</div>
					</div>
				)}
				{tab === 'menciones' && (
					<MentionsTab
						entry={entry}
						plugin={plugin}
						onClose={onClose}
					/>
				)}
				{tab === 'tracking' && (
					<div className="nw-entry-tab">
						<label className="nw-checkbox"><input type="checkbox" checked={draft.tracking_por_nombre} onChange={(e) => patchAndSave({ tracking_por_nombre: e.target.checked })} /> Retrieve this entry by name/alias</label>
						<label className="nw-checkbox"><input type="checkbox" checked={draft.case_sensitive} onChange={(e) => patchAndSave({ case_sensitive: e.target.checked })} /> Case-sensitive matching</label>
						<div className="nw-ai-policy">
							<strong>AI Context:</strong>
							{[
								{ v: AiContextPolicy.Always, l: 'Always include' },
								{ v: AiContextPolicy.OnDetect, l: 'Only if detected' },
								{ v: AiContextPolicy.NeverIfDetected, l: 'Do not include if detected' },
								{ v: AiContextPolicy.Never, l: 'Never include' },
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
		</CodexAiProvider>
	);
}
