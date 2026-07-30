import React from 'react';
import { useNovelWriter } from '../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../main';
import { PlanearTab } from '../features/planear/PlanearTab';
import { EscribirTab } from '../features/escribir/EscribirTab';
import { ChatTab } from '../features/chat/ChatTab';
import { ReviewTab } from '../features/review/ReviewTab';
import { SnippetEditor } from '../features/escribir/SnippetEditor';

export function WorkZone({ plugin }: { plugin: NovelWriterPlugin }) {
	const { activeWorkTab, setWorkTab, setEditingEntry, snippetEditorId } = useNovelWriter();
	const tabs: Array<['planear' | 'escribir' | 'chat' | 'review', string]> = [
		['planear', 'Planear'], ['escribir', 'Escribir'], ['chat', 'Chat'], ['review', 'Review'],
	];
	return (
		<div className="nw-workzone">
			<div className="nw-workzone-tabs">
				{tabs.map(([k, l]) => (
					<button key={k} className={activeWorkTab === k ? 'active' : ''} onClick={() => { setWorkTab(k); setEditingEntry(null); }}>{l}</button>
				))}
				{snippetEditorId && <button className="nw-tab-extra" onClick={() => setWorkTab('escribir')}>Snippet</button>}
			</div>
			<div className="nw-workzone-content">
				{activeWorkTab === 'planear' && <PlanearTab plugin={plugin} />}
				{activeWorkTab === 'escribir' && (snippetEditorId
					? <SnippetEditor plugin={plugin} />
					: <EscribirTab plugin={plugin} />)}
				{activeWorkTab === 'chat' && <ChatTab plugin={plugin} />}
				{activeWorkTab === 'review' && <ReviewTab plugin={plugin} />}
			</div>
		</div>
	);
}