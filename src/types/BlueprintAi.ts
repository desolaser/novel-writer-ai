import type { BlueprintField, NovelBlueprint } from '../domain/entities/NovelBlueprint';

/**
 * Types for AI-assisted setup of a novel blueprint.
 *
 * Nothing the model answers is written on its own: every answer becomes a
 * proposal the author accepts, and accepting marks the field as deduced so the
 * author can always tell which decisions were not theirs.
 */

export type BlueprintProposalStatus = 'loading' | 'ready' | 'error';

/** A pending suggestion for one field of the blueprint. */
export interface BlueprintProposal {
	field: BlueprintField;
	status: BlueprintProposalStatus;
	/** Value shown to the author. */
	text: string;
	/**
	 * What accepting writes into the blueprint. Null when the answer could not be
	 * used, which for a field like narrative time simply means "no evidence".
	 */
	patch: Partial<NovelBlueprint> | null;
	error?: string;
}

/** Progress of a running deduction, for the status line. */
export interface BlueprintAiProgress {
	current: number;
	total: number;
	label: string;
}
