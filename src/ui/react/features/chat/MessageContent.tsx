import type NovelWriterPlugin from '../../../../../main';
import type { Mensaje } from '../../../../domain';
import { splitTurn } from '../../../../utils/turnSegments';
import { ToolCallTrace } from './tools/ToolCallTrace';
import { MarkdownBlock } from './MarkdownBlock';

export interface MessageContentProps {
	plugin: NovelWriterPlugin;
	message: Mensaje;
	resolveText: (text: string) => string;
}

/**
 * Body of a stored message. An answer of the AI shows what it said and the
 * tool calls it made in the order they happened, each group of calls folded
 * where it ran, instead of all the text first and every call at the end.
 */
export function MessageContent({ plugin, message, resolveText }: MessageContentProps) {
	if (message.role !== 'assistant') {
		if (!message.mensaje) return null;
		return <div className="nw-msg-body">{resolveText(message.mensaje)}</div>;
	}
	const segments = splitTurn(message.mensaje ?? '', message.toolCalls ?? []);
	return (
		<>
			{segments.map((segment, index) => segment.kind === 'text'
				? (
					<div key={`text-${index}`} className="nw-msg-body">
						<MarkdownBlock plugin={plugin} content={resolveText(segment.text)} />
					</div>
				)
				: <ToolCallTrace key={`calls-${index}`} calls={segment.calls} />)}
		</>
	);
}
