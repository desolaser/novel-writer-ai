import React, { useState, useEffect, useCallback } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { TFile } from 'obsidian';
import { Icon } from '../../components/Icon';
import { Acto, Capitulo } from '../../../../domain';
import { buildScenePrompt } from '../../../../context/promptBuilder';
import { MarkdownPreview } from '../../components/MarkdownPreview';
import { ApiFactory } from '../../../../factories/api-factory';

export function EscribirTab({ plugin }: { plugin: NovelWriterPlugin }) {
	const { actos, capitulos, createActo, createCapitulo, store, updateActo, deleteActo, updateCapitulo, deleteCapitulo } = useNovelWriter();
	const [selCap, setSelCap] = useState<string | null>(null);
	const [text, setText] = useState('');
	const [loading, setLoading] = useState(false);
	const [viewMode, setViewMode] = useState<'edit'|'preview'|'split'>('split');

	const [renamingActo, setRenamingActo] = useState<string | null>(null);
	const [renamingCap, setRenamingCap] = useState<string | null>(null);
	const [newActo, setNewActo] = useState(''); const [addingActo, setAddingActo] = useState(false);
	const [newCap, setNewCap] = useState(''); const [addingCap, setAddingCap] = useState<string | null>(null);

	const capSel = capitulos.find(c => c.id_capitulo === selCap);

	const loadText = useCallback(async () => {
		if (!capSel || !store) { setText(''); return; }
		setLoading(true);
		const t = await store.readCapituloTexto(capSel.id_capitulo);
		setText(t);
		setLoading(false);
	}, [capSel?.id_capitulo, store]);

	useEffect(() => { void loadText(); }, [selCap]);

	useEffect(() => {
		if (!capSel || loading) return;
		const id = setTimeout(async () => { await store?.writeCapituloTexto(capSel.id_capitulo, text); }, 800);
		return () => clearTimeout(id);
	}, [text, capSel?.id_capitulo, loading, store]);

	const openInObsidian = async () => {
		if (!capSel?.archivo || !store?.activeFolderPath) return;
		const path = capSel.archivo.startsWith('escritura/') ? `${store.activeFolderPath}/${capSel.archivo}` : capSel.archivo;
		const f = plugin.app.vault.getAbstractFileByPath(path);
		if (f instanceof TFile) await plugin.app.workspace.openLinkText(f.path, '', false);
	};

	return (
		<div className="nw-escribir">
			<div className="nw-escribir-tree">
				<div className="nw-tree-toolbar">
					{addingActo ? (
						<>
							<input className="nw-input" placeholder="Nombre del acto" value={newActo} onChange={e => setNewActo(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') { doCreateActo(); } if (e.key === 'Escape') { setAddingActo(false); setNewActo(''); } }} />
							<button className="nw-btn nw-btn-primary" onClick={doCreateActo}><Icon.Plus /></button>
							<button className="nw-btn" onClick={() => { setAddingActo(false); setNewActo(''); }}><Icon.X /></button>
						</>
					) : (
						<button className="nw-btn nw-btn-primary" onClick={() => setAddingActo(true)}>+ Acto</button>
					)}
				</div>
				{actos.map(a => {
					const caps = capitulos.filter(c => c.id_acto === a.id_acto);
					return (
						<div key={a.id_acto} className="nw-acto-node">
							<div className="nw-acto-row">
								{renamingActo === a.id_acto ? (
									<input className="nw-input nw-inline-rename" defaultValue={a.nombre} autoFocus onKeyDown={e => { if (e.key === 'Enter') doRenameActo(a, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setRenamingActo(null); }} onBlur={e => doRenameActo(a, e.target.value)} />
								) : (
									<span className="nw-acto-name" onClick={() => setRenamingActo(a.id_acto)} title="Renombrar">{a.nombre}</span>
								)}
								<span className="nw-node-count">{caps.length}</span>
								<button className="nw-btn nw-btn-icon nw-btn-danger" title="Borrar" onClick={() => { if (confirm(`Borrar acto "${a.nombre}"?`)) deleteActo(a.id_acto); }}><Icon.Trash width={12} height={12} /></button>
							</div>
							{caps.map(c => {
								return (
									<div key={c.id_capitulo} className="nw-cap-node">
										<div className="nw-cap-row">
											{renamingCap === c.id_capitulo ? (
												<input className="nw-input nw-inline-rename" defaultValue={c.nombre} autoFocus onKeyDown={e => { if (e.key === 'Enter') doRenameCap(c, (e.target as HTMLInputElement).value); if (e.key === 'Escape') setRenamingCap(null); }} onBlur={e => doRenameCap(c, e.target.value)} />
											) : (
												<button className="nw-cap-name" onClick={() => setSelCap(c.id_capitulo)} title="Click para abrir">{c.nombre}</button>
											)}
										<span className="nw-node-count">{c.archivo ? 'Archivo' : 'Sin archivo'}</span>
										<button className="nw-btn nw-btn-icon nw-btn-danger" title="Borrar" onClick={() => { if (confirm(`Borrar "${c.nombre}"?`)) deleteCapitulo(c.id_capitulo); }}><Icon.Trash width={12} height={12} /></button>
									</div>
									</div>
								);
							})}
							{addingCap === a.id_acto ? (
								<div className="nw-cap-add-row">
									<input className="nw-input" placeholder="Nombre capitulo" value={newCap} onChange={e => setNewCap(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') doCreateCap(a.id_acto); if (e.key === 'Escape') { setAddingCap(null); setNewCap(''); } }} />
									<button className="nw-btn nw-btn-primary" onClick={() => doCreateCap(a.id_acto)}><Icon.Plus /></button>
									<button className="nw-btn" onClick={() => { setAddingCap(null); setNewCap(''); }}><Icon.X /></button>
								</div>
							) : (
								<button className="nw-cap-add" onClick={() => setAddingCap(a.id_acto)}>+ Capitulo</button>
							)}
						</div>
					);
				})}
				{actos.length === 0 && <p className="nw-muted">Crea un acto.</p>}
			</div>
			<div className="nw-escribir-main">
				<div className="nw-escribir-right">
					{capSel ? (
						<>
							<div className="nw-escribir-header">
								<span>{capSel?.nombre}</span>
								{capSel.outline && <span className="nw-muted nw-outline-badge">outline: {capSel.outline.slice(0, 60)}{capSel.outline.length > 60 ? '...' : ''}</span>}
								<div className="nw-view-toggle"><button className={"nw-btn nw-btn-mini" + (viewMode === "edit" ? " nw-btn-primary" : "")} onClick={() => setViewMode("edit")} title="Editor">E</button><button className={"nw-btn nw-btn-mini" + (viewMode === "split" ? " nw-btn-primary" : "")} onClick={() => setViewMode("split")} title="Editor+Preview">[]</button><button className={"nw-btn nw-btn-mini" + (viewMode === "preview" ? " nw-btn-primary" : "")} onClick={() => setViewMode("preview")} title="Preview">V</button></div><button className="nw-btn" onClick={openInObsidian} title="Abrir .md en Obsidian">Abrir .md</button> <button className="nw-btn nw-btn-primary" onClick={generate}>Generar IA</button>
							</div>
							<div className="nw-writer-wrap">
								{viewMode !== 'preview' && (
									<textarea
										className="nw-manuscript"
										value={text}
										onChange={e => setText(e.target.value)}
										placeholder="Escribe el manuscrito del capítulo..."
										disabled={loading}
									/>
								)}
								{viewMode === 'preview' && (
									<MarkdownPreview app={plugin.app} text={text} />
								)}
								{viewMode === 'split' && text && (
									<MarkdownPreview app={plugin.app} text={text} />
								)}
								{capSel.outline && (
									<div className="nw-outline-side">
										<h4>Outline</h4>
										<div className="nw-outline-body">{capSel.outline}</div>
									</div>
								)}
							</div>
						</>
					) : (
						<p className="nw-muted">Selecciona un capítulo para escribir.</p>
					)}
				</div>
			</div>
		</div>
	);

	async function generate() {
		if (!store || !capSel) return;
		setLoading(true);
		try {
			const settings = plugin.settings.data;
			if (!settings.proveedor.modelo) { alert('Configura un modelo en Settings.'); return; }
			const prompt = await buildScenePrompt(plugin.app, store.activeFolderPath!, settings, capSel.outline ?? '', text);
			const token = settings.apiToken[settings.proveedor.id] ?? '';
			const api = new ApiFactory().createApi(settings.proveedor.id, token);
			const result = await api.generateCompletion(prompt, settings.proveedor.modelo, {
				max_tokens: settings.aiOptions.maxOutput,
				temperature: settings.aiOptions.temperature,
				presence_penalty: settings.aiOptions.presencePenalty,
				frequency_penalty: settings.aiOptions.frequencyPenalty,
				top_p: settings.aiOptions.topP,
				stream: false,
			});
			if (result.text) setText(text + result.text);
		} catch (e: any) { alert('Error IA: ' + (e?.message ?? String(e))); }
		finally { setLoading(false); }
	}
	async function doCreateActo() { if (!newActo.trim()) { setAddingActo(false); return; } await createActo(newActo.trim()); setNewActo(''); setAddingActo(false); }
	async function doCreateCap(idActo: string) { if (!newCap.trim()) { setAddingCap(null); return; } const capsA = capitulos.filter(c => c.id_acto === idActo); const c = await createCapitulo(idActo, newCap.trim(), capsA.length); setSelCap(c.id_capitulo); setNewCap(''); setAddingCap(null); }
	async function doRenameActo(a: Acto, val?: string) { const n = (val ?? '').trim() || a.nombre; if (n !== a.nombre) await updateActo(a.id_acto, { nombre: n }); setRenamingActo(null); }
	async function doRenameCap(c: Capitulo, val?: string) { const n = (val ?? '').trim() || c.nombre; if (n !== c.nombre) await updateCapitulo(c.id_capitulo, { nombre: n }); setRenamingCap(null); }
}

