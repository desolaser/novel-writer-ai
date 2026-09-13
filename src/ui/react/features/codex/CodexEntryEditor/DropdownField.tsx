import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { usePositionedDropdown } from '../../../hooks/usePositionedDropdown';

export function DropdownField({ value, options, onChange, onManageOptions }: { value: string | null; options: any[]; onChange: (v: string | null) => void; onManageOptions: () => void }) {
	const [open, setOpen] = useState(false);
	const { wrapRef, style: dropStyle } = usePositionedDropdown(open, () => setOpen(false), { needed: 220, maxHeight: 320 });
	const selected = options.find((o) => o.id_opcion_detalle === value) || null;
	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<button type="button" className="nw-select nw-dropdown-trigger" style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
				{selected ? (
					<>
						<span className="nw-color-dot" style={{ background: selected.color }} />
						<span style={{ flex: 1 }}>{selected.nombre}</span>
					</>
				) : (
					<span className="nw-muted" style={{ flex: 1 }}>(not selected)</span>
				)}
				<span style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
			</button>
			{open && (
				<div className="nw-dropdown nw-popover" style={{ minWidth: 220, ...dropStyle, overflowY: 'auto' }}>
					<button type="button" className={'nw-popover-item' + (value == null ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(null); setOpen(false); }}>
						<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value == null ? <Icon.Check width={12} height={12} /> : null}</span>
						<span className="nw-muted">(not selected)</span>
					</button>
					{options.map((o) => (
						<button key={o.id_opcion_detalle} type="button" className={'nw-popover-item' + (value === o.id_opcion_detalle ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(o.id_opcion_detalle); setOpen(false); }}>
							<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{value === o.id_opcion_detalle ? <Icon.Check width={12} height={12} /> : null}</span>
							<span className="nw-color-dot" style={{ background: o.color }} />
							<span style={{ flex: 1 }}>{o.nombre}</span>
						</button>
					))}
					{options.length === 0 && <div className="nw-dropdown-item nw-muted">No options. Add some.</div>}
					<hr style={{ margin: 0, border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
					<button type="button" className="nw-popover-item nw-popover-manage" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setOpen(false); onManageOptions(); }}>
						<Icon.Settings width={14} height={14} />
						<span>Manage options</span>
					</button>
				</div>
			)}
		</div>
	);
}
