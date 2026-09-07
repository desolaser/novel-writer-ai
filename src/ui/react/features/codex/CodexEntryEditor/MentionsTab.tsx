import React, { useState, useEffect } from 'react';
import { MarkdownView, TFile } from 'obsidian';
import { useNovelWriter } from '../../../store/novelWriterStore';
import type NovelWriterPlugin from '../../../../../../main';
import type { EntradaCodex } from '../../../../../domain/entities/EntradaCodex';

interface MentionHit {
	actoName: string;
	capName: string;
	capArchivo: string;
	line: number;
	ch: number;
	before: string;
	keyword: string;
	after: string;
}

function stripAccents(value: string): string {
	return value.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function buildEntryRegex(entry: EntradaCodex): RegExp | null {
	const candidates = [entry.nombre, ...(entry.alias || '').split(',')]
		.map(v => v.trim())
		.filter(Boolean);

	const escaped = candidates.map(c => {
		const stripped = stripAccents(entry.case_sensitive ? c : c.toLowerCase());
		return stripped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	}).filter(Boolean);

	if (!escaped.length) return null;
	escaped.sort((a, b) => b.length - a.length);
	const pattern = escaped.join('|');
	const flags = entry.case_sensitive ? 'g' : 'gi';
	try {
		return new RegExp(`(?<=^|[^a-zA-Z0-9])(?:${pattern})(?=$|[^a-zA-Z0-9])`, flags);
	} catch {
		return null;
	}
}

function cleanWhitespace(s: string): string {
	return s.replace(/\n+/g, ' ').replace(/\s+/g, ' ');
}

export function useMentionCount(entry: EntradaCodex | null, plugin: NovelWriterPlugin): number {
	const { actos, capitulos, store } = useNovelWriter() as any;
	const [count, setCount] = useState(0);

	useEffect(() => {
		let cancelled = false;
		const scan = async () => {
			if (!entry) { setCount(0); return; }
			const regex = buildEntryRegex(entry);
			if (!regex || !store) { setCount(0); return; }
			const folderPath: string | null = store.activeFolderPath;
			if (!folderPath) { setCount(0); return; }

			let total = 0;
			for (const acto of actos) {
				const actCaps = capitulos.filter((c: any) => c.id_acto === acto.id_acto);
				for (const cap of actCaps) {
					if (!cap.archivo) continue;
					const fullPath = cap.archivo.startsWith('escritura/')
						? `${folderPath}/${cap.archivo}`
						: cap.archivo;
					const file = plugin.app.vault.getAbstractFileByPath(fullPath);
					if (!(file instanceof TFile)) continue;
					let raw: string;
					try { raw = await plugin.app.vault.read(file); } catch { continue; }
					if (cancelled) return;
					const fmMatch = raw.match(/^---[\s\S]*?---\s*/);
					const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;
					const stripped = stripAccents(body);
					const searchText = stripped.length === body.length ? stripped : body;
					regex.lastIndex = 0;
					while (regex.exec(searchText) !== null) total++;
				}
			}
			if (!cancelled) setCount(total);
		};
		scan();
		return () => { cancelled = true; };
	}, [entry?.id_entrada_codex, entry?.nombre, entry?.alias, entry?.case_sensitive, actos, capitulos, store]);

	return count;
}

export function MentionsTab({
	entry, plugin, onClose,
}: {
	entry: EntradaCodex;
	plugin: NovelWriterPlugin;
	onClose?: () => void;
}) {
	const { actos, capitulos, store } = useNovelWriter() as any;
	const [mentions, setMentions] = useState<MentionHit[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;
		const scan = async () => {
			setLoading(true);
			const regex = buildEntryRegex(entry);
			if (!regex || !store) {
				setMentions([]);
				setLoading(false);
				return;
			}

			const folderPath: string | null = store.activeFolderPath;
			if (!folderPath) {
				setMentions([]);
				setLoading(false);
				return;
			}

			const hits: MentionHit[] = [];
			const sortedActos = [...actos].sort((a: any, b: any) => a.orden - b.orden);

			for (const acto of sortedActos) {
				const actCaps = capitulos
					.filter((c: any) => c.id_acto === acto.id_acto)
					.sort((a: any, b: any) => a.orden - b.orden);

				for (const cap of actCaps) {
					if (!cap.archivo) continue;
					const fullPath = cap.archivo.startsWith('escritura/')
						? `${folderPath}/${cap.archivo}`
						: cap.archivo;

					const file = plugin.app.vault.getAbstractFileByPath(fullPath);
					if (!(file instanceof TFile)) continue;

					let raw: string;
					try {
						raw = await plugin.app.vault.read(file);
					} catch { continue; }

					if (cancelled) return;

					let bodyStart = 0;
					const fmMatch = raw.match(/^---[\s\S]*?---\s*/);
					if (fmMatch) bodyStart = fmMatch[0].length;

					const body = raw.slice(bodyStart);
					const stripped = stripAccents(body);
					const searchText = stripped.length === body.length ? stripped : body;

					regex.lastIndex = 0;
					let match: RegExpExecArray | null;
					while ((match = regex.exec(searchText)) !== null) {
						const posInBody = match.index;
						const posInRaw = bodyStart + posInBody;

						const textBefore = raw.slice(0, posInRaw);
						const line = (textBefore.match(/\n/g) || []).length;
						const lastNewline = textBefore.lastIndexOf('\n');
						const ch = posInRaw - lastNewline - 1;

						const originalKeyword = body.slice(posInBody, posInBody + match[0].length);
						const ctxStart = Math.max(0, posInBody - 50);
						const ctxEnd = Math.min(body.length, posInBody + match[0].length + 50);
						const before = (ctxStart > 0 ? '...' : '') + cleanWhitespace(body.slice(ctxStart, posInBody));
						const after = cleanWhitespace(body.slice(posInBody + match[0].length, ctxEnd)) + (ctxEnd < body.length ? '...' : '');

						hits.push({
							actoName: acto.nombre,
							capName: cap.nombre,
							capArchivo: fullPath,
							line,
							ch,
							before,
							keyword: originalKeyword,
							after,
						});
					}
				}
			}

			if (!cancelled) {
				setMentions(hits);
				setLoading(false);
			}
		};

		scan();
		return () => { cancelled = true; };
	}, [entry.id_entrada_codex, entry.nombre, entry.alias, entry.case_sensitive]);

	const navigateToMention = async (hit: MentionHit) => {
		onClose?.();
		await plugin.app.workspace.openLinkText(hit.capArchivo, '', false);
		setTimeout(() => {
			const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) return;
			const editor = view.editor;
			editor.setCursor({ line: hit.line, ch: hit.ch });
			editor.setSelection(
				{ line: hit.line, ch: hit.ch },
				{ line: hit.line, ch: hit.ch + hit.keyword.length },
			);
			editor.scrollIntoView(
				{ from: { line: Math.max(0, hit.line - 5), ch: 0 }, to: { line: hit.line + 5, ch: 0 } },
				true,
			);
		}, 150);
	};

	if (loading) {
		return (
			<div className="nw-entry-tab">
				<p className="nw-muted">Scanning chapters...</p>
			</div>
		);
	}

	if (mentions.length === 0) {
		return (
			<div className="nw-entry-tab">
				<p className="nw-muted">No mentions found in any chapter.</p>
			</div>
		);
	}

	const grouped = new Map<string, Map<string, MentionHit[]>>();
	for (const m of mentions) {
		if (!grouped.has(m.actoName)) grouped.set(m.actoName, new Map());
		const actGroup = grouped.get(m.actoName)!;
		if (!actGroup.has(m.capName)) actGroup.set(m.capName, []);
		actGroup.get(m.capName)!.push(m);
	}

	return (
		<div className="nw-entry-tab nw-mentions-tab">
			{[...grouped.entries()].map(([actoName, chapters]) => (
				<div key={actoName} className="nw-mentions-act-group">
					<div className="nw-mentions-act-name">{actoName}</div>
					{[...chapters.entries()].map(([capName, hits]) => (
						<div key={capName} className="nw-mentions-chapter-group">
							<div className="nw-mentions-chapter-header">
								<span className="nw-mentions-chapter-name">{capName}</span>
								<span className="nw-mentions-badge">{hits.length}</span>
							</div>
							<div className="nw-mentions-list">
								{hits.map((hit, i) => (
									<button
										key={i}
										className="nw-mentions-item"
										onClick={() => navigateToMention(hit)}
										title={`Line ${hit.line + 1}`}
									>
										<span className="nw-mentions-excerpt">
											{hit.before}<mark>{hit.keyword}</mark>{hit.after}
										</span>
									</button>
								))}
							</div>
						</div>
					))}
				</div>
			))}
		</div>
	);
}
