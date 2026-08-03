import React, { useState } from "react";
import { useNovelWriter } from "../../store/novelWriterStore";
import type NovelWriterPlugin from "../../../../../main";
import { ChatTab } from "../chat/ChatTab";

export function ChatsPanel({ plugin }: { plugin: NovelWriterPlugin }) {
	const {
		chats,
		createChat,
		activeChatId,
		selectChat,
		renameChat,
		deleteChat,
		store,
	} = useNovelWriter();
	const [renaming, setRenaming] = useState<string | null>(null);
	const [renameV, setRenameV] = useState("");
	const [showList, setShowList] = useState(false);

	const doCreate = async () => {
		const c = await createChat("Chat sin nombre");
		selectChat(c.id_chat);
		setShowList(false);
	};

	return (
		<div className="nw-panel">
			<div className="nw-panel-toolbar nw-chat-toolbar">
				<button className="nw-btn nw-btn-primary" onClick={doCreate}>
					+ Chat
				</button>
				<button
					className="nw-btn"
					onClick={() => setShowList((v) => !v)}
				>
					{showList ? "Cerrar lista" : "Ver chats"}
				</button>
			</div>
			{showList && (
				<div className="nw-list">
					{chats.map((c) => (
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
							<button
								className="nw-btn nw-btn-icon"
								title="Renombrar"
								onClick={() => {
									setRenaming(c.id_chat);
									setRenameV(c.nombre);
								}}
							>
								e
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
								×
							</button>
						</div>
					))}
				</div>
			)}
			{activeChatId && !showList && <ChatTab plugin={plugin} />}
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
