import React from 'react';
import { Icon } from '../../../../components/Icon';
import { useCodexAi } from './CodexAiProvider';

/**
 * Pending AI suggestion for one field: the author sees it next to the current
 * value and decides. Renders nothing when there is no proposal for the field.
 */
export function AiProposalBox({ fieldKey }: { fieldKey: string }) {
	const ai = useCodexAi();
	const proposal = ai?.proposals[fieldKey];
	if (!ai || !proposal) return null;

	if (proposal.status === 'loading') {
		return <div className="nw-ai-proposal nw-ai-proposal-loading">Generating...</div>;
	}

	if (proposal.status === 'error') {
		return (
			<div className="nw-ai-proposal nw-ai-proposal-error">
				<span>{proposal.error ?? 'Generation failed.'}</span>
				<div className="nw-ai-proposal-actions">
					<button type="button" className="nw-btn nw-btn-small" disabled={ai.busy} onClick={() => void ai.generateField(fieldKey)}>Retry</button>
					<button type="button" className="nw-btn nw-btn-small" onClick={() => ai.discard(fieldKey)}>Dismiss</button>
				</div>
			</div>
		);
	}

	// A reference to an entry that does not exist yet is offered as a new codex entry
	// instead of being thrown away: the author gets a stub they can fill in later.
	const missingReference = ai.canAddToCodex(fieldKey);

	return (
		<div className={`nw-ai-proposal${proposal.unmatched ? ' nw-ai-proposal-unmatched' : ''}`}>
			<div className="nw-ai-proposal-label">
				<Icon.Magic width={12} height={12} />
				<span>{missingReference ? 'This entry does not exist yet' : proposal.unmatched ? 'Not one of the allowed values' : 'AI suggestion'}</span>
			</div>
			<div className="nw-ai-proposal-text">{proposal.text}</div>
			<div className="nw-ai-proposal-actions">
				{!missingReference && (
					<button
						type="button"
						className="nw-btn nw-btn-small nw-btn-primary"
						disabled={proposal.unmatched}
						title={proposal.unmatched ? 'The model answered outside the allowed options' : 'Replace the current value'}
						onClick={() => void ai.accept(fieldKey)}
					>Accept</button>
				)}
				{missingReference && (
					<button
						type="button"
						className="nw-btn nw-btn-small nw-btn-primary"
						title="Create an empty codex entry with this name and link it here"
						onClick={() => void ai.addToCodex(fieldKey)}
					>Add to Codex</button>
				)}
				<button type="button" className="nw-btn nw-btn-small" disabled={ai.busy} onClick={() => void ai.generateField(fieldKey)}>Regenerate</button>
				<button type="button" className="nw-btn nw-btn-small" onClick={() => ai.discard(fieldKey)}>Discard</button>
			</div>
		</div>
	);
}
