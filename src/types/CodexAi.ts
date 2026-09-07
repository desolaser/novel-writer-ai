import type { EntityId } from '../domain';

/**
 * Types for AI-assisted authoring of Codex entries.
 *
 * The generator never writes into an entry directly: every model answer becomes
 * a proposal the author accepts or discards. Private notes (`EntradaCodex.notas`)
 * are deliberately absent from these types, they must never reach a prompt.
 */

/** Kind of value a generatable field holds: the fixed entry fields plus every TipoDetalle. */
export type CodexAiFieldType = 'alias' | 'text' | 'line' | 'dropdown' | 'codex_ref';

/** A value the model is only allowed to pick from (dropdown option or codex entry). */
export interface CodexAiChoice {
	id: EntityId;
	name: string;
	/** Extra names this choice can be matched by (codex aliases). */
	aliases?: string[];
}

/**
 * One generatable field of a codex entry. Fixed fields and per-entry details share
 * this shape so prompt building and parsing never special-case either of them.
 */
export interface CodexAiField {
	/** Stable key: 'alias', 'descripcion' or `detalle:<id_detalle>`. */
	key: string;
	/** Human label, also used as the section header in delimited output. */
	label: string;
	type: CodexAiFieldType;
	/** Only for detail fields. */
	idDetalle?: EntityId;
	/** Author-defined instruction for this detail (`Detalle.ai_hint`). */
	aiHint?: string;
	/** Allowed values, for 'dropdown' and 'codex_ref'. */
	choices?: CodexAiChoice[];
	/** Current value as readable text (options and refs resolved to names). */
	currentText: string;
	/** Current value in stored form (option id / entry id / raw text). */
	currentValue: string | null;
}

export type CodexAiProposalStatus = 'loading' | 'ready' | 'error';

/** A pending suggestion for a single field. Nothing is persisted until accepted. */
export interface CodexAiProposal {
	key: string;
	status: CodexAiProposalStatus;
	/** Text shown to the author. */
	text: string;
	/** Value to store on accept (option id / entry id for choice fields). */
	value: string | null;
	/** True when the model answered outside the allowed choices; cannot be accepted. */
	unmatched?: boolean;
	error?: string;
}

/** Which fields a bulk run targets. */
export type CodexAiScope = 'empty' | 'all';

/** Progress of a running generation, for the panel's status line. */
export interface CodexAiProgress {
	current: number;
	total: number;
	label: string;
}
