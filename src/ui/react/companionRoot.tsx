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
				<h2>No novels</h2>
				<p>Create your first novel to start writing.</p>
				<button
					className="nw-btn nw-btn-primary"
					onClick={() =>
						(plugin.app as any).commands.executeCommandById(
							"novel-writer-ai:create-novel"
						)
					}
				>
					+ Create novel
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
					<p className="nw-muted">Select a novel</p>
				)}
			</div>
		</div>
	);
}
