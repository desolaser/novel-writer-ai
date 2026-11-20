import type { ContinuityIssue } from "../../../../types/Continuity";

export interface ContinuityIssueCardProps {
	issue: ContinuityIssue;
	/** "Ch. 2 "Arrival"", "the codex" or "" when unknown. */
	source: string;
	/** The quote is still in the chapter text. */
	canReveal: boolean;
	onReveal: () => void;
	onDismiss: () => void;
}

/** One contradiction: what, where in the chapter, and what it contradicts. */
export function ContinuityIssueCard({
	issue,
	source,
	canReveal,
	onReveal,
	onDismiss,
}: ContinuityIssueCardProps) {
	return (
		<div className="nw-continuity-issue">
			<div className="nw-continuity-issue-title">{issue.title}</div>
			<blockquote className="nw-continuity-quote">{issue.quote}</blockquote>
			{issue.fact && (
				<div className="nw-continuity-fact">
					<span>Contradicts: </span>
					{issue.fact}
					{source ? ` (${source})` : ""}
				</div>
			)}
			{issue.explanation && (
				<p className="nw-continuity-explanation">{issue.explanation}</p>
			)}
			<div className="nw-continuity-issue-buttons">
				<button
					disabled={!canReveal}
					title={canReveal
						? "Open the chapter at this passage"
						: "The passage is no longer in the chapter"}
					onClick={onReveal}
				>
					Go to text
				</button>
				<button onClick={onDismiss}>Dismiss</button>
			</div>
		</div>
	);
}
