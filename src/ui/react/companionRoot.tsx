import React from "react";
import { useNovelWriter } from "./store/novelWriterStore";
import { Sidebar, NovelManagementMenu } from "./features/sidebar/Sidebar";
import { NovelSwitcher } from "./features/sidebar/NovelSwitcher";
import type NovelWriterPlugin from "../../../main";

/** The Companion ItemView is the sidebar itself; it has no workzone/main area. */
export function CompanionRoot({ plugin }: { plugin: NovelWriterPlugin }) {
	const { activeNovelId, novels } = useNovelWriter();
	
	if (novels.length === 0) {
		return (
			<div className="nw-empty-state">
				<h2>No hay novelas</h2>
				<p>Crea tu primera novela para empezar a escribir.</p>
				<button
					className="nw-btn nw-btn-primary"
					onClick={() =>
						(plugin.app as any).commands.executeCommandById(
							"novel-writer-ai:create-novel"
						)
					}
				>
					+ Crear novela
				</button>
			</div>
		);
	}

	return (
		<div className="nw-companion-sidebar">
			<div className="nw-sidebar-header">
				<NovelSwitcher plugin={plugin} />
				<NovelManagementMenu plugin={plugin} />
			</div>
			<div className="nw-sidebar-content">
				{activeNovelId ? (
					<Sidebar plugin={plugin} />
				) : (
					<p className="nw-muted">Selecciona una novela</p>
				)}
			</div>
		</div>
	);
}
