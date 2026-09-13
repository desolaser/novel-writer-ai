import { useEffect, useRef, useState } from 'react';

export interface PositionedDropdownOptions {
	/** Space below the anchor, in px, under which the dropdown flips to open upward. */
	needed: number;
	/** Caps the dropdown's height once sized to the available space. Omitted for a
	 * small fixed-size menu that never needs to scroll. */
	maxHeight?: number;
	/** Measure the wrapper element itself instead of its first `<button>` descendant. */
	anchorSelf?: boolean;
	/** Close on an outside click. Defaults to true. */
	closeOnOutsideClick?: boolean;
}

/**
 * Flips a dropdown above or below its trigger depending on available viewport
 * space, and (by default) closes it on an outside click. Shared by every
 * absolutely-positioned popover in the codex entry editor, which used to
 * reimplement this same measurement five times over.
 */
export function usePositionedDropdown(open: boolean, onClose: () => void, options: PositionedDropdownOptions) {
	const { needed, maxHeight, anchorSelf, closeOnOutsideClick = true } = options;
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const [style, setStyle] = useState<React.CSSProperties>({});

	useEffect(() => {
		if (!open) return;
		const wrap = wrapRef.current;
		if (!wrap) return;
		const target = anchorSelf ? wrap : wrap.querySelector('button');
		const r = target?.getBoundingClientRect() ?? wrap.getBoundingClientRect();
		const spaceBelow = window.innerHeight - r.bottom;
		const spaceAbove = r.top;
		const above = spaceBelow < needed && spaceAbove > spaceBelow;
		const next: React.CSSProperties = { left: 0, right: 'auto', top: above ? 'auto' : '100%', bottom: above ? '100%' : 'auto' };
		if (maxHeight != null) next.maxHeight = Math.min(above ? spaceAbove - 8 : spaceBelow - 8, maxHeight);
		setStyle(next);

		if (!closeOnOutsideClick) return;
		const onDocClick = (e: MouseEvent) => { if (!wrap.contains(e.target as Node)) onClose(); };
		document.addEventListener('mousedown', onDocClick);
		return () => document.removeEventListener('mousedown', onDocClick);
	}, [open, needed, maxHeight, anchorSelf, closeOnOutsideClick]);

	return { wrapRef, style };
}
