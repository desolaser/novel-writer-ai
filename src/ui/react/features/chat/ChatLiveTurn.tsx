import type NovelWriterPlugin from '../../../../../main';
import type { ChatSession, ChatSessionSnapshot } from './session/ChatSession';
import { toToolCallRecord } from './session/toolHistory';
import { ToolCallCard } from './tools/ToolCallCard';
import { MarkdownBlock } from './MarkdownBlock';

export interface ChatLiveTurnProps {
	plugin: NovelWriterPlugin;
	session: ChatSession | null;
	snapshot: ChatSessionSnapshot;
	resolveText: (text: string) => string;
}

function stateLabel(snapshot: ChatSessionSnapshot): string {
	if (snapshot.stopping) return 'Stopping...';
	if (snapshot.awaiting) return 'Waiting for your approval';
	return 'Working...';
}

/**
 * The answer the AI is working on: its text so far, every tool call of the
 * turn with the approval buttons, and the controls to stop or continue it.
 */
export function ChatLiveTurn({ plugin, session, snapshot, resolveText }: ChatLiveTurnProps) {
	const { status, liveText, calls, notice, stopping } = snapshot;
	if (status === 'idle') {
		if (!notice) return null;
		return <div className="nw-chat-turn-notice">{notice}</div>;
	}
	return (
		<div className="nw-msg nw-msg-assistant nw-msg-live">
			<div className="nw-msg-role">AI</div>
			{liveText && (
				<div className="nw-msg-body">
					<MarkdownBlock plugin={plugin} content={resolveText(liveText)} />
				</div>
			)}
			{calls.length > 0 && (
				<div className="nw-tool-calls">
					{calls.map((state) => (
						<ToolCallCard
							key={state.call.id}
							// Not shortened: the author reads the whole text before approving.
							call={toToolCallRecord(state, Infinity)}
							live
							onApprove={(id) => session?.approve(id)}
							onReject={(id) => session?.reject(id)}
							onApproveAll={(id) => session?.approveAll(id)}
						/>
					))}
				</div>
			)}
			<div className="nw-chat-turn-status">
				<span className="nw-chat-turn-state">
					{status === 'paused' ? notice : stateLabel(snapshot)}
				</span>
				{status === 'paused' && (
					<button
						type="button"
						className="nw-btn nw-btn-small nw-btn-primary"
						onClick={() => void session?.continueTurn()}
					>
						Continue
					</button>
				)}
				<button
					type="button"
					className="nw-btn nw-btn-small"
					disabled={stopping}
					onClick={() => session?.stop()}
				>
					Stop
				</button>
			</div>
		</div>
	);
}
