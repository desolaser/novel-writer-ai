import { App } from 'obsidian';
import * as yaml from 'js-yaml';
import { EntradaCodex, AiContextPolicy } from '../domain';
import { listEntries } from '../infrastructure/storage/repos/CodexEntryRepo';
import { listCategorias } from '../infrastructure/storage/repos/CategoriaRepo';
import { PluginSettings } from '../infrastructure/settings/plugin-settings';

export function estimateTokens(text: string): number { return Math.ceil((text || '').length / 4); }

export async function buildCodexYaml(app: App, folderPath: string, out?: EntradaCodex[]): Promise<string> {
	const entries = out ?? await listEntries(app, folderPath);
	const cats = await listCategorias(app, folderPath);
	const catMap = new Map(cats.map(c => [c.id_categoria, c.nombre]));
	const items: any[] = [];
	for (const e of entries) {
		if (e.archivado || e.ai_context_policy === AiContextPolicy.Never) continue;
		if (e.ai_context_policy === AiContextPolicy.NeverIfDetected) continue;
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
	outline: string, currentText: string,
): Promise<string> {
	const codexYaml = await buildCodexYaml(app, folderPath);
	const parts: string[] = [];
	parts.push("--- Codex ---");
	parts.push(codexYaml || "(vacio)");
	parts.push("--- End Codex ---");
	if (settings.memoryContent) parts.push("Memoria: " + settings.memoryContent);
	if (settings.authorNote) parts.push("Author note: " + settings.authorNote);
	if (outline) parts.push("Outline de la escena: " + outline);
	if (settings.prefix) parts.push(settings.prefix);
	parts.push("Continua la narracion del manuscrito:");
	parts.push(currentText || "");
	return parts.join("\n\n");
}