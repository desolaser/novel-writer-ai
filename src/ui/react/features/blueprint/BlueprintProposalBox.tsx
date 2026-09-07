import React from "react";
import { Icon } from "../../components/Icon";
import type { BlueprintField } from "../../../../domain";
import type { BlueprintAiController } from "./useBlueprintAi";

/**
 * Pending deduction for one field, shown right under it. The author decides;
 * nothing reaches the blueprint until Accept.
 */
export function BlueprintProposalBox({
	field,
	ai,
}: {
	field: BlueprintField;
	ai: BlueprintAiController;
}) {
	const proposal = ai.proposals[field];
	if (!proposal) return null;

	if (proposal.status === "loading")
		return <div className="nw-ai-proposal nw-ai-proposal-loading">Deducing...</div>;

	if (proposal.status === "error")
		return (
			<div className="nw-ai-proposal nw-ai-proposal-error">
				<span>{proposal.error ?? "The deduction failed."}</span>
				<div className="nw-ai-proposal-actions">
					<button
						type="button"
						className="nw-btn nw-btn-small"
						disabled={ai.busy}
						onClick={() => void ai.deduceField(field)}
					>
						Retry
					</button>
					<button
						type="button"
						className="nw-btn nw-btn-small"
						onClick={() => ai.discard(field)}
					>
						Dismiss
					</button>
				</div>
			</div>
		);

	// A proposal with nothing to write is not a failure: for narrative time it is
	// the model saying the description shows no evidence, which is a valid answer.
	const usable = Boolean(proposal.patch);

	return (
		<div className={`nw-ai-proposal${usable ? "" : " nw-ai-proposal-unmatched"}`}>
			<div className="nw-ai-proposal-label">
				<Icon.Magic width={12} height={12} />
				<span>{usable ? "Deduced by the AI" : "Nothing to change"}</span>
			</div>
			<div className="nw-ai-proposal-text">{proposal.text}</div>
			<div className="nw-ai-proposal-actions">
				{usable && (
					<button
						type="button"
						className="nw-btn nw-btn-small nw-btn-primary"
						title="Use this value and mark the field as deduced"
						onClick={() => ai.accept(field)}
					>
						Accept
					</button>
				)}
				<button
					type="button"
					className="nw-btn nw-btn-small"
					disabled={ai.busy}
					title="Ask for a different option"
					onClick={() => void ai.deduceField(field, true)}
				>
					Another option
				</button>
				<button
					type="button"
					className="nw-btn nw-btn-small"
					onClick={() => ai.discard(field)}
				>
					Discard
				</button>
			</div>
		</div>
	);
}

/** Marks a value the author did not choose themselves. */
export function DeducedBadge({ show }: { show: boolean }) {
	if (!show) return null;
	return (
		<span className="nw-blueprint-badge" title="Deduced by the AI. Edit the field to make it yours.">
			deduced
		</span>
	);
}
