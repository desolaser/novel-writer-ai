import React, { useEffect, useRef } from 'react';
import { useNovelWriter } from './store/novelWriterStore';
import { Sidebar } from './features/sidebar/Sidebar';
import { WorkZone } from './features/WorkZone';
import { NovelSwitcher } from './features/sidebar/NovelSwitcher';
import { CodexPanel } from './features/codex/CodexPanel';
import { CodexEntryEditor } from './features/codex/CodexEntryEditor';
import { Icon } from './components/Icon';
import type NovelWriterPlugin from '../../../main';

export function NovelWriterRoot({ plugin }: { plugin: NovelWriterPlugin }) {
	const { sidebarCollapsed, sidebarWidth, editingEntryId, store, setActiveNovel, novels, activeNovelId } = useNovelWriter();

	// Persistir UI prefs en settings cuando cambian
	useEffect(() => {
		const sub = useNovelWriter.subscribe((s, prev) => {
			if (s.sidebarWidth !== prev.sidebarWidth || s.sidebarCollapsed !== prev.sidebarCollapsed || s.activeWorkTab !== prev.activeWorkTab || s.activeSidebarTab !== prev.activeSidebarTab) {
				plugin.settings.data.uiPrefs = {
					sidebarWidth: s.sidebarWidth, sidebarCollapsed: s.sidebarCollapsed,
					activeWorkTab: s.activeWorkTab, activeSidebarTab: s.activeSidebarTab,
				};
				plugin.settings.save();
			}
		});
		return () => sub();
	}, [plugin]);

	// Persistir novela activa
	useEffect(() => {
		plugin.settings.data.lastActiveNovelId = activeNovelId;
		plugin.settings.save();
	}, [activeNovelId, plugin]);

	if (novels.length === 0) {
		return (
			<div className="nw-empty-state">
				<h2>No hay novelas</h2>
				<p>Crea tu primera novela para empezar a escribir.</p>
				<button className="nw-btn nw-btn-primary" onClick={() => (plugin.app as any).commands.executeCommandById('novel-writer-ai:create-novel')}>
					+ Crear novela
				</button>
			</div>
		);
	}

	return (
		<div className="novel-writer-layout" style={{ '--nw-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
			{!sidebarCollapsed && (
				<div className="nw-sidebar" style={{ width: `${sidebarWidth}px` }}>
					<div className="nw-sidebar-header">
						<NovelSwitcher plugin={plugin} />
					</div>
					<div className="nw-sidebar-content">
						{activeNovelId ? <Sidebar plugin={plugin} /> : <p style={{ padding: '12px', color: 'var(--text-muted)' }}>Selecciona una novela</p>}
					</div>
					<SidebarResizer />
				</div>
			)}
			<button className={"nw-sidebar-toggle"} onClick={() => useNovelWriter.getState().toggleSidebar()} title={sidebarCollapsed ? 'Abrir sidebar' : 'Cerrar sidebar'}>{sidebarCollapsed ? <Icon.ChevronRight width={16} height={16} /> : <Icon.ChevronLeft width={16} height={16} />}</button>
			<div className="nw-main">
				{activeNovelId ? (
					editingEntryId ? <CodexEntryEditor key={editingEntryId ?? 'none'} plugin={plugin} /> : <WorkZone plugin={plugin} />
				) : (
					<NoNovelSelected plugin={plugin} />
				)}
			</div>
		</div>
	);
}

function NoNovelSelected({ plugin }: { plugin: NovelWriterPlugin }) {
	return (
		<div className="nw-empty-state">
			<h2>Selecciona una novela</h2>
			<NovelSwitcher plugin={plugin} inline />
		</div>
	);
}

function SidebarResizer() {
	const setSidebarWidth = useNovelWriter.getState().setSidebarWidth;
	const startRef = React.useRef(0);
	const onDown = (e: React.MouseEvent) => {
		e.preventDefault();
		startRef.current = e.clientX;
		const startW = useNovelWriter.getState().sidebarWidth;
		const onMove = (ev: MouseEvent) => {
			const next = Math.min(600, Math.max(200, startW + (ev.clientX - startRef.current)));
			setSidebarWidth(next);
		};
		const onUp = () => {
			document.removeEventListener("mousemove", onMove);
			document.removeEventListener("mouseup", onUp);
		};
		document.addEventListener("mousemove", onMove);
		document.addEventListener("mouseup", onUp);
	};
	return <div className="nw-sidebar-resizer" onMouseDown={onDown} title="Arrastrar para redimensionar" />;
}
