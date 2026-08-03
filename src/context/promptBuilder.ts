import { App } from 'obsidian';
import * as yaml from 'js-yaml';
import { EntradaCodex, AiContextPolicy } from '../domain';
import { listEntries } from '../infrastructure/storage/repos/CodexEntryRepo';
import { listCategorias } from '../infrastructure/storage/repos/CategoriaRepo';
import { PluginSettings } from '../infrastructure/settings/plugin-settings';
import { getPromptMetaCascading } from './promptMeta';

export function estimateTokens(text: string): number { return Math.ceil((text || '').length / 4); }

function matchesEntry(text: string, entry: EntradaCodex): boolean {
	const normalize = (value: string) => {
		const withoutAccents = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		return entry.case_sensitive ? withoutAccents : withoutAccents.toLowerCase();
	};
	const normalizedText = normalize(text || '');
	const candidates = [entry.nombre, ...(entry.alias || '').split(',')]
		.map((value) => normalize(value.trim()))
		.filter(Boolean);
	return candidates.some((candidate) => {
		const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, entry.case_sensitive ? '' : 'i').test(normalizedText);
	});
}

export async function buildCodexYaml(
	app: App, folderPath: string, out?: EntradaCodex[], currentText = '', searchRange = 1000,
): Promise<string> {
	const entries = out ?? await listEntries(app, folderPath);
	const cats = await listCategorias(app, folderPath);
	const catMap = new Map(cats.map(c => [c.id_categoria, c.nombre]));
	const recentText = (currentText || '').slice(-Math.max(0, searchRange));
	const items: any[] = [];
	for (const e of entries) {
		if (e.archivado || e.ai_context_policy === AiContextPolicy.Never) continue;
		const detected = e.tracking_por_nombre && matchesEntry(recentText, e);
		if (e.ai_context_policy === AiContextPolicy.OnDetect && !detected) continue;
		if (e.ai_context_policy === AiContextPolicy.NeverIfDetected && detected) continue;
		if (!e.nombre && !e.descripcion) continue;
		const item: any = { nombre: e.nombre };
		if (e.alias) item.alias = e.alias.split(",").map(s => s.trim()).filter(Boolean);
		const cat = catMap.get(e.id_categoria);
		if (cat) item.categoria = cat;
		if (e.descripcion) item.descripcion = e.descripcion;
		if (e.detalles && e.detalles.length) {
			const detalles: Record<string, any> = {};
			for (const d of e.detalles) {
				if (d.valor != null) detalles[d.id_detalle] = d.valor;
			}
			if (Object.keys(detalles).length) item.detalles = detalles;
		}
		items.push(item);
	}
	if (items.length === 0) return "";
	return yaml.dump(items, { lineWidth: 0 });
}

export async function buildScenePrompt(
	app: App, folderPath: string, settings: PluginSettings,
	outline: string, currentText: string, historicalContext = '', targetWords?: number,
): Promise<string> {
 const codexYaml = await buildCodexYaml(app, folderPath, undefined, currentText, settings.codexOptions.searchRange);
	const parts: string[] = [];
	parts.push("--- Codex ---");
	parts.push(codexYaml || "(vacio)");
	parts.push("--- End Codex ---");
	const memory = await getPromptMetaCascading(app, settings, 'memoryContent');
	const authorNote = await getPromptMetaCascading(app, settings, 'authorNote');
	const generatedStart = '[Novel Writer AI - Generated Story Context]';
	const generatedEnd = '[End Novel Writer AI - Generated Story Context]';
	const generatedContext = memory.match(new RegExp(`${generatedStart}[\\s\\S]*?${generatedEnd}`))?.[0] ?? '';
	const manualMemory = memory.replace(new RegExp(`\\n?${generatedStart}[\\s\\S]*?${generatedEnd}\\n?`, 'g'), '').trim();
	if (manualMemory) parts.push("Memoria del autor (instrucciones persistentes): " + manualMemory);
	if (generatedContext) parts.push("Contexto histórico previo (solo continuidad; no es el capítulo actual): " + generatedContext);
	if (authorNote) parts.push("Author note: " + authorNote);
	if (outline) parts.push("Outline de la escena: " + outline);
	if (historicalContext) parts.push("--- Contexto de capítulos anteriores (úsalo solo como continuidad; no lo repitas ni lo trates como el capítulo actual) ---\n" + historicalContext + "\n--- Fin del contexto anterior ---");
	if (targetWords) parts.push(currentText ? `Continúa este draft y, cuando te acerques al objetivo, resuelve el conflicto y escribe un cierre natural. No reinicies ni repitas el texto ya escrito.` : `Escribe un capítulo nuevo e independiente de aproximadamente ${targetWords} palabras. Desarrolla el outline actual, alcanza una extensión cercana al objetivo y reserva espacio para cerrar el capítulo. No copies el contexto anterior.`);
	if (settings.prefix) parts.push(settings.prefix);
	parts.push(currentText ? "Continua la narracion del manuscrito:" : "Comienza el capítulo nuevo:");
	parts.push(currentText || "");
	return parts.join("\n\n");
}
