import type { EntradaCodex } from '../../domain/entities/EntradaCodex';
import type { MatchRange } from './codexMatching';

/** The hover card shown over a highlighted codex mention, and its DOM lifecycle. */

function createTooltipEl(entry: EntradaCodex, color: string, onOpen: () => void): HTMLElement {
	const wrap = document.createElement('div');
	wrap.className = 'nw-codex-tooltip';

	const header = document.createElement('div');
	header.className = 'nw-codex-tooltip-header';
	wrap.appendChild(header);

	if (entry.thumbnail) {
		const img = document.createElement('img');
		img.className = 'nw-codex-tooltip-thumb';
		img.src = entry.thumbnail;
		img.alt = entry.nombre;
		header.appendChild(img);
	}

	const info = document.createElement('div');
	info.className = 'nw-codex-tooltip-info';
	header.appendChild(info);

	const nameEl = document.createElement('div');
	nameEl.className = 'nw-codex-tooltip-name';
	nameEl.style.color = color;
	nameEl.textContent = entry.nombre;
	info.appendChild(nameEl);

	if (entry.alias?.trim()) {
		const aliasEl = document.createElement('div');
		aliasEl.className = 'nw-codex-tooltip-alias';
		aliasEl.textContent = entry.alias;
		info.appendChild(aliasEl);
	}

	if (entry.descripcion?.trim()) {
		const desc = document.createElement('div');
		desc.className = 'nw-codex-tooltip-desc';
		const text = entry.descripcion.trim();
		desc.textContent = text.length > 200 ? text.slice(0, 200) + '...' : text;
		wrap.appendChild(desc);
	}

	const footer = document.createElement('div');
	footer.className = 'nw-codex-tooltip-footer';
	wrap.appendChild(footer);

	const btn = document.createElement('button');
	btn.className = 'nw-codex-tooltip-open';
	btn.textContent = 'Open entry';
	btn.addEventListener('click', (e) => {
		e.preventDefault();
		e.stopPropagation();
		onOpen();
	});
	footer.appendChild(btn);

	return wrap;
}

/**
 * One tooltip's lifecycle. Instantiated per editor pane (not shared module state):
 * a single set of `activeTooltip`/`hideTimeout` variables shared across every open
 * manuscript pane would let a tooltip in one pane be hidden or stolen by mouse
 * movement in another.
 */
export class CodexTooltip {
	private element: HTMLElement | null = null;
	private targetEl: HTMLElement | null = null;
	private hideTimeout: ReturnType<typeof setTimeout> | null = null;

	get target(): HTMLElement | null {
		return this.targetEl;
	}

	contains(node: Node): boolean {
		return this.element?.contains(node) ?? false;
	}

	cancelScheduledHide() {
		if (this.hideTimeout) { clearTimeout(this.hideTimeout); this.hideTimeout = null; }
	}

	scheduleHide() {
		if (this.hideTimeout) clearTimeout(this.hideTimeout);
		this.hideTimeout = setTimeout(() => {
			this.hideTimeout = null;
			this.hide();
		}, 200);
	}

	hide() {
		this.cancelScheduledHide();
		if (this.element) {
			this.element.remove();
			this.element = null;
			this.targetEl = null;
		}
	}

	show(match: MatchRange, target: HTMLElement, onOpenEntry: (entryId: string) => void) {
		this.cancelScheduledHide();
		this.hide();

		const tooltip = createTooltipEl(match.entry, match.color, () => {
			this.hide();
			onOpenEntry(match.entry.id_entrada_codex);
		});

		document.body.appendChild(tooltip);

		const rect = target.getBoundingClientRect();
		const tooltipHeight = tooltip.offsetHeight;
		const tooltipWidth = tooltip.offsetWidth;

		let top = rect.top - tooltipHeight - 4;
		let left = rect.left + rect.width / 2 - tooltipWidth / 2;

		if (left < 4) left = 4;
		if (left + tooltipWidth > window.innerWidth - 4) left = window.innerWidth - 4 - tooltipWidth;
		if (top < 4) top = rect.bottom + 4;

		tooltip.style.top = `${top}px`;
		tooltip.style.left = `${left}px`;

		tooltip.addEventListener('mouseenter', () => this.cancelScheduledHide());
		tooltip.addEventListener('mouseleave', () => this.scheduleHide());

		this.element = tooltip;
		this.targetEl = target;
	}
}
