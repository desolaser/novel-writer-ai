/**
 * Types for the chat tool protocol.
 *
 * Tools are exposed to the model as a plain-text block format rather than through
 * provider-native function calling: the plugin talks to nine providers through a
 * single string prompt, and several of them (NovelAI, text-generation-webui) have
 * no tool API at all. A malformed block costs one tool call, not the whole answer.
 */

/** Read tools run on their own; write tools need the author's approval first. */
export type ToolKind = 'read' | 'write';

export interface ToolArgSpec {
	name: string;
	description: string;
	required?: boolean;
	/** Value spans the lines below its header (chapter text, outlines, descriptions). */
	multiline?: boolean;
	/** Closed set of accepted values, listed to the model. */
	values?: string[];
}

export interface ToolDefinition {
	name: string;
	kind: ToolKind;
	description: string;
	args: ToolArgSpec[];
}

/** One tool invocation parsed out of a model answer. */
export interface ToolCall {
	id: string;
	name: string;
	args: Record<string, string>;
	/** The block as written by the model, kept for error reporting. */
	raw: string;
	/**
	 * The answer ran out while a multi-line value was still being written: the model
	 * hit its output limit mid-call. Such a call is never executed, because writing a
	 * half-finished description or chapter is worse than not writing at all.
	 */
	truncated?: boolean;
}

/** Outcome of a tool call, fed back to the model as text. */
export interface ToolResult {
	callId: string;
	name: string;
	ok: boolean;
	output: string;
}

export type ToolCallStatus = 'pending' | 'awaiting' | 'running' | 'done' | 'error' | 'rejected';

/** A call plus its lifecycle, for rendering the cards in the chat. */
export interface ToolCallState {
	call: ToolCall;
	definition: ToolDefinition | null;
	status: ToolCallStatus;
	result?: ToolResult;
}
