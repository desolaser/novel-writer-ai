import type { MensajeToolCall } from '../../../../../domain';
import { ToolCallCard } from './ToolCallCard';

/** Tool calls stored with a finished answer, folded so they do not flood the chat. */
export function ToolCallTrace({ calls }: { calls: MensajeToolCall[] }) {
	if (!calls.length) return null;
	const failed = calls.filter((call) => call.status === 'error').length;
	const summary = `${calls.length} tool ${calls.length === 1 ? 'call' : 'calls'}`
		+ (failed ? ` (${failed} failed)` : '');
	return (
		<details className="nw-tool-trace">
			<summary>{summary}</summary>
			<div className="nw-tool-calls">
				{calls.map((call) => (
					<ToolCallCard key={call.id} call={call} live={false} />
				))}
			</div>
		</details>
	);
}
