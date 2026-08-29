import React from "react";
import { Icon } from "../../components/Icon";
import { BLUEPRINT_FIELD_LABELS } from "../../../../context/blueprintPrompt";
import type { BlueprintAiController } from "./useBlueprintAi";

/**
 * Controls for filling in the fields the author left empty. Verb tense is never
 * here: past is the standard, so it stays the author's default and is never
 * reported as deduced.
 */
export function BlueprintAiBar({ ai }: { ai: BlueprintAiController }) {
	const pending = ai.targets.map((field) => BLUEPRINT_FIELD_LABELS[field]).join(", ");

	return (
		<div className="nw-blueprint-ai">
			<div className="nw-blueprint-ai-head">
				<button
					type="button"
					className="nw-btn nw-btn-primary"
					disabled={ai.busy || ai.targets.length === 0}
					onClick={() => void ai.deduceAll()}
				>
					<Icon.Magic width={14} height={14} />
					Complete missing fields
				</button>
				{ai.busy ? (
					<span className="nw-ai-gen-spinner">Deducing...</span>
				) : (
					<span className="nw-muted nw-blueprint-ai-targets">
						{ai.targets.length === 0 ? "Nothing left to deduce." : `To decide: ${pending}.`}
					</span>
				)}
			</div>
			<textarea
				className="nw-textarea"
				rows={2}
				value={ai.instructions}
				disabled={ai.busy}
				placeholder="Extra instructions for the AI (optional)."
				onChange={(event) => ai.setInstructions(event.target.value)}
			/>
			{ai.proposalCount > 0 && (
				<div className="nw-ai-gen-review">
					<span>{ai.proposalCount} suggestion(s) waiting in the fields below.</span>
					<div className="nw-ai-gen-actions">
						<button
							type="button"
							className="nw-btn nw-btn-small nw-btn-primary"
							disabled={ai.acceptableCount === 0}
							onClick={ai.acceptAll}
						>
							Accept all
						</button>
						<button type="button" className="nw-btn nw-btn-small" onClick={ai.discardAll}>
							Discard all
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
