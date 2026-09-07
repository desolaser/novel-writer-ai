import { useCallback, useMemo, useState } from "react";
import { Notice } from "obsidian";
import type NovelWriterPlugin from "../../../../../main";
import type { BlueprintField, NovelBlueprint } from "../../../../domain";
import type { BlueprintProposal } from "../../../../types/BlueprintAi";
import type { PacingSuggestion } from "../../../../constants/structures";
import {
	BLUEPRINT_FIELD_LABELS,
	buildBlueprintDeducePrompt,
	buildBlueprintFieldPrompt,
	deducibleFields,
	type BlueprintPromptContext,
} from "../../../../context/blueprintPrompt";
import { parseBlueprintAnswer, resolveBlueprintField } from "../../../../utils/blueprintParsing";
import { runBlueprintCompletion } from "./runCompletion";

type Proposals = Partial<Record<BlueprintField, BlueprintProposal>>;

/** A proposal the author took, ready to be merged into the blueprint. */
export interface AcceptedDeduction {
	field: BlueprintField;
	patch: Partial<NovelBlueprint>;
}

export interface BlueprintAiController {
	proposals: Proposals;
	busy: boolean;
	/** Fields the model would be asked about right now. */
	targets: BlueprintField[];
	proposalCount: number;
	acceptableCount: number;
	instructions: string;
	setInstructions: (value: string) => void;
	deduceAll: () => Promise<void>;
	/** Re-asks for one field. `another` tells the model not to repeat what is on screen. */
	deduceField: (field: BlueprintField, another?: boolean) => Promise<void>;
	accept: (field: BlueprintField) => void;
	acceptAll: () => void;
	discard: (field: BlueprintField) => void;
	discardAll: () => void;
}

const MAX_TOKENS_FIELD = 200;
const MAX_TOKENS_ALL = 600;

/**
 * Deduction engine for the blueprint. Every answer lands as a proposal the
 * author accepts or discards; accepting is what marks the field as deduced.
 */
export function useBlueprintAi(
	plugin: NovelWriterPlugin,
	blueprint: NovelBlueprint | null,
	pacing: PacingSuggestion,
	onAccept: (accepted: AcceptedDeduction[]) => void,
): BlueprintAiController {
	const [proposals, setProposals] = useState<Proposals>({});
	const [busy, setBusy] = useState(false);
	const [instructions, setInstructions] = useState("");

	const targets = useMemo(
		() => (blueprint ? deducibleFields(blueprint, pacing) : []),
		[blueprint, pacing]
	);

	const setProposal = (field: BlueprintField, proposal: BlueprintProposal) =>
		setProposals((previous) => ({ ...previous, [field]: proposal }));

	const runCompletion = useCallback(
		(prompt: string, maxTokens: number) => runBlueprintCompletion(plugin, prompt, maxTokens),
		[plugin]
	);

	/** The deduction reads the premise; without one there is nothing to reason from. */
	const context = useCallback((): BlueprintPromptContext | null => {
		if (!blueprint) return null;
		if (!blueprint.description.trim()) {
			new Notice("Write the description first: every deduction is based on it.");
			return null;
		}
		return { blueprint, pacing, instructions };
	}, [blueprint, pacing, instructions]);

	const deduceAll = useCallback(async () => {
		const promptContext = context();
		if (!promptContext || busy || targets.length === 0) return;
		setBusy(true);
		targets.forEach((field) =>
			setProposal(field, { field, status: "loading", text: "", patch: null })
		);
		try {
			const answer = await runCompletion(
				buildBlueprintDeducePrompt(promptContext, targets),
				MAX_TOKENS_ALL
			);
			const parsed = parseBlueprintAnswer(answer, targets, BLUEPRINT_FIELD_LABELS);
			setProposals((previous) => {
				const next = { ...previous };
				for (const field of targets) {
					const result = parsed[field];
					next[field] = result
						? { field, status: "ready", text: result.text, patch: result.patch }
						: {
								field,
								status: "error",
								text: "",
								patch: null,
								error: "The model did not answer this field.",
						  };
				}
				return next;
			});
		} catch (error: any) {
			const message = error?.message ?? String(error);
			setProposals((previous) => {
				const next = { ...previous };
				targets.forEach((field) => {
					next[field] = { field, status: "error", text: "", patch: null, error: message };
				});
				return next;
			});
		} finally {
			setBusy(false);
		}
	}, [context, busy, targets, runCompletion]);

	const deduceField = useCallback(
		async (field: BlueprintField, another = false) => {
			const promptContext = context();
			if (!promptContext || busy) return;
			setBusy(true);
			const previous = proposals[field];
			setProposal(field, { field, status: "loading", text: "", patch: null });
			try {
				const prompt = buildBlueprintFieldPrompt(
					promptContext,
					field,
					another ? previous?.text : undefined
				);
				const answer = await runCompletion(prompt, MAX_TOKENS_FIELD);
				const result = resolveBlueprintField(field, answer, BLUEPRINT_FIELD_LABELS[field]);
				setProposal(field, { field, status: "ready", text: result.text, patch: result.patch });
			} catch (error: any) {
				setProposal(field, {
					field,
					status: "error",
					text: "",
					patch: null,
					error: error?.message ?? String(error),
				});
			} finally {
				setBusy(false);
			}
		},
		[context, busy, proposals, runCompletion]
	);

	const discard = useCallback((field: BlueprintField) => {
		setProposals((previous) => {
			const next = { ...previous };
			delete next[field];
			return next;
		});
	}, []);

	const accept = useCallback(
		(field: BlueprintField) => {
			const proposal = proposals[field];
			if (!proposal?.patch) return;
			onAccept([{ field, patch: proposal.patch }]);
			discard(field);
		},
		[proposals, onAccept, discard]
	);

	// Accepted in one call: applying them one by one would make each write start
	// from the same stale blueprint and only the last one would survive.
	const acceptAll = useCallback(() => {
		const accepted = (Object.values(proposals).filter(Boolean) as BlueprintProposal[])
			.filter((proposal) => proposal.status === "ready" && proposal.patch)
			.map((proposal) => ({ field: proposal.field, patch: proposal.patch as Partial<NovelBlueprint> }));
		if (accepted.length) onAccept(accepted);
		setProposals({});
	}, [proposals, onAccept]);

	const discardAll = useCallback(() => setProposals({}), []);

	const values = Object.values(proposals).filter(Boolean) as BlueprintProposal[];

	return {
		proposals,
		busy,
		targets,
		proposalCount: values.length,
		acceptableCount: values.filter((item) => item.status === "ready" && item.patch).length,
		instructions,
		setInstructions,
		deduceAll,
		deduceField,
		accept,
		acceptAll,
		discard,
		discardAll,
	};
}
