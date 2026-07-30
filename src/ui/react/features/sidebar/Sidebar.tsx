import React from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../main';
import { CodexPanel } from '../codex/CodexPanel';
import { SnippetsPanel } from './SnippetsPanel';
import { ChatsPanel } from './ChatsPanel';

export function Sidebar({ plugin }: { plugin: NovelWriterPlugin }) {
	const { activeSidebarTab, setSidebarTab } = useNovelWriter();
	return (
		<div className="nw-sidebar-tabs">
			<div className="nw-tab-bar">
				<button className={activeSidebarTab === 'codex' ? 'active' : ''} onClick={() => setSidebarTab('codex')}>Codex</button>
				<button className={activeSidebarTab === 'snippets' ? 'active' : ''} onClick={() => setSidebarTab('snippets')}>Snippets</button>
				<button className={activeSidebarTab === 'chats' ? 'active' : ''} onClick={() => setSidebarTab('chats')}>Chats</button>
			</div>
			<div className="nw-tab-content">
				{activeSidebarTab === 'codex' && <CodexPanel plugin={plugin} />}
				{activeSidebarTab === 'snippets' && <SnippetsPanel plugin={plugin} />}
				{activeSidebarTab === 'chats' && <ChatsPanel plugin={plugin} />}
			</div>
		</div>
	);
}