import { useState, useRef, useEffect } from "react";
import { useNovelWriter } from "../../store/novelWriterStore";
import type NovelWriterPlugin from "../../../../../main";
import { ChatTab } from "../chat/ChatTab";
import { CustomPromptsModal } from "../chat/CustomPromptsModal";
import { Icon } from "../../components/Icon";
import { Notice } from "obsidian";

export function ChatsPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const {
		chats,
		createChat,
		activeChatId,
		selectChat,
		deleteChat,
		store,
	} = useNovelWriter();
	const [renaming, setRenaming] = useState<string | null>(null);
	const [renameV, setRenameV] = useState("");
	const [showList, setShowList] = useState(false);
	const [query, setQuery] = useState("");
	const [configMenuOpen, setConfigMenuOpen] = useState(false);
	const [deleteMode, setDeleteMode] = useState(false);
	const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
	const configRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const onDoc = (e: MouseEvent) => {
			if (configRef.current && !configRef.current.contains(e.target as Node)) setConfigMenuOpen(false);
		};
		document.addEventListener('mousedown', onDoc);
		return () => document.removeEventListener('mousedown', onDoc);
	}, []);

	const doCreate = async () => {
		const c = await createChat("Chat sin nombre");
		selectChat(c.id_chat);
		setShowList(false);
	};

	const openPromptsModal = () => {
		setConfigMenuOpen(false);
		new CustomPromptsModal(plugin.app as any, plugin).open();
	};

	const startBatchDelete = () => {
		setConfigMenuOpen(false);
		setSelectedForDeletion(new Set());
		setDeleteMode(true);
		new Notice('Seleccione chats para borrar');
	};

	const cancelBatchDelete = () => { setDeleteMode(false); setSelectedForDeletion(new Set()); };

	const toggleDeletion = (id: string) => setSelectedForDeletion(previous => {
		const next = new Set(previous);
		if (next.has(id)) next.delete(id); else next.add(id);
		return next;
	});

	const confirmBatchDelete = async () => {
		const count = selectedForDeletion.size;
		if (!count || !confirm(`Estas seguro de borrar ${count} chats?`)) return;
		for (const id of selectedForDeletion) {
			await deleteChat(id);
		}
		cancelBatchDelete();
		new Notice(`Has borrado ${count} chats`);
	};

	const filteredChats = chats.filter(c => {
		if (!query) return true;
		const q = query.toLowerCase();
		return (c.nombre || '').toLowerCase().includes(q);
	});

	return (
		<div className="nw-panel">
			<div className="nw-panel-toolbar nw-panel-toolbar-combined">
				{!showList ? (
					<>
						<button
							className="nw-btn"
							onClick={() => setShowList(true)}
						>
							Ver chats
						</button>
					</>
				) : (
					<>
						<input
							className="nw-input"
							placeholder="Buscar chats..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						<button className="nw-btn nw-btn-primary nw-btn-add-entry" onClick={doCreate} title="Nuevo chat">
							<Icon.Plus width={12} height={12} />
							<span>Chat</span>
						</button>
						<button
							className="nw-btn"
							onClick={() => { setShowList(false); setDeleteMode(false); setSelectedForDeletion(new Set()); }}
						>
							Cerrar lista
						</button>
						<div ref={configRef} style={{ position: 'relative' }}>
							<button className="nw-btn nw-btn-icon" onClick={() => setConfigMenuOpen(!configMenuOpen)} title="Menu de chats">
								<Icon.MenuThreePoints />
							</button>
							{configMenuOpen && (
								<div className="nw-dropdown nw-popover" style={{ minWidth: 200, right: 0, left: 'auto' }}>
									<div className="nw-popover-item" onClick={openPromptsModal}>
										<span>Prompts Custom</span>
									</div>
									<div className="nw-popover-item" onClick={startBatchDelete}>
										<span>Borrar chats</span>
									</div>
								</div>
							)}
						</div>
					</>
				)}
			</div>
			{deleteMode && (
				<div className="nw-codex-batch-actions">
					<button className="nw-btn nw-btn-danger" disabled={selectedForDeletion.size === 0} onClick={() => void confirmBatchDelete()}>
						Borrar chats
					</button>
					<button className="nw-btn" onClick={cancelBatchDelete}>Cancelar borrado</button>
				</div>
			)}
			{showList && (
				<div className="nw-list">
					{filteredChats.map((c) => (
						<div
							key={c.id_chat}
							className={`nw-list-item-row ${
								c.id_chat === activeChatId ? "active" : ""
							} ${c.archivado ? "archived" : ""}`}
						>
							{renaming === c.id_chat ? (
								<>
									<input
										className="nw-input"
										value={renameV}
										autoFocus
										onChange={(e) =>
											setRenameV(e.target.value)
										}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												doRename(c.id_chat);
											}
											if (e.key === "Escape") {
												setRenaming(null);
											}
										}}
									/>
									<button
										className="nw-btn nw-btn-primary"
										onClick={() => doRename(c.id_chat)}
									>
										OK
									</button>
								</>
							) : deleteMode ? (
								<button
									className={`nw-list-item ${selectedForDeletion.has(c.id_chat) ? "selected" : ""}`}
									onClick={() => toggleDeletion(c.id_chat)}
								>
									<input
										type="checkbox"
										checked={selectedForDeletion.has(c.id_chat)}
										onChange={() => toggleDeletion(c.id_chat)}
										onClick={(e) => e.stopPropagation()}
									/>
									<span>{c.nombre}</span>
									<span className="nw-chat-date">
										{formatChatDate(c.created_at)}
									</span>
								</button>
							) : (
								<button
									className={`nw-list-item ${
										c.id_chat === activeChatId
											? "active"
											: ""
									}`}
									onClick={() => {
										selectChat(c.id_chat);
										setShowList(false);
									}}
								>
									<span>{c.nombre}</span>
									<span className="nw-chat-date">
										{formatChatDate(c.created_at)}
									</span>
								</button>
							)}
							{!deleteMode && (
								<>
									<button
										className="nw-btn nw-btn-icon"
										title="Renombrar"
										onClick={() => {
											setRenaming(c.id_chat);
											setRenameV(c.nombre);
										}}
									>
										<Icon.Edit width={14} height={14} />
									</button>
									<button
										className="nw-btn nw-btn-icon nw-btn-danger"
										title="Eliminar"
										onClick={async () => {
											if (
												confirm(`Eliminar chat "${c.nombre}"?`)
											) {
												await deleteChat(c.id_chat);
												if (activeChatId === c.id_chat)
													selectChat(null);
											}
										}}
									>
										<Icon.Trash width={14} height={14} />
									</button>
								</>
							)}
						</div>
					))}
					{filteredChats.length === 0 && (
						<p className="nw-muted" style={{ padding: '12px', fontSize: 12 }}>
							{query ? 'No hay chats que coincidan con la busqueda.' : 'No hay chats.'}
						</p>
					)}
				</div>
			)}
			{!showList && <ChatTab plugin={plugin}  />}
		</div>
	);

	async function doRename(id: string) {
		if (renameV.trim() && store) {
			await store.renameChat(id, renameV.trim());
			await useNovelWriter.getState().reloadAll();
		}
		setRenaming(null);
	}

	function formatChatDate(value: string) {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? value.slice(0, 10)
			: date.toISOString().slice(0, 10);
	}
}
