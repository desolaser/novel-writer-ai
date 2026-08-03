import React, { useEffect, useRef, useState } from 'react';
import { useNovelWriter } from './store/novelWriterStore';
import { Icon } from './components/Icon';
import { FuzzySuggestModal, TFile, TFolder } from 'obsidian';
import type NovelWriterPlugin from '../../../main';
import { ApiFactory } from '../../factories/api-factory';
import { buildScenePrompt } from '../../context/promptBuilder';

/** Compact single-column outline: every chapter owns its collapsible outline editor. */
export function OutlineRoot({ plugin }: { plugin: NovelWriterPlugin }) {
	const { actos, capitulos, createActo, createCapitulo, updateActo, deleteActo, updateCapitulo, deleteCapitulo, ensureCapituloArchivo, writeCapituloTexto, readCapituloTexto, linkCapituloArchivo, store, novels } = useNovelWriter();
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	const [editingCap, setEditingCap] = useState<string | null>(null);
	const [editingAct, setEditingAct] = useState<string | null>(null);
	const [newAct, setNewAct] = useState('');
	const [addingTo, setAddingTo] = useState<string | null>(null); const [capName, setCapName] = useState('');
	const [drafts, setDrafts] = useState<Record<string, string>>({});
	const [batchBusy, setBatchBusy] = useState(false); const [batchStatus, setBatchStatus] = useState('');
	const [openChapterMenu, setOpenChapterMenu] = useState<string | null>(null);
	const [targetWords, setTargetWords] = useState(plugin.settings.data.draftWordCount || 2000);
	const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
	useEffect(() => { const next: Record<string, string> = {}; capitulos.forEach(c => next[c.id_capitulo] = c.outline ?? ''); setDrafts(next); }, [capitulos]);
	if (novels.length === 0) return <div className="nw-empty-state"><p>Crea una novela para usar el outline.</p></div>;
	const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
	const saveOutline = (id: string, value: string) => { setDrafts(d => ({ ...d, [id]: value })); const old = timers.current[id]; if (old) clearTimeout(old); timers.current[id] = setTimeout(() => { void updateCapitulo(id, { outline: value }); }, 600); };
	const addCap = async (idActo: string) => { if (!capName.trim()) return; const c = await createCapitulo(idActo, capName.trim(), capitulos.filter(x => x.id_acto === idActo).length); setExpanded(s => new Set(s).add(c.id_capitulo)); setCapName(''); setAddingTo(null); };
	const orderedChapters = () => actos.flatMap(a => capitulos.filter(c => c.id_acto === a.id_acto));
	const buildChapterMemory = (chapter: any, chapters = orderedChapters()) => {
		const index = chapters.findIndex(c => c.id_capitulo === chapter.id_capitulo);
		return chapters.slice(0, Math.max(0, index)).filter(c => c.outline?.trim()).map(c => `${c.nombre}:\n${c.outline.trim()}`).join('\n\n===\n\n');
	};

	return <div className="nw-outline-view nw-outline-single-column">
		<div className="nw-outline-title"><strong>Outline</strong><div className="nw-outline-actions"><label className="nw-draft-length">Palabras <input type="number" min={100} max={20000} step={100} value={targetWords} onChange={e => { const n = Math.max(100, Number(e.target.value) || 2000); setTargetWords(n); plugin.settings.data.draftWordCount = n; void plugin.settings.save(); }} /></label><button className="nw-btn nw-btn-primary" disabled={batchBusy || capitulos.length === 0} onClick={() => void generateAllMemory()}>Generar memoria</button><button className="nw-btn nw-btn-primary" disabled={batchBusy || capitulos.length === 0} onClick={() => new FolderPickerModal(plugin.app, folder => void createAllManuscripts(folder.path)).open()}>Crear manuscritos</button><button className="nw-btn nw-btn-experimental" title="Función experimental: la longitud final depende del proveedor y del modelo" disabled={batchBusy || capitulos.length === 0} onClick={() => void generateDrafts()}>Generar drafts (experimental)</button></div></div>
		{batchStatus && <div className="nw-outline-status">{batchStatus}</div>}
		<div className="nw-outline-add"><input className="nw-input" value={newAct} onChange={e => setNewAct(e.target.value)} placeholder="Nuevo acto" onKeyDown={e => { if (e.key === 'Enter') void (async () => { if (newAct.trim()) { await createActo(newAct.trim()); setNewAct(''); } })(); }} /><button className="nw-btn nw-btn-primary" onClick={async () => { if (newAct.trim()) { await createActo(newAct.trim()); setNewAct(''); } }}>+ Acto</button></div>
		{actos.map(a => { const caps = capitulos.filter(c => c.id_acto === a.id_acto); return <section className="nw-outline-act" key={a.id_acto}>
			<div className="nw-outline-act-header">{editingAct === a.id_acto ? <input className="nw-input nw-inline-rename" autoFocus defaultValue={a.nombre} onBlur={e => { const n = e.target.value.trim(); if (n && n !== a.nombre) void updateActo(a.id_acto, { nombre: n }); setEditingAct(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingAct(null); }} /> : <button className="nw-outline-act-name" onClick={() => setEditingAct(a.id_acto)} title="Click para renombrar acto">{a.nombre}</button>}<span className="nw-node-count">{caps.length}</span><button className="nw-btn nw-btn-icon nw-btn-danger" onClick={() => { if (confirm(`Borrar acto "${a.nombre}"?`)) void deleteActo(a.id_acto); }}><Icon.Trash width={12} height={12} /></button></div>
			{caps.map(c => <div className="nw-outline-chapter" key={c.id_capitulo}>
				<div className="nw-outline-chapter-row"><button className="nw-outline-expand" onClick={() => toggle(c.id_capitulo)}>{expanded.has(c.id_capitulo) ? '▾' : '▸'}</button>
					{editingCap === c.id_capitulo ? <input className="nw-input nw-inline-rename" autoFocus defaultValue={c.nombre} onBlur={e => { const n = e.target.value.trim(); if (n && n !== c.nombre) void updateCapitulo(c.id_capitulo, { nombre: n }); setEditingCap(null); }} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingCap(null); }} /> : <button className="nw-outline-chapter-name" onClick={() => setEditingCap(c.id_capitulo)} title="Click para renombrar">{c.nombre}{c.outline ? ' *' : ''}</button>}
					<span className="nw-chapter-file-status">{c.archivo ? 'Archivo' : 'Sin archivo'}</span>{c.archivo && <button className="nw-btn nw-btn-icon" title="Abrir manuscrito" aria-label="Abrir manuscrito" onClick={() => openChapter(c.archivo!)}><Icon.ExternalLink width={13} height={13} /></button>}<button className="nw-btn nw-btn-icon" title="Acciones del capítulo" aria-label="Acciones del capítulo" onClick={() => setOpenChapterMenu(openChapterMenu === c.id_capitulo ? null : c.id_capitulo)}>⋯</button>{openChapterMenu === c.id_capitulo && <div className="nw-chapter-actions-menu"><button disabled={batchBusy || !c.archivo} onClick={() => { setOpenChapterMenu(null); void generateChapterOutline(c); }}>Generar Outline</button><button disabled={batchBusy} onClick={() => { setOpenChapterMenu(null); void generateChapterMemory(c); }}>Generar memoria</button><button disabled={batchBusy} onClick={() => { setOpenChapterMenu(null); void generateSingleDraft(c); }}>Generar draft</button><button onClick={() => { setOpenChapterMenu(null); new ChapterFileModal(plugin.app, file => linkCapituloArchivo(c.id_capitulo, file.path)).open(); }}>Vincular archivo Markdown</button><button className="nw-btn-danger" onClick={() => { setOpenChapterMenu(null); if (confirm(`Borrar "${c.nombre}"?`)) void deleteCapitulo(c.id_capitulo); }}>Borrar capítulo</button></div>}
				</div>
				{expanded.has(c.id_capitulo) && <textarea className="nw-outline-inline-editor" value={drafts[c.id_capitulo] ?? ''} onChange={e => saveOutline(c.id_capitulo, e.target.value)} placeholder="Resumen de lo que pasará en este capítulo..." />}
			</div>)}
			{addingTo === a.id_acto ? <div className="nw-cap-add-row"><input className="nw-input" autoFocus value={capName} onChange={e => setCapName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void addCap(a.id_acto); if (e.key === 'Escape') setAddingTo(null); }} /><button className="nw-btn nw-btn-primary" onClick={() => void addCap(a.id_acto)}><Icon.Plus /></button></div> : <button className="nw-cap-add" onClick={() => { setAddingTo(a.id_acto); setCapName(''); }}>+ Capítulo</button>}
		</section>; })}
	</div>;

	async function generateAllMemory() {
		setBatchBusy(true); setBatchStatus('Generando memoria acumulada...');
		try {
			const chapters = orderedChapters();
			for (let i = 0; i < chapters.length; i++) {
				const memory = buildChapterMemory(chapters[i], chapters);
				await writeChapterMemory(chapters[i], memory);
				setBatchStatus(`Memoria: ${i + 1}/${chapters.length}`);
			}
			setBatchStatus(`Memoria generada para ${chapters.length} capítulos.`);
		} catch (e: any) { setBatchStatus('Error: ' + (e?.message ?? String(e))); } finally { setBatchBusy(false); }
	}

	async function generateChapterMemory(chapter: any) {
		setBatchBusy(true); setBatchStatus(`Generando memoria: ${chapter.nombre}`);
		try { const memory = buildChapterMemory(chapter); await writeChapterMemory(chapter, memory); setBatchStatus(`Memoria actualizada: ${chapter.nombre}`); }
		catch (e: any) { setBatchStatus('Error: ' + (e?.message ?? String(e))); } finally { setBatchBusy(false); }
	}

	async function generateChapterOutline(chapter: any) {
		if (!store || !chapter.archivo) return;
		const settings = plugin.settings.data;
		if (!settings.proveedor.modelo) { 
			setBatchStatus('Configura un modelo en Settings.');
			return; 
		}

		setBatchBusy(true); 
		setBatchStatus(`Generando outline: ${chapter.nombre}`);

		try {
			const manuscript = await readCapituloTexto(chapter.id_capitulo);
			if (!manuscript.trim()) { 
				setBatchStatus(`El manuscrito de ${chapter.nombre} está vacío.`); 
				return; 
			}
			const prompt = `Resume el siguiente capítulo en UN ÚNICO PÁRRAFO breve, de aproximadamente 80 a 120 palabras. Prioriza una respuesta completa y terminada; no la cortes a mitad de una oración. Escribe una síntesis narrativa breve en prosa continua. No uses saltos de línea, viñetas, listas numeradas, guiones, encabezados, etiquetas, formato Markdown ni estructura de presentación. Menciona solo los acontecimientos esenciales en orden, los cambios importantes de los personajes y el estado final de la trama. No inventes información, no escribas el capítulo y devuelve únicamente ese único párrafo, sin introducción ni comentarios adicionales.\n\nTítulo del capítulo: ${chapter.nombre}\n\nTexto del capítulo:\n${manuscript}`;
			const api = new ApiFactory().createApi(settings.proveedor.id, settings.apiToken[settings.proveedor.id] ?? '');
			const result = await requestDraftCompletion(api, prompt, settings.proveedor.modelo, 800, settings.aiOptions.temperature, settings.aiOptions.topP);
			const outline = (result.text ?? '').replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
			if (!outline) { setBatchStatus(`La IA no devolvió un outline para ${chapter.nombre}.`); return; }
			await updateCapitulo(chapter.id_capitulo, { outline });
			setBatchStatus(`Outline actualizado: ${chapter.nombre}`);
		} catch (e: any) { setBatchStatus('Error: ' + (e?.message ?? String(e))); } finally { setBatchBusy(false); }
	}

	async function writeChapterMemory(chapter: any, memory: string) {
		const relativePath = await ensureCapituloArchivo(chapter.id_capitulo);
		if (!relativePath || !store?.activeFolderPath) return;
		const fullPath = relativePath.startsWith('escritura/') ? `${store.activeFolderPath}/${relativePath}` : relativePath;
		const file = plugin.app.vault.getAbstractFileByPath(fullPath);
		if (!(file instanceof TFile)) return;
		const raw = await plugin.app.vault.read(file);
		const match = raw.match(/^---\s*[\s\S]*?---/);
		const yamlValue = memory.trim() ? `memoryContent: |-\n${memory.split('\n').map(line => `  ${line}`).join('\n')}` : 'memoryContent: ""';
		if (!match) { await plugin.app.vault.modify(file, `---\n${yamlValue}\n---\n\n${raw}`); return; }
		const body = match[0].replace(/^---\s*/, '').replace(/---\s*$/, '');
		const lines = body.split('\n');
		const kept: string[] = [];
		for (let i = 0; i < lines.length; i++) {
			if (/^\s*memoryContent\s*:/.test(lines[i])) { while (i + 1 < lines.length && /^\s{2,}/.test(lines[i + 1])) i++; continue; }
			kept.push(lines[i]);
		}
		const nextFrontmatter = `---\n${kept.join('\n').replace(/\n+$/, '')}\n${yamlValue}\n---`;
		await plugin.app.vault.modify(file, raw.replace(match[0], nextFrontmatter));
	}

	async function createAllManuscripts(targetFolder: string) {
		if (!store) return; setBatchBusy(true); setBatchStatus('Creando archivos...');
		try { const chapters = orderedChapters(); for (let i = 0; i < chapters.length; i++) { if (!chapters[i].archivo) await ensureCapituloArchivo(chapters[i].id_capitulo, targetFolder); setBatchStatus(`Creando archivos: ${i + 1}/${chapters.length}`); } setBatchStatus(`Listo: ${chapters.length} manuscritos preparados.`); }
		catch (e: any) { setBatchStatus('Error: ' + (e?.message ?? String(e))); } finally { setBatchBusy(false); }
	}

	async function generateDrafts() {
		if (!store) return; const settings = plugin.settings.data; if (!settings.proveedor.modelo) { alert('Configura un modelo en Settings.'); return; }
		if (!confirm('Se generarán drafts solamente para capítulos sin contenido. ¿Continuar?')) return;
		setBatchBusy(true); let history = ''; const summaries: string[] = [];
		try {
			const api = new ApiFactory().createApi(settings.proveedor.id, settings.apiToken[settings.proveedor.id] ?? ''); const chapters = orderedChapters();
			const draftSettings = { ...settings, memoryContent: settings.memoryContent.replace(/\n?\[Novel Writer AI - Generated Story Context\][\s\S]*?\[End Novel Writer AI - Generated Story Context\]\n?/g, '').trim() };
			for (let i = 0; i < chapters.length; i++) {
				const c = chapters[i]; setBatchStatus(`Generando draft: ${i + 1}/${chapters.length} — ${c.nombre}`); await ensureCapituloArchivo(c.id_capitulo);
				const existing = await readCapituloTexto(c.id_capitulo);
				if (existing.trim()) { const previous = `Capítulo ${c.nombre}: ${makeContextExcerpt(existing)}`; if (!history.includes(previous) && !isCorruptGeneration(existing)) { history += `\n\n${previous}`; summaries.push(previous); } continue; }
				let text = ''; let attempts = 0;
				while (attempts++ < 12 && text.trim().split(/\s+/).filter(Boolean).length < targetWords * 0.95) {
					const currentWords = text.trim().split(/\s+/).filter(Boolean).length;
					const remainingWords = Math.max(100, targetWords - currentWords);
					const prompt = `${await buildScenePrompt(plugin.app, store.activeFolderPath!, draftSettings, c.outline ?? '', text, '', targetWords)}\n\n[Control de extensión]\nEl draft actual tiene ${currentWords} palabras y el objetivo es ${targetWords}. ${currentWords === 0 ? 'Escribe el capítulo completo.' : `Faltan aproximadamente ${remainingWords} palabras. Continúa exactamente desde el final del draft.`} ${currentWords >= targetWords * 0.8 ? 'Estás cerca del objetivo: resuelve la trama y termina el capítulo en esta respuesta; no agregues otra introducción.' : 'Todavía no cierres prematuramente el capítulo.'}`;
					const requestTokens = Math.max(512, Math.min(Math.ceil(remainingWords * 1.5) + 200, 8192));
					const result = await requestDraftCompletion(api, prompt, settings.proveedor.modelo, requestTokens, settings.aiOptions.temperature, settings.aiOptions.topP);
					const addition = result.text ?? ''; if (!addition.trim()) break; if (isCorruptGeneration(addition)) { setBatchStatus(`La IA devolvió una respuesta inválida para ${c.nombre}; se detuvo el capítulo.`); break; } text += `${text ? '\n\n' : ''}${addition}`;
				}
				if (text.trim() && !isCorruptGeneration(text)) { await writeCapituloTexto(c.id_capitulo, text); const summary = `Capítulo ${c.nombre}: ${makeContextExcerpt(text)}`; summaries.push(summary); history += `\n\n${summary}`; }
			}
			await saveGeneratedContext(settings.memoryContent, summaries); setBatchStatus(`Listo: ${summaries.length} drafts generados.`);
		} catch (e: any) { setBatchStatus('Error: ' + (e?.message ?? String(e))); } finally { setBatchBusy(false); }
	}

	async function generateSingleDraft(chapter: any) {
		if (!store) return; const existing = await readCapituloTexto(chapter.id_capitulo);
		if (existing.trim() && !confirm(`El capítulo "${chapter.nombre}" ya tiene contenido. Se borrará y se generará un draft desde cero. ¿Continuar?`)) return;
		const settings = plugin.settings.data; if (!settings.proveedor.modelo) { alert('Configura un modelo en Settings.'); return; }
		setBatchBusy(true); setBatchStatus(`Generando draft: ${chapter.nombre}`);
		try {
			const chapters = orderedChapters(); const historyParts: string[] = [];
			for (const c of chapters) { if (c.id_capitulo === chapter.id_capitulo) break; const text = await readCapituloTexto(c.id_capitulo); if (text.trim()) historyParts.push(`Capítulo ${c.nombre}: ${text.replace(/\s+/g, ' ').slice(0, 700)}`); }
			const history = historyParts.join('\n\n'); const draftSettings = { ...settings, memoryContent: settings.memoryContent.replace(/\n?\[Novel Writer AI - Generated Story Context\][\s\S]*?\[End Novel Writer AI - Generated Story Context\]\n?/g, '').trim() }; const api = new ApiFactory().createApi(settings.proveedor.id, settings.apiToken[settings.proveedor.id] ?? '');
			let text = ''; let attempts = 0;
			while (attempts++ < 12 && text.trim().split(/\s+/).filter(Boolean).length < targetWords * 0.95) {
				const currentWords = text.trim().split(/\s+/).filter(Boolean).length; const remainingWords = Math.max(100, targetWords - currentWords);
				const prompt = `${await buildScenePrompt(plugin.app, store.activeFolderPath!, draftSettings, chapter.outline ?? '', text, '', targetWords)}\n\n[Control de extensión]\nEl draft actual tiene ${currentWords} palabras y el objetivo es ${targetWords}. Faltan aproximadamente ${remainingWords} palabras. ${currentWords >= targetWords * 0.8 ? 'Cierra la trama en esta respuesta.' : 'Continúa desarrollando el capítulo sin reiniciarlo.'}`;
				const result = await requestDraftCompletion(api, prompt, settings.proveedor.modelo, Math.max(512, Math.min(Math.ceil(remainingWords * 1.5) + 200, 8192)), settings.aiOptions.temperature, settings.aiOptions.topP); const addition = result.text ?? ''; if (!addition.trim()) break; if (isCorruptGeneration(addition)) { setBatchStatus(`La IA devolvió una respuesta inválida para ${chapter.nombre}; se detuvo el capítulo.`); break; } text += `${text ? '\n\n' : ''}${addition}`;
			}
			await ensureCapituloArchivo(chapter.id_capitulo); await writeCapituloTexto(chapter.id_capitulo, text); await refreshGeneratedContext(); setBatchStatus(`Draft listo: ${chapter.nombre}`);
		} catch (e: any) { setBatchStatus('Error: ' + (e?.message ?? String(e))); } finally { setBatchBusy(false); }
	}

	async function refreshGeneratedContext() {
		const summaries: string[] = []; for (const c of orderedChapters()) { const text = await readCapituloTexto(c.id_capitulo); if (text.trim() && !isCorruptGeneration(text)) summaries.push(`Capítulo ${c.nombre}: ${makeContextExcerpt(text)}`); }
		await saveGeneratedContext(plugin.settings.data.memoryContent, summaries);
	}

	async function saveGeneratedContext(memory: string, summaries: string[]) {
		if (summaries.length === 0) return; const start = '[Novel Writer AI - Generated Story Context]'; const end = '[End Novel Writer AI - Generated Story Context]'; const manual = cleanManualMemory(memory.replace(new RegExp(`\\n?${start}[\\s\\S]*?${end}\\n?`, 'g'), '').trim());
		plugin.settings.data.memoryContent = `${manual}${manual ? '\n\n' : ''}${start}\n${summaries.join('\n\n')}\n${end}`; await plugin.settings.save();
	}

	function makeContextExcerpt(text: string): string {
		const clean = text.replace(/\s+/g, ' ').trim(); if (clean.length <= 700) return clean;
		const boundary = clean.slice(0, 700).lastIndexOf('. '); return `${clean.slice(0, boundary > 250 ? boundary + 1 : 700).trim()} …`;
	}

	function isCorruptGeneration(text: string): boolean {
		const compact = text.replace(/\s+/g, ' ').trim(); if (!compact) return false;
		const suspiciousToken = compact.split(' ').some(token => token.length > 140 && ((token.match(/[#:]/g)?.length ?? 0) > 4 || (token.match(/[\uFFFD]/g)?.length ?? 0) > 0));
		const replacementChars = (compact.match(/[\uFFFD]/g) ?? []).length;
		return suspiciousToken || replacementChars > 3 || /(?:#u-hc|pí\d+Lm|u#u-hc)/i.test(compact);
	}

	function cleanManualMemory(memory: string): string {
		return memory.split(/\n\s*\n/).filter(paragraph => !isCorruptGeneration(paragraph)).join('\n\n').trim();
	}

	function openChapter(path: string) { const fullPath = path.startsWith('escritura/') ? `${store?.activeFolderPath ?? ''}/${path}` : path; void plugin.app.workspace.openLinkText(fullPath, '', false); }
}

class ChapterFileModal extends FuzzySuggestModal<TFile> {
	constructor(app: any, private onPick: (file: TFile) => void) { super(app); }
	getItems() { return this.app.vault.getMarkdownFiles(); }
	getItemText(file: TFile) { return file.path; }
	onChooseItem(file: TFile) { this.onPick(file); }
}

class FolderPickerModal extends FuzzySuggestModal<TFolder> {
	constructor(app: any, private onPick: (folder: TFolder) => void) { super(app); }
	getItems() { return this.app.vault.getAllLoadedFiles().filter((file: any): file is TFolder => file instanceof TFolder); }
	getItemText(folder: TFolder) { return folder.path || '/'; }
	onChooseItem(folder: TFolder) { this.onPick(folder); }
}

async function requestDraftCompletion(api: any, prompt: string, model: string, maxTokens: number, temperature: number, topP?: number): Promise<{ text?: string }> {
	try {
		return await api.generateCompletion(prompt, model, { max_tokens: maxTokens, temperature, top_p: topP, stream: false });
	} catch (error: any) {
		const message = String(error?.message ?? error).toLowerCase();
		if (!message.includes('internal server') && !message.includes('max_tokens') && !message.includes('context')) throw error;
		// Some providers reject large output budgets even when the model advertises them.
		// Retry with conservative budgets; the caller can request another continuation.
		for (const fallback of [2048, 1024, 512]) {
			if (fallback >= maxTokens) continue;
			try { return await api.generateCompletion(prompt, model, { max_tokens: fallback, temperature, top_p: topP, stream: false }); } catch { /* try next provider-safe budget */ }
		}
		throw error;
	}
}
