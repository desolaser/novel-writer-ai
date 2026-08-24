import React, { useState } from 'react';
import type NovelWriterPlugin from '../../../../../../../main';
import { Icon } from '../../../../components/Icon';
import { ContextPicker } from '../../../../components/ContextPicker';
import { useCodexAi } from './CodexAiProvider';

/**
 * Controls for bulk generation: instructions, extra context, scope and the two
 * ways of running it. Per-field buttons live next to their own fields.
 */
export function CodexAiPanel({ plugin, entryId }: { plugin: NovelWriterPlugin; entryId: string }) {
	const ai = useCodexAi();
	const [open, setOpen] = useState(false);
	if (!ai) return null;

	const readyCount = Object.values(ai.proposals).filter((proposal) => proposal.status === 'ready' && !proposal.unmatched).length;

	return (
		<div className="nw-ai-gen-section">
			<button className="nw-ai-gen-header" onClick={() => setOpen(!open)} type="button">
				<span className="nw-ai-gen-header-text">AI Generation</span>
				<span style={{ display: 'inline-flex', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : undefined }}>
					<Icon.ChevronDown width={16} height={16} />
				</span>
			</button>
			{open && (
				<div className="nw-ai-gen-body">
					<div className="nw-field nw-field-stacked">
						<label>Context</label>
						<ContextPicker
							plugin={plugin}
							items={ai.contextItems}
							onChange={ai.setContextItems}
							excludeEntryId={entryId}
							dropDown
						/>
					</div>
					<div className="nw-field nw-field-stacked">
						<label>Instructions</label>
						<textarea
							className="nw-textarea"
							rows={3}
							value={ai.instructions}
							onChange={(event) => ai.setInstructions(event.target.value)}
							placeholder="What should the AI know or do? (optional)"
							disabled={ai.busy}
						/>
					</div>
					<div className="nw-ai-gen-scope">
						<label className="nw-radio">
							<input type="radio" name="nw-ai-scope" checked={ai.scope === 'empty'} onChange={() => ai.setScope('empty')} disabled={ai.busy} />
							Empty fields only
						</label>
						<label className="nw-radio">
							<input type="radio" name="nw-ai-scope" checked={ai.scope === 'all'} onChange={() => ai.setScope('all')} disabled={ai.busy} />
							All fields (rewrites)
						</label>
						<span className="nw-muted" style={{ fontSize: 11 }}>{ai.targetCount} field(s)</span>
					</div>
					<div className="nw-ai-gen-actions">
						<button
							className="nw-btn nw-btn-primary"
							onClick={() => void ai.generateAtOnce()}
							disabled={ai.busy || ai.targetCount === 0}
							type="button"
							title="One request for every field. Faster, needs a model that follows the format."
						>
							<Icon.Magic width={14} height={14} />
							Generate
						</button>
						<button
							className="nw-btn"
							onClick={() => void ai.generateSequential()}
							disabled={ai.busy || ai.targetCount === 0}
							type="button"
							title="One request per field, each one aware of the previous answers. Slower, works with weaker models."
						>
							Field by field
						</button>
						{ai.busy && ai.progress && (
							<button className="nw-btn nw-btn-danger" type="button" onClick={ai.cancel}>Stop</button>
						)}
						{ai.busy && (
							<span className="nw-ai-gen-spinner">
								{ai.progress ? `Generating ${ai.progress.current}/${ai.progress.total}: ${ai.progress.label}` : 'Generating...'}
							</span>
						)}
					</div>
					{ai.proposalCount > 0 && (
						<div className="nw-ai-gen-review">
							<span>{ai.proposalCount} suggestion(s) waiting in the fields below.</span>
							<div className="nw-ai-gen-actions">
								<button className="nw-btn nw-btn-small nw-btn-primary" type="button" disabled={readyCount === 0} onClick={() => void ai.acceptAll()}>Accept all</button>
								<button className="nw-btn nw-btn-small" type="button" onClick={ai.discardAll}>Discard all</button>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
