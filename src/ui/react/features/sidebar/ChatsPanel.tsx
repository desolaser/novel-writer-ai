import React, { useState } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';

export function ChatsPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const { chats, createChat, activeChatId, selectChat, renameChat, store } = useNovelWriter();
	const [renaming, setRenaming] = useState<string | null>(null);
	const [renameV, setRenameV] = useState('');

	const doCreate = async () => {
		const c = await createChat('Chat sin nombre');
		selectChat(c.id_chat);
		// navigate to chat work tab
		useNovelWriter.getState().setWorkTab('chat');
	};

	return (
		<div className="nw-panel">
			<div className="nw-panel-toolbar">
				<button className="nw-btn nw-btn-primary" onClick={doCreate}>+ Chat</button>
			</div>
			<div className="nw-list">
				{chats.map(c => (
					<div key={c.id_chat} className={`nw-list-item-row ${c.id_chat === activeChatId ? 'active' : ''} ${c.archivado ? 'archived' : ''}`}>
						{renaming === c.id_chat ? (
							<>
								<input className="nw-input" value={renameV} autoFocus onChange={e => setRenameV(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { doRename(c.id_chat); } if (e.key === 'Escape') { setRenaming(null); } }} />
								<button className="nw-btn nw-btn-primary" onClick={() => doRename(c.id_chat)}>OK</button>
							</>
						) : (
							<button
								className={`nw-list-item ${c.id_chat === activeChatId ? 'active' : ''}`}
								onClick={() => { selectChat(c.id_chat); useNovelWriter.getState().setWorkTab('chat'); }}
							>
								<span>{c.nombre}</span>
							</button>
						)}
						<button className="nw-btn nw-btn-icon" title="Renombrar" onClick={() => { setRenaming(c.id_chat); setRenameV(c.nombre); }}>e</button>
					</div>
				))}
			</div>
		</div>
	);

	async function doRename(id: string) {
		if (renameV.trim() && store) {
			await store.renameChat(id, renameV.trim());
			await useNovelWriter.getState().reloadAll();
		}
		setRenaming(null);
	}
}