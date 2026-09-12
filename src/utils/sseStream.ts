/**
 * Reads a fetch/requestUrl response body as a Server-Sent Events stream: decode →
 * split on newlines → yield each `data:` line parsed as JSON. Stops on the `[DONE]`
 * sentinel every provider here uses to end a stream.
 *
 * A parse failure on a `data:` line is swallowed by default (SSE keep-alives and
 * other non-JSON events are expected on some endpoints); pass `onParseError` to
 * override that for an endpoint where a malformed chunk should abort the stream
 * instead of being skipped.
 */
export async function* parseSSEStream<T = any>(
	body: ReadableStream<Uint8Array>,
	options: {
		mapChunk?: (parsed: any) => T;
		onParseError?: (error: unknown, raw: string) => void;
	} = {},
): AsyncGenerator<T, void, unknown> {
	const mapChunk = options.mapChunk ?? ((parsed: any) => parsed as T);
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = '';

	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		buffer += decoder.decode(value, { stream: true });

		const lines = buffer.split('\n');
		buffer = lines.pop()!; // the last line may be incomplete

		for (const line of lines) {
			if (!line.startsWith('data:')) continue;
			const data = line.replace(/^data:\s*/, '');
			if (data === '[DONE]') return;
			try {
				yield mapChunk(JSON.parse(data));
			} catch (error) {
				options.onParseError?.(error, data);
			}
		}
	}
}
