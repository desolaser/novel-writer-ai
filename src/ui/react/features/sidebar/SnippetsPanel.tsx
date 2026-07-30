import React, { useState } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';

export function SnippetsPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const { snippets, createSnippet, openSnippetEditor, snippetEditorId } = useNovelWriter();
	const [newName, setNewName] = useState('');
	const [adding, setAdding] = useState(false);

	return (
		<div className="nw-panel">
			<div className="nw-panel-toolbar">
				{adding ? (
					<>
						<input className="nw-input" placeholder="Nombre" value={newName} onChange={e => setNewName(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) { doAdd(); } if (e.key === 'Escape') { setAdding(false); setNewName(''); } }} />
						<button className="nw-btn nw-btn-primary" onClick={doAdd}>+</button>
						<button className="nw-btn" onClick={() => { setAdding(false); setNewName(''); }}>x</button>
					</>
				) : (
					<button className="nw-btn nw-btn-primary" onClick={() => setAdding(true)}>+ Snippet</button>
				)}
			</div>
			<div className="nw-list">
				{snippets.map(s => (
					<button
						key={s.id_snippet}
						className={`nw-list-item ${s.id_snippet === snippetEditorId ? 'active' : ''} ${s.archivado ? 'archived' : ''}`}
						onClick={() => openSnippetEditor(s.id_snippet)}
					>
						<span>{s.nombre}</span>
					</button>
				))}
			</div>
		</div>
	);

	async function doAdd() {
		if (!newName.trim()) { setAdding(false); return; }
		const sn = await createSnippet(newName.trim());
		setNewName(''); setAdding(false);
		if (sn) openSnippetEditor(sn.id_snippet);
	}
}