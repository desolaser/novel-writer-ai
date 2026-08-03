import React, { useState } from "react";
import { useNovelWriter } from "../../store/novelWriterStore";
import type NovelWriterPlugin from "../../../../../main";
import { CodexPanel } from "../codex/CodexPanel";
import { ConfigPanel } from "./ConfigPanel";
import { ChatsPanel } from "./ChatsPanel";
import { Icon } from "../../components/Icon";
import {
	openNovelManagementModal,
	openNovelEditModal,
	openNovelDeleteModal,
} from "./NovelManagementModal";

export function NovelManagementMenu({ plugin }: { plugin: NovelWriterPlugin }) {
	const [open, setOpen] = useState(false);
	const activeNovelId = useNovelWriter((s) => s.activeNovelId);
	return (
		<div className="nw-novel-actions">
			<button
				className="nw-icon-btn"
				onClick={() => setOpen((value) => !value)}
				aria-label="Gestión de novelas"
			>
				<Icon.Settings />
			</button>
			{open && (
				<div className="nw-novel-menu">
					<button
						onClick={() => {
							setOpen(false);
							openNovelManagementModal(plugin);
						}}
					>
						Ver Novelas
					</button>
					<button
						disabled={!activeNovelId}
						onClick={() => {
							setOpen(false);
							if (activeNovelId)
								openNovelEditModal(plugin, activeNovelId);
						}}
					>
						Editar Novela
					</button>
					<button
						disabled={!activeNovelId}
						className="danger"
						onClick={() => {
							setOpen(false);
							if (activeNovelId)
								openNovelDeleteModal(plugin, activeNovelId);
						}}
					>
						Borrar Novela
					</button>
				</div>
			)}
		</div>
	);
}

export function Sidebar({ plugin }: { plugin: NovelWriterPlugin }) {
	const { activeSidebarTab, setSidebarTab } = useNovelWriter();
	return (
		<div className="nw-sidebar-tabs">
			<div className="nw-tab-bar nw-tab-bar-compact">
				<button
					className={activeSidebarTab === "codex" ? "active" : ""}
					onClick={() => setSidebarTab("codex")}
				>
					Codex
				</button>
				<button
					className={activeSidebarTab === "config" ? "active" : ""}
					onClick={() => setSidebarTab("config")}
				>
					Config
				</button>
				<button
					className={activeSidebarTab === "chats" ? "active" : ""}
					onClick={() => setSidebarTab("chats")}
				>
					Chats
				</button>
			</div>
			<div className="nw-tab-content">
				{activeSidebarTab === "codex" && <CodexPanel plugin={plugin} />}
				{activeSidebarTab === "config" && (
					<ConfigPanel plugin={plugin} />
				)}
				{activeSidebarTab === "chats" && <ChatsPanel plugin={plugin} />}
			</div>
		</div>
	);
}
