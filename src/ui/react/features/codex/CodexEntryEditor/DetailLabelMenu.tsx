import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { usePositionedDropdown } from '../../../hooks/usePositionedDropdown';

export function DetailLabelMenu({ d, onRemove, onEdit }: { d: any; onRemove: () => void; onEdit: () => void }) {
	const [open, setOpen] = useState(false);
	const { wrapRef, style } = usePositionedDropdown(open, () => setOpen(false), { needed: 120, anchorSelf: true });
	return (
		<div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
			<button type="button" className="nw-detail-label-btn" onClick={() => setOpen(!open)}>
				{d.nombre || '(unnamed)'}
			</button>
			{open && (
				<div className="nw-dropdown nw-popover" style={{ minWidth: 180, ...style }}>
					<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setOpen(false); onEdit(); }}>
						<Icon.Edit width={14} height={14} />
						<span style={{ flex: 1 }}>Edit this detail</span>
					</button>
					<button type="button" className="nw-popover-item nw-popover-danger" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { setOpen(false); onRemove(); }}>
						<Icon.Trash width={14} height={14} />
						<span style={{ flex: 1 }}>Remove this detail</span>
					</button>
				</div>
			)}
		</div>
	);
}
