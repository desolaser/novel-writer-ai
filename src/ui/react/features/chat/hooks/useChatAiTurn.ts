import { useCallback, useState } from 'react';
import type NovelWriterPlugin from '../../../../../../main';
import { ApiFactory } from '../../../../../factories/api-factory';
import { getActiveModelConfig } from '../../../../../infrastructure/settings/active-model';
import { buildToolPrompt } from '../../../../../context/toolPrompt';
import { TOOL_DEFINITIONS } from '../../../../../tools/registry';
import { formatToolResults } from '../../../../../utils/toolCallParsing';
import { parseToolAnswer } from '../../../../../tools/parseToolAnswer';
import type { useToolRunner } from '../tools/useToolRunner';
import { buildPrompt, type ContextItem } from '../promptBuilder';

/** Safety net against a model that keeps calling tools instead of answering. */
const MAX_TOOL_ROUNDS = 4;

const extractImageUrls = (result: { images?: string[] }): string[] =>
	result.images?.filter(url => typeof url === 'string' && url.trim()) ?? [];

/** Appends a compact record of what the tools did, so the chat keeps the trace. */
export const composeReply = (text: string, log: string[]): string => {
	if (!log.length) return text;
	return `${text}\n\n---\n${log.map(line => `_${line}_`).join('\n')}`.trim();
};

type ToolRunner = ReturnType<typeof useToolRunner>;

interface UseChatAiTurnParams {
	plugin: NovelWriterPlugin;
	contextItems: ContextItem[];
	characterContext: ContextItem | null;
	impersonateContext: ContextItem | null;
	activeNoteItem: ContextItem | null;
	runner: ToolRunner;
	toolsEnabled: boolean;
	activeStoryBible: string;
}

/**
 * Runs one chat turn: asks the model, executes any tool calls it makes and asks
 * again with the results, until it answers without calling anything (or the round
 * limit is hit). `liveText` tracks what the model has written so far this turn, so
 * the author sees the answer take shape while a write tool still waits for approval.
 */
export function useChatAiTurn({
	plugin, contextItems, characterContext, impersonateContext, activeNoteItem, runner, toolsEnabled, activeStoryBible,
}: UseChatAiTurnParams) {
	const [liveText, setLiveText] = useState('');
	const resetLiveText = useCallback(() => setLiveText(''), []);

	const runAiTurn = useCallback(async ({ history, userText, images, chatPrompt }: {
		history: any[];
		userText: string;
		images: string[];
		chatPrompt?: string;
	}): Promise<{ text: string; images: string[]; log: string[] }> => {
		const settings = plugin.settings.data;
		const activeModel = getActiveModelConfig(settings, 'chat');
		if (!activeModel.modelName) throw new Error('Configure an active model in Settings.');
		const token = settings.apiToken[activeModel.providerId] ?? '';
		const api = new ApiFactory().createApi(activeModel.providerId, token);
		const savedModel = settings.modelos.find(model => model.id_modelo === settings.modeloPredeterminadoId);
		// Tools stay off while roleplaying: a character must not step out of persona to edit the vault.
		const toolsBlock = characterContext || !toolsEnabled
			? ''
			: buildToolPrompt(TOOL_DEFINITIONS, activeModel.options.max_tokens);

		let turns = [...history];
		let pendingUser = userText;
		setLiveText('');
		const visible: string[] = [];
		const log: string[] = [];
		let collectedImages: string[] = [];

		for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
			const prompt = buildPrompt(turns, contextItems, pendingUser, characterContext, impersonateContext, activeNoteItem, chatPrompt, toolsBlock, activeStoryBible);
			const result = await api.generateCompletion(prompt, activeModel.modelName, {
				...activeModel.options,
				stream: false,
				...(activeModel.providerId === 'openrouter' && savedModel?.supports_image_generation ? { modalities: ['image', 'text'] } : {}),
				...(round === 0 && images.length > 0 ? { images } : {}),
			});
			collectedImages = [...collectedImages, ...extractImageUrls(result)];
			const answer = result.text ?? '';
			const parsed = toolsBlock ? parseToolAnswer(answer, `r${round}`) : { text: answer, calls: [] };
			if (parsed.text) {
				visible.push(parsed.text);
				// Show it now: a write tool is about to ask for approval and the author
				// needs to read why before deciding.
				setLiveText(visible.join('\n\n'));
			}
			if (!parsed.calls.length) break;
			if (round === MAX_TOOL_ROUNDS) {
				log.push(`Stopped after ${MAX_TOOL_ROUNDS} rounds of tool calls.`);
				break;
			}
			const results = await runner.runCalls(parsed.calls);
			results.forEach(item => log.push(`${item.ok ? 'ok' : 'failed'}: ${item.name}`));
			turns = [...turns, { role: 'user', mensaje: pendingUser }, { role: 'assistant', mensaje: parsed.text || '(tool call)' }];
			pendingUser = formatToolResults(results);
		}
		return { text: visible.join('\n\n').trim(), images: collectedImages, log };
	}, [plugin, contextItems, characterContext, impersonateContext, activeNoteItem, runner, toolsEnabled, activeStoryBible]);

	return { liveText, resetLiveText, runAiTurn };
}
