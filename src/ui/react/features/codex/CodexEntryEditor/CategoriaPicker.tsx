import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { usePositionedDropdown } from '../../../hooks/usePositionedDropdown';

export function CategoriaPicker({ value, categorias, onChange }: { value: string; categorias: any[]; onChange: (v: string) => void }) {
	const [open, setOpen] = useState(false);
	const { wrapRef, style: dropStyle } = usePositionedDropdown(open, () => setOpen(false), { needed: 240, maxHeight: 280 });
	const sel = categorias.find((c) => c.id_categoria === value);
	return (
		<div ref={wrapRef} style={{ position: 'relative' }}>
			<button type="button" className="nw-btn nw-categoria-picker" onClick={() => setOpen(!open)}>
				{sel && <span className="nw-color-dot" style={{ background: sel.color }} />}
				<span>{sel?.nombre ?? 'Category'}</span>
				<Icon.ChevronDown width={12} height={12} />
			</button>
			{open && (
				<div className="nw-dropdown nw-popover" style={{ minWidth: 200, ...dropStyle, overflowY: 'auto' }}>
					{categorias.map((c) => (
						<button key={c.id_categoria} type="button" className={'nw-popover-item' + (c.id_categoria === value ? ' is-selected' : '')} style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => { onChange(c.id_categoria); setOpen(false); }}>
							<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{c.id_categoria === value ? <Icon.Check width={12} height={12} /> : null}</span>
							<span className="nw-color-dot" style={{ background: c.color }} />
							<span style={{ flex: 1 }}>{c.nombre}</span>
						</button>
					))}
				</div>
			)}
		</div>
	);
}
