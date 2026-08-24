import React from 'react';
import { Icon } from '../../../../components/Icon';
import { useCodexAi } from './CodexAiProvider';

/** Per-field generate button. Renders nothing outside the AI provider. */
export function AiFieldButton({ fieldKey, title }: { fieldKey: string; title?: string }) {
	const ai = useCodexAi();
	if (!ai) return null;
	const loading = ai.proposals[fieldKey]?.status === 'loading';
	return (
		<button
			type="button"
			className="nw-btn nw-btn-icon nw-ai-field-btn"
			title={title ?? 'Generate this field with AI'}
			disabled={ai.busy}
			onClick={() => void ai.generateField(fieldKey)}
		>
			{loading ? <span className="nw-ai-field-btn-loading" /> : <Icon.Magic width={13} height={13} />}
		</button>
	);
}
