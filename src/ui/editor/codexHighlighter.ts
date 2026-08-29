import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder, StateEffect } from '@codemirror/state';
import type { EntradaCodex } from '../../domain/entities/EntradaCodex';
import type { Categoria } from '../../domain/entities/Categoria';

interface KeywordRule {
	regex: RegExp;
	color: string;
	entry: EntradaCodex;
}

interface MatchRange {
	from: number;
	to: number;
	color: string;
	entry: EntradaCodex;
}

const refreshEffect = StateEffect.define<null>();

function stripAccents(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function buildRules(entries: EntradaCodex[]): KeywordRule[] {
	const rules: KeywordRule[] = [];

	for (const entry of entries) {
		if (entry.archivado) continue;
		if (!entry.tracking_por_nombre) continue;
		if (!entry.color) continue;

		const candidates = [entry.nombre, ...(entry.alias || '').split(',')]
			.map(v => v.trim())
			.filter(Boolean);

		const escaped = candidates.map(c => {
			const stripped = stripAccents(entry.case_sensitive ? c : c.toLowerCase());
			return stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		}).filter(Boolean);

		if (!escaped.length) continue;

		escaped.sort((a, b) => b.length - a.length);
		const pattern = escaped.join('|');
		const flags = entry.case_sensitive ? 'g' : 'gi';
		try {
			rules.push({
				regex: new RegExp(`(?<=^|[^a-zA-Z0-9])(?:${pattern})(?=$|[^a-zA-Z0-9])`, flags),
				color: entry.color,
				entry,
			});
		} catch {
			// skip invalid regex
		}
	}
	return rules;
}

/** Build a set of ranges that fall inside [[wiki-links]] so we can skip them. */
function findWikiLinkRanges(text: string, offset: number): Array<{ from: number; to: number }> {
	const ranges: Array<{ from: number; to: number }> = [];
	const re = /\[\[([^\]]*)\]\]/g;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		ranges.push({ from: offset + m.index, to: offset + m.index + m[0].length });
	}
	return ranges;
}

function isInsideWikiLink(pos: number, end: number, linkRanges: Array<{ from: number; to: number }>): boolean {
	return linkRanges.some(r => pos >= r.from && end <= r.to);
}

function computeMatches(view: EditorView, rules: KeywordRule[]): MatchRange[] {
	if (!rules.length) return [];

	const ranges: MatchRange[] = [];

	for (const { from, to } of view.visibleRanges) {
		const original = view.state.sliceDoc(from, to);
		const stripped = stripAccents(original);
		const text = stripped.length === original.length ? stripped : original;
		const linkRanges = findWikiLinkRanges(original, from);

		for (const rule of rules) {
			rule.regex.lastIndex = 0;
			let match: RegExpExecArray | null;
			while ((match = rule.regex.exec(text)) !== null) {
				const matchFrom = from + match.index;
				const matchTo = matchFrom + match[0].length;
				if (isInsideWikiLink(matchFrom, matchTo, linkRanges)) continue;
				ranges.push({ from: matchFrom, to: matchTo, color: rule.color, entry: rule.entry });
			}
		}
	}

	ranges.sort((a, b) => a.from - b.from || b.to - a.to);

	const deduped: MatchRange[] = [];
	let lastEnd = -1;
	for (const r of ranges) {
		if (r.from < lastEnd) continue;
		deduped.push(r);
		lastEnd = r.to;
	}
	return deduped;
}

function buildDecorations(matches: MatchRange[]): DecorationSet {
	const builder = new RangeSetBuilder<Decoration>();
	const cache = new Map<string, Decoration>();

	for (const m of matches) {
		let deco = cache.get(m.color);
		if (!deco) {
			deco = Decoration.mark({
				attributes: {
					style: `color: ${m.color}; text-decoration: underline; text-decoration-color: ${m.color}40;`,
					class: 'nw-codex-highlight',
				},
			});
			cache.set(m.color, deco);
		}
		builder.add(m.from, m.to, deco);
	}

	return builder.finish();
}

export type CodexHighlighterOptions = {
	onOpenEntry: (entryId: string) => void;
};

export type CodexHighlighterControl = {
	update(entries: EntradaCodex[], categories: Categoria[]): void;
};

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

let activeTooltip: HTMLElement | null = null;
let activeTooltipTarget: HTMLElement | null = null;
let hideTimeout: ReturnType<typeof setTimeout> | null = null;

function showTooltip(match: MatchRange, target: HTMLElement, onOpenEntry: (entryId: string) => void) {
	if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
	hideTooltip();

	const tooltip = createTooltipEl(match.entry, match.color, () => {
		hideTooltip();
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

	tooltip.addEventListener('mouseenter', () => {
		if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
	});
	tooltip.addEventListener('mouseleave', () => {
		scheduleHide();
	});

	activeTooltip = tooltip;
	activeTooltipTarget = target;
}

function scheduleHide() {
	if (hideTimeout) clearTimeout(hideTimeout);
	hideTimeout = setTimeout(() => {
		hideTimeout = null;
		hideTooltip();
	}, 200);
}

function hideTooltip() {
	if (activeTooltip) {
		activeTooltip.remove();
		activeTooltip = null;
		activeTooltipTarget = null;
	}
}

export function createCodexHighlighter(opts: CodexHighlighterOptions): { extension: ViewPlugin<any>; control: CodexHighlighterControl } {
	let currentRules: KeywordRule[] = [];
	const views = new Set<EditorView>();

	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			matches: MatchRange[];
			private editorView: EditorView;
			private hoverTimeout: ReturnType<typeof setTimeout> | null = null;

			constructor(view: EditorView) {
				this.editorView = view;
				views.add(view);
				this.matches = computeMatches(view, currentRules);
				this.decorations = buildDecorations(this.matches);

				view.dom.addEventListener('mousemove', this.onMouseMove);
				view.dom.addEventListener('mouseleave', this.onMouseLeave);
			}

			update(update: ViewUpdate) {
				const rulesChanged = update.transactions.some(tr => tr.effects.some(e => e.is(refreshEffect)));
				if (update.docChanged || update.viewportChanged || rulesChanged) {
					this.matches = computeMatches(update.view, currentRules);
					this.decorations = buildDecorations(this.matches);
				}
			}

			onMouseMove = (e: MouseEvent) => {
				const target = (e.target as HTMLElement).closest?.('.nw-codex-highlight') as HTMLElement | null;

				if (!target) {
					if (activeTooltipTarget && !activeTooltip?.contains(e.target as HTMLElement)) {
						scheduleHide();
					}
					if (this.hoverTimeout) { clearTimeout(this.hoverTimeout); this.hoverTimeout = null; }
					return;
				}

				if (target === activeTooltipTarget) {
					if (hideTimeout) { clearTimeout(hideTimeout); hideTimeout = null; }
					return;
				}

				if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
				const clientX = e.clientX;
				const clientY = e.clientY;
				this.hoverTimeout = setTimeout(() => {
					this.hoverTimeout = null;
					const pos = this.editorView.posAtCoords({ x: clientX, y: clientY });
					if (pos === null) return;
					const hit = this.matches.find(m => pos >= m.from && pos <= m.to);
					if (hit) showTooltip(hit, target, opts.onOpenEntry);
				}, 350);
			};

			onMouseLeave = () => {
				if (this.hoverTimeout) { clearTimeout(this.hoverTimeout); this.hoverTimeout = null; }
				scheduleHide();
			};

			destroy() {
				this.editorView.dom.removeEventListener('mousemove', this.onMouseMove);
				this.editorView.dom.removeEventListener('mouseleave', this.onMouseLeave);
				views.delete(this.editorView);
				if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
				hideTooltip();
			}
		},
		{ decorations: (v) => v.decorations },
	);

	const control: CodexHighlighterControl = {
		update(entries) {
			currentRules = buildRules(entries);
			for (const view of views) {
				view.dispatch({ effects: [refreshEffect.of(null)] });
			}
		},
	};

	return { extension: plugin, control };
}
