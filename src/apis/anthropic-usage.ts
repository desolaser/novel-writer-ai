import type { CompletionResponse } from '../types/CompletionResponse';

type CompletionUsage = NonNullable<CompletionResponse['usage']>;

/** Shape of the `usage` object returned by both the Anthropic API and the Claude Code CLI. */
export interface AnthropicUsage {
	input_tokens?: number;
	output_tokens?: number;
	cache_read_input_tokens?: number;
	cache_creation_input_tokens?: number;
	output_tokens_details?: { thinking_tokens?: number };
}

/**
 * Translates Anthropic's `usage` into the OpenAI-style shape the rest of the plugin expects.
 *
 * NOTE: `input_tokens` only counts tokens that did NOT come from cache. With prompt caching
 * on, most of the input lives in the cache fields (we measured 2 vs. 12,968 in a real CLI
 * call), so `prompt_tokens` has to sum all three or the plugin's token counter lies by
 * orders of magnitude.
 */
export function mapAnthropicUsage(usage: AnthropicUsage | null | undefined): CompletionUsage | undefined {
	if (!usage) return undefined;
	const fresh = usage.input_tokens ?? 0;
	const cacheRead = usage.cache_read_input_tokens ?? 0;
	const cacheWrite = usage.cache_creation_input_tokens ?? 0;
	const promptTokens = fresh + cacheRead + cacheWrite;
	const completionTokens = usage.output_tokens ?? 0;
	return {
		prompt_tokens: promptTokens,
		completion_tokens: completionTokens,
		prompt_cache_hit_tokens: cacheRead,
		prompt_cache_miss_tokens: fresh,
		total_tokens: promptTokens + completionTokens,
		completion_tokens_details: {
			reasoning_tokens: usage.output_tokens_details?.thinking_tokens ?? 0,
		},
	};
}
