import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { usePositionedDropdown } from '../../../hooks/usePositionedDropdown';

export function RefPicker({ value, groups, onChange }: { value: string | null; groups: { key: string; label: string; entries: any[] }[]; onChange: (v: string | null) => void }) {
	const [open, setOpen] = useState(false);
	const { wrapRef, style: dropStyle } = usePositionedDropdown(open, () => setOpen(false), { needed: 280, maxHeight: 380 });
	const allEntries: any[] = groups.flatMap((g) => g.entries);
	const selected = allEntries.find((e) => e.id_entrada_codex === value) || null;
	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<button type="button" className="nw-select nw-dropdown-trigger" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
				{selected ? (
					<>
						{selected.thumbnail ? <img className="nw-ref-avatar" src={selected.thumbnail} alt="" /> : <span className="nw-ref-avatar-placeholder"><Icon.Link width={12} height={12} /></span>}
						<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.nombre || '(unnamed)'}</span>
					</>
				) : (
					<span className="nw-muted" style={{ flex: 1 }}>(not selected)</span>
				)}
				<span style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
			</button>
			{open && (
				<div className="nw-dropdown nw-popover nw-ref-picker" style={{ minWidth: 240, ...dropStyle, overflowY: 'auto' }}>
					<button type="button" className={'nw-popover-item' + (value == null ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(null); setOpen(false); }}>
						<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value == null ? <Icon.Check width={12} height={12} /> : null}</span>
						<Icon.X width={14} height={14} />
						<span style={{ flex: 1 }} className="nw-muted">Clear selection</span>
					</button>
					{groups.length === 0 && <div className="nw-popover-item nw-muted">No entries available</div>}
					{groups.map((g) => (
						<div key={g.key}>
							<div className="nw-popover-group-title">{g.label}</div>
							{g.entries.map((e: any) => (
								<button key={e.id_entrada_codex} type="button" className={'nw-popover-item' + (value === e.id_entrada_codex ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(e.id_entrada_codex); setOpen(false); }}>
									<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value === e.id_entrada_codex ? <Icon.Check width={12} height={12} /> : null}</span>
									{e.thumbnail ? <img className="nw-ref-avatar" src={e.thumbnail} alt="" /> : <span className="nw-ref-avatar-placeholder"><Icon.Link width={12} height={12} /></span>}
									<span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.nombre || '(unnamed)'}</span>
								</button>
							))}
						</div>
					))}
				</div>
			)}
		</div>
	);
}
