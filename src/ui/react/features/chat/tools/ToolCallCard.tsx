import { useState } from 'react';
import type { MensajeToolCall } from '../../../../../domain';
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
			<button
				type="button"
				className="nw-btn-link nw-btn-small"
				onClick={() => setExpanded(!expanded)}
			>
				{expanded ? 'Show less' : `Show all (${words} words)`}
			</button>
		</span>
	);
}

export interface ToolCallCardProps {
	call: MensajeToolCall;
	/** False for a stored trace: an unfinished call there was interrupted. */
	live: boolean;
	onApprove?: (id: string) => void;
	onReject?: (id: string) => void;
	/** Approves this call and the rest of the turn's writes. */
	onApproveAll?: (id: string) => void;
}

function statusLabel(call: MensajeToolCall, live: boolean): string {
	if (call.truncated) return 'Cut off by the output limit';
	const unfinished = ['pending', 'awaiting', 'running'].includes(call.status);
	if (!live && unfinished) return 'Interrupted';
	return STATUS_LABEL[call.status] ?? call.status;
}

export function ToolCallCard({
	call,
	live,
	onApprove,
	onReject,
	onApproveAll,
}: ToolCallCardProps) {
	const args = Object.entries(call.args).filter(([, value]) => value.trim());
	const awaiting = live && call.status === 'awaiting' && call.kind === 'write';

	return (
		<div className={`nw-tool-card nw-tool-card-${call.status}`}>
			<div className="nw-tool-card-header">
				<Icon.Settings width={13} height={13} />
				<span className="nw-tool-card-name">{call.name}</span>
				<span className={`nw-tool-card-kind nw-tool-card-kind-${call.kind}`}>
					{call.kind === 'unknown' ? 'unknown tool' : call.kind}
				</span>
				<span className="nw-tool-card-status">{statusLabel(call, live)}</span>
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
			{awaiting && (
				<div className="nw-tool-card-actions">
					<button
						type="button"
						className="nw-btn nw-btn-small nw-btn-primary"
						onClick={() => onApprove?.(call.id)}
					>
						Approve
					</button>
					<button
						type="button"
						className="nw-btn nw-btn-small"
						title="Approve this and every other change until the AI finishes this answer"
						onClick={() => onApproveAll?.(call.id)}
					>
						Approve all for this answer
					</button>
					<button
						type="button"
						className="nw-btn nw-btn-small"
						onClick={() => onReject?.(call.id)}
					>
						Reject
					</button>
				</div>
			)}
			{call.output !== undefined && !awaiting && (
				<div
					className={`nw-tool-card-result${call.ok ? '' : ' nw-tool-card-result-error'}`}
				>
					{call.output}
				</div>
			)}
		</div>
	);
}
