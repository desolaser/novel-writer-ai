import type { ToolDefinition } from '../types/AiTool';

/**
 * Renders the tool catalogue as instructions for the model. Pure.
 *
 * The block format mirrors the one used for codex generation: headers in double
 * brackets, values below them. It survives sloppy output far better than JSON,
 * which matters because this prompt goes to every provider the plugin supports.
 */

function describeArgument(argument: ToolDefinition['args'][number]): string {
	const flags = [argument.required ? 'required' : 'optional'];
	if (argument.multiline) flags.push('multi-line');
	if (argument.values?.length) flags.push(`one of: ${argument.values.join(' | ')}`);
	return `    [[${argument.name}]] (${flags.join(', ')}) ${argument.description}`;
}

function describeTool(tool: ToolDefinition): string {
	const header = `  ${tool.name} (${tool.kind}) — ${tool.description}`;
	if (!tool.args.length) return header;
	return [header, ...tool.args.map(describeArgument)].join('\n');
}

/**
 * Instruction block appended to the chat system prompt when tools are enabled.
 * `maxOutputTokens` is the model's output limit; telling the model about it is what
 * keeps it from starting a long value it cannot finish.
 */
export function buildToolPrompt(tools: ToolDefinition[], maxOutputTokens?: number): string {
	if (!tools.length) return '';
	const budget = maxOutputTokens && maxOutputTokens > 0
		? [`- Your whole answer, tool blocks included, must fit in about ${maxOutputTokens} tokens. If a long value will `
			+ 'not fit, write a shorter one now and finish it with a second call using [[mode]] append. A call that gets '
			+ 'cut off before its closing [[/tool]] is discarded entirely, so never start a value you cannot close.']
		: [];
	return [
		'[TOOLS]',
		'You can inspect and edit this novel through tools. To call one, write a block exactly like this:',
		'',
		'[[tool: write_chapter]]',
		'[[chapter]] Chapter 3',
		'[[mode]] append',
		'[[content]]',
		'The text to write, which may span',
		'as many lines as needed.',
		'[[/tool]]',
		'',
		'Rules:',
		'- Call a tool only when you actually need it. For ordinary conversation, just answer.',
		'- You may explain what you are about to do before the block, and you may write several blocks in one answer.',
		'- After a tool block, stop and wait: you will receive the results and can continue from there.',
		'- Never invent a result, and never claim you did something a tool has not confirmed.',
		'- Read tools run immediately. Write tools are shown to the author, who may reject them.',
		'- Copy names exactly as the tools report them, or refer to a chapter by its position (#2).',
		...budget,
		'',
		'Available tools:',
		tools.map(describeTool).join('\n'),
		'[/TOOLS]',
	].join('\n');
}
