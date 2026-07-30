import React, { useState, useEffect, useCallback } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { TFile } from 'obsidian';
import { MarkdownPreview } from '../../components/MarkdownPreview';

export function SnippetEditor({ plugin }: { plugin: NovelWriterPlugin }) {
	const { snippets, snippetEditorId, openSnippetEditor, store, writeSnippetTexto, updateSnippet } = useNovelWriter();
	const sel = snippets.find(s => s.id_snippet === snippetEditorId);
	const [text, setText] = useState('');
	const [nombre, setNombre] = useState('');
	const [loading, setLoading] = useState(false);
	const [viewMode, setViewMode] = useState<'edit'|'preview'|'split'>('split');

	const load = useCallback(async () => {
		if (!sel || !store) { setText(''); setNombre(''); return; }
		setLoading(true);
		const t = await store.getSnippetTexto(sel.id_snippet);
		setText(t);
		setNombre(sel.nombre);
		setLoading(false);
	}, [sel?.id_snippet, store]);

	useEffect(() => { load(); }, [sel?.id_snippet]);
	useEffect(() => { if (!sel || loading) return; const id = setTimeout(async () => { await writeSnippetTexto(sel.id_snippet, text); }, 800); return () => clearTimeout(id); }, [text, sel?.id_snippet]);

	if (!sel) {
		return <div className="nw-empty-state"><p className="nw-muted">Selecciona un snippet en el sidebar.</p></div>;
	}

	const openInObsidian = async () => {
		if (!store?.activeFolderPath) return;
		const rel = await store.getSnippetArchivo(sel.id_snippet);
		if (!rel) return;
		const f = plugin.app.vault.getAbstractFileByPath(store.activeFolderPath + '/' + rel);
		if (f instanceof TFile) await plugin.app.workspace.openLinkText(f.path, '', false);
	};

	const doRename = async () => {
		if (nombre.trim() && nombre !== sel.nombre) {
			await updateSnippet({ ...sel, nombre: nombre.trim(), texto: text });
		}
	};

	return (
		<div className="nw-snippet-editor">
			<div className="nw-snippet-header">
				<button className="nw-btn" onClick={() => openSnippetEditor(null)}>Cerrar</button>
				<input className="nw-snippet-title" value={nombre} onChange={e => setNombre(e.target.value)} onBlur={doRename} placeholder="Nombre del snippet" />
				<div className="nw-view-toggle">
					<button className={"nw-btn nw-btn-mini" + (viewMode === "edit" ? " nw-btn-primary" : "")} onClick={() => setViewMode("edit")} title="Editor">E</button>
					<button className={"nw-btn nw-btn-mini" + (viewMode === "split" ? " nw-btn-primary" : "")} onClick={() => setViewMode("split")} title="Editor+Preview">[]=</button>
					<button className={"nw-btn nw-btn-mini" + (viewMode === "preview" ? " nw-btn-primary" : "")} onClick={() => setViewMode("preview")} title="Preview">V</button>
				</div>
				<button className="nw-btn" onClick={openInObsidian} title="Abrir en Obsidian">Abrir .md</button>
			</div>
			<div className="nw-writer-wrap" style={{ flex: 1 }}>
				{viewMode !== 'preview' && (
					<textarea
						className="nw-manuscript"
						value={text}
						onChange={e => setText(e.target.value)}
						placeholder="Escribe aqui tu brainstorming, ideas, notas... (markdown)"
						disabled={loading}
					/>
				)}
				{viewMode === 'preview' && (
					<MarkdownPreview app={plugin.app} text={text} />
				)}
				{viewMode === 'split' && text && (
					<MarkdownPreview app={plugin.app} text={text} />
				)}
			</div>
			<div className="nw-word-count">{text.trim() ? text.trim().split(/\s+/).length : 0} palabras</div>
		</div>
	);
}