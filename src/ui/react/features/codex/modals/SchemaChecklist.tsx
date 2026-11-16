import React from 'react';

export interface SchemaChecklistItem {
	id: string;
	label: string;
	/** Color dot shown before the label (categories). */
	color?: string;
	/** Short tag shown after the label (detail type). */
	badge?: string;
	/** Already in the active novel under the same name: cannot be picked. */
	exists: boolean;
}

interface SchemaChecklistProps {
	title: string;
	items: SchemaChecklistItem[];
	checked: Set<string>;
	onChange: (next: Set<string>) => void;
	emptyText: string;
}

/** Checkbox list with "All" / "None" for picking what to import. */
export function SchemaChecklist(props: SchemaChecklistProps) {
	const { title, items, checked, onChange, emptyText } = props;
	const pickable = items.filter(item => !item.exists);

	const toggle = (id: string, on: boolean) => {
		const next = new Set(checked);
		if (on) {
			next.add(id);
		} else {
			next.delete(id);
		}
		onChange(next);
	};
	const selectAll = () => {
		onChange(new Set(pickable.map(item => item.id)));
	};
	const selectNone = () => onChange(new Set());

	return (
		<div className="nw-schema-checklist">
			<div className="nw-schema-checklist-head">
				<h4>{title}</h4>
				{pickable.length > 0 && (
					<span className="nw-schema-checklist-actions">
						<button className="nw-btn nw-btn-link" onClick={selectAll}>
							All
						</button>
						<button className="nw-btn nw-btn-link" onClick={selectNone}>
							None
						</button>
					</span>
				)}
			</div>
			{items.length === 0 && <p className="nw-muted">{emptyText}</p>}
			{items.map(item => (
				<label
					key={item.id}
					className={`nw-checkbox${item.exists ? ' nw-is-disabled' : ''}`}
				>
					<input
						type="checkbox"
						disabled={item.exists}
						checked={!item.exists && checked.has(item.id)}
						onChange={e => toggle(item.id, e.target.checked)}
					/>
					{item.color && (
						<span
							className="nw-schema-dot"
							style={{ background: item.color }}
						/>
					)}
					<span className="nw-schema-label">{item.label}</span>
					{item.badge && <span className="nw-muted">{item.badge}</span>}
					{item.exists && (
						<span className="nw-muted">already in this novel</span>
					)}
				</label>
			))}
		</div>
	);
}
