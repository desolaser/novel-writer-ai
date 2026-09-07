import React, { useState } from 'react';
import type { ToolCallState } from '../../../../../types/AiTool';
import { Icon } from '../../../components/Icon';

/**
 * One tool call as shown in the chat: what the model wants to do, and — for write
 * actions — the approval the author has to give before anything touches the vault.
 */

const STATUS_LABEL: Record<string, string> = {
	pending: 'Queued',
	awaiting: 'Waiting for your approval',
	running: 'Running...',
	done: 'Done',
	error: 'Failed',
	rejected: 'Rejected',
};

/** Long argument values are collapsed so a whole chapter does not flood the chat. */
function ArgumentValue({ value }: { value: string }) {
	const [expanded, setExpanded] = useState(false);
	const isLong = value.length > 220;
	if (!isLong) return <span className="nw-tool-arg-value">{value}</span>;
	const words = value.trim().split(/\s+/).length;
	return (
		<span className="nw-tool-arg-value">
			{expanded ? value : `${value.slice(0, 200).trim()}...`}
			<button type="button" className="nw-btn-link nw-btn-small" onClick={() => setExpanded(!expanded)}>
				{expanded ? 'Show less' : `Show all (${words} words)`}
			</button>
		</span>
	);
}

export function ToolCallCard({
	state,
	onApprove,
	onReject,
}: {
	state: ToolCallState;
	onApprove: (id: string) => void;
	onReject: (id: string) => void;
}) {
	const { call, definition, status, result } = state;
	const isWrite = definition?.kind === 'write';
	const args = Object.entries(call.args).filter(([, value]) => value.trim());

	return (
		<div className={`nw-tool-card nw-tool-card-${status}`}>
			<div className="nw-tool-card-header">
				<Icon.Settings width={13} height={13} />
				<span className="nw-tool-card-name">{call.name}</span>
				<span className={`nw-tool-card-kind nw-tool-card-kind-${definition?.kind ?? 'unknown'}`}>
					{definition ? definition.kind : 'unknown tool'}
				</span>
				<span className="nw-tool-card-status">
					{call.truncated ? 'Cut off by the output limit' : STATUS_LABEL[status] ?? status}
				</span>
			</div>
			{args.length > 0 && (
				<dl className="nw-tool-card-args">
					{args.map(([name, value]) => (
						<div key={name} className="nw-tool-arg">
							<dt>{name}</dt>
							<dd><ArgumentValue value={value} /></dd>
						</div>
					))}
				</dl>
			)}
			{status === 'awaiting' && isWrite && (
				<div className="nw-tool-card-actions">
					<button type="button" className="nw-btn nw-btn-small nw-btn-primary" onClick={() => onApprove(call.id)}>Approve</button>
					<button type="button" className="nw-btn nw-btn-small" onClick={() => onReject(call.id)}>Reject</button>
				</div>
			)}
			{result && status !== 'awaiting' && (
				<div className={`nw-tool-card-result${result.ok ? '' : ' nw-tool-card-result-error'}`}>{result.output}</div>
			)}
		</div>
	);
}
