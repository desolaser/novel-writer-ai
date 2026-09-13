import { EditorView, ViewPlugin, ViewUpdate, DecorationSet } from '@codemirror/view';
import { StateEffect } from '@codemirror/state';
import type { EntradaCodex } from '../../domain/entities/EntradaCodex';
import type { Categoria } from '../../domain/entities/Categoria';
import { type KeywordRule, type MatchRange, buildRules, computeMatches, buildDecorations } from './codexMatching';
import { CodexTooltip } from './codexTooltip';

const refreshEffect = StateEffect.define<null>();

export type CodexHighlighterOptions = {
	onOpenEntry: (entryId: string) => void;
};

export type CodexHighlighterControl = {
	update(entries: EntradaCodex[], categories: Categoria[]): void;
};

export function createCodexHighlighter(opts: CodexHighlighterOptions): { extension: ViewPlugin<any>; control: CodexHighlighterControl } {
	let currentRules: KeywordRule[] = [];
	const views = new Set<EditorView>();

	const plugin = ViewPlugin.fromClass(
		class {
			decorations: DecorationSet;
			matches: MatchRange[];
			private editorView: EditorView;
			private hoverTimeout: ReturnType<typeof setTimeout> | null = null;
			/** Owned by this pane alone, so hovering one manuscript never hides or steals another's tooltip. */
			private tooltip = new CodexTooltip();

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
					if (this.tooltip.target && !this.tooltip.contains(e.target as HTMLElement)) {
						this.tooltip.scheduleHide();
					}
					if (this.hoverTimeout) { clearTimeout(this.hoverTimeout); this.hoverTimeout = null; }
					return;
				}

				if (target === this.tooltip.target) {
					this.tooltip.cancelScheduledHide();
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
					if (hit) this.tooltip.show(hit, target, opts.onOpenEntry);
				}, 350);
			};

			onMouseLeave = () => {
				if (this.hoverTimeout) { clearTimeout(this.hoverTimeout); this.hoverTimeout = null; }
				this.tooltip.scheduleHide();
			};

			destroy() {
				this.editorView.dom.removeEventListener('mousemove', this.onMouseMove);
				this.editorView.dom.removeEventListener('mouseleave', this.onMouseLeave);
				views.delete(this.editorView);
				if (this.hoverTimeout) clearTimeout(this.hoverTimeout);
				this.tooltip.hide();
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
