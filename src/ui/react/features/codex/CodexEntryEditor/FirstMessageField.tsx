import React, { useState } from 'react';
import { Icon } from '../../../components/Icon';

/**
 * Opening line a character says when the author drops them into an empty chat.
 * Only rendered for entries of a character category, and collapsed unless it
 * already has text, so it stays out of the way of entries that never roleplay.
 */
export function FirstMessageField({ value, onChange, onSave }: {
	value: string;
	onChange: (next: string) => void;
	onSave: () => void;
}) {
	const [collapsed, setCollapsed] = useState(!value);

	return (
		<div className="nw-field nw-field-stacked">
			<div className="nw-ai-label-row nw-first-message-header" onClick={() => setCollapsed(!collapsed)}>
				<label>First Message</label>
				<button
					type="button"
					className="nw-btn nw-btn-icon nw-detail-toggle"
					title={collapsed ? 'Expand' : 'Collapse'}
					onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
				>
					{collapsed ? <Icon.ChevronRight width={14} height={14} /> : <Icon.ChevronDown width={14} height={14} />}
				</button>
			</div>
			{!collapsed && (
				<>
					<p className="nw-muted" style={{ padding: 0, fontSize: 11 }}>
						{`Opening line for roleplay. It is posted as the character's first message when you add them to an empty chat. Use {{char}} for this character and {{user}} for whoever you impersonate.`}
					</p>
					<textarea
						className="nw-textarea"
						rows={4}
						value={value}
						onChange={(e) => onChange(e.target.value)}
						onBlur={onSave}
						placeholder="Write how the character opens the conversation..."
					/>
				</>
			)}
		</div>
	);
}
