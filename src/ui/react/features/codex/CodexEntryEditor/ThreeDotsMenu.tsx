import { useState } from 'react';
import { Icon } from '../../../components/Icon';
import { DEFAULT_COLORS as PALETTE } from '../../../../../constants/novel';

export function ThreeDotsMenu({ entry, otherNovels, onSelectColor, onSelectMove, onSelectCopy, onClearThumbnail, onArchive, onDelete }: { entry: any; otherNovels: any[]; onSelectColor: (c: string | null) => void; onSelectMove: (id: string) => void; onSelectCopy: (id: string) => void; onClearThumbnail: () => void; onArchive: () => void; onDelete: () => void }) {
	const [colorOpen, setColorOpen] = useState(false);
	const [moveOpen, setMoveOpen] = useState(false);
	const [copyOpen, setCopyOpen] = useState(false);
	const colorNames = ['Red', 'Orange', 'Yellow', 'Green', 'Teal', 'Blue', 'Purple', 'Pink', 'Gray', 'Black'];
	return (
		<div className="nw-dropdown nw-popover nw-threedots-menu" style={{ top: '100%', right: 0, left: 'auto', minWidth: 220, maxHeight: 480, overflowY: 'auto' }}>
			<div className="nw-popover-section-title">Color</div>
			{!colorOpen ? (
				<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setColorOpen(true)}>
					{entry.color ? <span className="nw-color-dot" style={{ background: entry.color }} /> : <span className="nw-color-dot" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--background-modifier-border)' }} />}
					<span style={{ flex: 1 }}>{entry.color ? colorNames[PALETTE.indexOf(entry.color)] ?? 'Custom' : 'Default'}</span>
					<Icon.ChevronRight width={12} height={12} />
				</button>
			) : (
				<div>
					{PALETTE.map((c, i) => (
						<button key={c} type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onSelectColor(c)}>
							<span style={{ width: 14, display: 'inline-flex', justifyContent: 'center' }}>{entry.color === c ? <Icon.Check width={12} height={12} /> : null}</span>
							<span className="nw-color-dot" style={{ background: c }} />
							<span style={{ flex: 1 }}>{colorNames[i]}</span>
						</button>
					))}
					<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onSelectColor(null)}>
						<span style={{ width: 14 }} />
						<span className="nw-color-dot" style={{ background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--background-modifier-border)' }} />
						<span style={{ flex: 1 }} className="nw-muted">No color</span>
					</button>
				</div>
			)}
			<hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
			<div className="nw-popover-section-title">Copy to</div>
			{!copyOpen ? (
				<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setCopyOpen(true)}>
					<Icon.Copy width={14} height={14} />
					<span style={{ flex: 1 }}>Select novel...</span>
					<Icon.ChevronRight width={12} height={12} />
				</button>
			) : (
				<div>
					{otherNovels.length === 0 ? (
						<div className="nw-popover-item nw-muted">No other novels</div>
					) : otherNovels.map((n) => (
						<button key={n.novela.id_novela} type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onSelectCopy(n.novela.id_novela)}>
							<span style={{ flex: 1 }}>{n.novela.nombre}</span>
						</button>
					))}
				</div>
			)}
			<div className="nw-popover-section-title">Move to</div>
			{!moveOpen ? (
				<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => setMoveOpen(true)}>
					<span style={{ flex: 1 }}>Select novel...</span>
					<Icon.ChevronRight width={12} height={12} />
				</button>
			) : (
				<div>
					{otherNovels.length === 0 ? (
						<div className="nw-popover-item nw-muted">No other novels</div>
					) : otherNovels.map((n) => (
						<button key={n.novela.id_novela} type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => onSelectMove(n.novela.id_novela)}>
							<span style={{ flex: 1 }}>{n.novela.nombre}</span>
						</button>
					))}
				</div>
			)}
			{entry.thumbnail && (
				<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={onClearThumbnail}>
					<Icon.X width={14} height={14} />
					<span style={{ flex: 1 }}>Clear Thumbnail</span>
				</button>
			)}
			<button type="button" className="nw-popover-item" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={onArchive}>
				<Icon.MenuThreePoints width={14} height={14} />
				<span style={{ flex: 1 }}>{entry.archivado ? 'Unarchive Entry' : 'Archive Entry'}</span>
			</button>
			<button type="button" className="nw-popover-item nw-popover-danger" style={{ width: '100%', background: 'none', border: 'none', textAlign: 'left', color: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }} onClick={onDelete}>
				<Icon.Trash width={14} height={14} />
				<span style={{ flex: 1 }}>Delete Entry</span>
			</button>
		</div>
	);
}
