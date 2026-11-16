import { App } from 'obsidian';
import type { DraftLength } from '../utils/draftLength';
import * as yaml from 'js-yaml';
import { EntradaCodex, AiContextPolicy, TipoDetalle } from '../domain';
import { listEntries } from '../infrastructure/storage/repos/CodexEntryRepo';
import { listCategorias } from '../infrastructure/storage/repos/CategoriaRepo';
import { listDetalles, listOpcionesByDetalle } from '../infrastructure/storage/repos/DetalleRepo';
import { PluginSettings } from '../infrastructure/settings/plugin-settings';
import { getPromptMetaCascading } from './promptMeta';
import { readBlueprint } from '../infrastructure/storage/repos/BlueprintRepo';
import { buildStoryBibleBlock } from './blueprintPrompt';
import {
	renderTemplateWithBlocks, type ResolvedTemplateBlock,
} from './promptTemplates';

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

interface CodexFormattingMaps {
	catMap: Map<string, string>;
	detalleNameMap: Map<string, string>;
	detalleTypeMap: Map<string, TipoDetalle>;
	detalleOptionsMap: Map<string, Map<string, string>>;
	entryNameMap: Map<string, string>;
}

async function buildCodexFormattingMaps(app: App, folderPath: string, entries: EntradaCodex[]): Promise<CodexFormattingMaps> {
	const cats = await listCategorias(app, folderPath);
	const catMap = new Map(cats.map(c => [c.id_categoria, c.nombre]));
	// Load detail definitions: id → { name, type }
	const detallesDefs = await listDetalles(app, folderPath);
	const detalleOptionsMap = new Map<string, Map<string, string>>();
	for (const detalle of detallesDefs) {
		if (detalle.tipo_detalle === TipoDetalle.Dropdown) {
			const options = await listOpcionesByDetalle(app, folderPath, detalle.id_detalle);

			const optionsMap = new Map();
			if (options.length > 0) {
				options.forEach(option => {
					optionsMap.set(option.id_opcion_detalle, option.nombre);
				});
			}
			detalleOptionsMap.set(detalle.id_detalle, optionsMap);
		}
	}
	const detalleNameMap = new Map(detallesDefs.map(d => [d.id_detalle, d.nombre]));
	const detalleTypeMap = new Map(detallesDefs.map(d => [d.id_detalle, d.tipo_detalle]));
	// Build entry name lookup for resolving CodexRef values
	const entryNameMap = new Map(entries.map(e => [e.id_entrada_codex, e.nombre]));
	return { catMap, detalleNameMap, detalleTypeMap, detalleOptionsMap, entryNameMap };
}

/** Formats one codex entry (name, alias, category, description, custom details) into a plain object ready for `yaml.dump`. */
function formatCodexEntryItem(e: EntradaCodex, maps: CodexFormattingMaps): any {
	const item: any = { nombre: e.nombre };
	if (e.alias) item.alias = e.alias.split(",").map(s => s.trim()).filter(Boolean);
	const cat = maps.catMap.get(e.id_categoria);
	if (cat) item.categoria = cat;
	if (e.descripcion) item.descripcion = e.descripcion;
	if (e.detalles && e.detalles.length) {
		const detalles: Record<string, any> = {};
		for (const d of e.detalles) {
			if (d.valor != null) {
				const key = maps.detalleNameMap.get(d.id_detalle) || d.id_detalle;
				// For CodexRef details, resolve the UUID to the entry name
				const detailType = maps.detalleTypeMap.get(d.id_detalle);
				let value = d.valor;
				if (detailType === TipoDetalle.CodexRef) {
					value = maps.entryNameMap.get(d.valor as string) || d.valor;
				} else if (detailType === TipoDetalle.Dropdown) {
					value = maps.detalleOptionsMap.get(d.id_detalle)?.get(d.valor as string) || d.valor;
				}
				detalles[key] = value;
			}
		}
		if (Object.keys(detalles).length) item.detalles = detalles;
	}
	return item;
}

export async function buildCodexYaml(
	app: App, folderPath: string, out?: EntradaCodex[], currentText = '', searchRange = 1000,
): Promise<string> {
	const entries = out ?? await listEntries(app, folderPath);
	const maps = await buildCodexFormattingMaps(app, folderPath, entries);
	const recentText = (currentText || '').slice(-Math.max(0, searchRange));
	const items: any[] = [];
	for (const e of entries) {
		if (e.archivado || e.ai_context_policy === AiContextPolicy.Never) continue;
		const detected = e.tracking_por_nombre && matchesEntry(recentText, e);
		if (e.ai_context_policy === AiContextPolicy.OnDetect && !detected) continue;
		if (e.ai_context_policy === AiContextPolicy.NeverIfDetected && detected) continue;
		if (!e.nombre && !e.descripcion) continue;
		items.push(formatCodexEntryItem(e, maps));
	}
	if (items.length === 0) return "";
	return yaml.dump(items, { lineWidth: 0 });
}

/**
 * Same full formatting as `buildCodexYaml` (name, alias, category, description, custom
 * details with resolved dropdown/CodexRef values), for one entry picked explicitly by
 * the author — e.g. added to a chat's context. The AI context policy only governs
 * automatic inclusion, so it is not applied here.
 */
export async function buildCodexEntryYaml(app: App, folderPath: string, entry: EntradaCodex): Promise<string> {
	const entries = await listEntries(app, folderPath);
	const maps = await buildCodexFormattingMaps(app, folderPath, entries);
	return yaml.dump(formatCodexEntryItem(entry, maps), { lineWidth: 0 });
}

/** Memory and author note of the chapter a draft is for. */
export interface ScenePromptMeta {
	memory: string;
	authorNote: string;
}

/**
 * Length rule of a draft request. Models overshoot "approximately N words", so
 * it gives the accepted range, the point to aim at and the maximum as a ceiling,
 * and asks for a complete ending inside it.
 */
export function draftLengthRule(length: DraftLength, continuing: boolean): string {
	const rule = `The whole chapter must be between ${length.min} and ${length.max} words: `
		+ `aim for about ${length.target} and never go over ${length.max}. Pace the scenes `
		+ 'to fit: skip what the outline does not need rather than cutting the ending short. '
		+ 'End with the final scene complete, never mid-sentence.';
	return continuing
		? `Continue this draft without restarting or repeating it. ${rule}`
		: `Write a new, independent chapter that develops the outline. Do not copy the previous context. ${rule}`;
}

/**
 * Builds the autocomplete / draft prompt. The history of previous chapters is not
 * a parameter: it reaches the model through the memory block, written into the
 * chapter's own frontmatter by the outline view, so there is exactly one channel
 * for it and the author can read what was sent.
 *
 * `meta` is that chapter's memory and author note. Without it they come from
 * the note open in the editor, which is only right for the autocomplete.
 */
export async function buildScenePrompt(
	app: App, folderPath: string, settings: PluginSettings,
	outline: string, currentText: string, length?: DraftLength,
	meta?: ScenePromptMeta,
): Promise<string> {
	// Callers may provide the raw Markdown note. Frontmatter is metadata and
	// must never be sent as story context to the model.
	const storyText = (currentText || '').replace(/^---\s*[\s\S]*?---\s*/, '');
	// Entries are detected in the outline too: a chapter not written yet still
	// needs the places and people it is about.
	const range = settings.codexOptions.searchRange;
	const recentText = storyText.slice(-Math.max(0, range));
	const detectionText = outline ? `${outline}\n\n${recentText}` : recentText;
	const codexYaml = await buildCodexYaml(app, folderPath, undefined, detectionText, detectionText.length);
	const parts: string[] = [];
	parts.push("--- Codex ---");
	parts.push(codexYaml || "(empty)");
	parts.push("--- End Codex ---");
	// Story bible: what the novel is, and above all the language it is written
	// in. These instructions are in English whatever the story's language is.
	const storyBible = buildStoryBibleBlock(await readBlueprint(app, folderPath));
	if (storyBible) parts.push(storyBible);
	const memory = meta?.memory ?? await getPromptMetaCascading(app, settings, 'memoryContent');
	const authorNote = meta?.authorNote ?? await getPromptMetaCascading(app, settings, 'authorNote');
	if (memory.trim()) parts.push("Memory content: " + memory.trim());
	if (authorNote.trim()) parts.push("Author note: " + authorNote.trim());
	if (outline) {
		parts.push("Chapter outline: " + outline);
		if (storyText) {
			parts.push("The outline describes what should happen in this chapter. Some of it may already be written in the manuscript above. Do not repeat what is already written — identify where the manuscript left off relative to the outline and continue from that point forward.");
		}
	}
	if (length) parts.push(draftLengthRule(length, Boolean(storyText)));
	const defaultTextPromptId = settings.defaultTextPromptId;
	const defaultTextPrompt = defaultTextPromptId
		? settings.customPrompts?.find(p => p.id_prompt === defaultTextPromptId)
		: settings.customPrompts?.find(p => p.tipo === 'text');
	const textPromptContent = defaultTextPrompt?.texto ?? settings.prefix;
	if (textPromptContent) parts.push(textPromptContent);
	parts.push(storyText ? "Continue the manuscript narration:" : "Begin the new chapter:");
	parts.push(storyText);
	return parts.join("\n\n");
}

/** Builds only the Markdown editor's generate-at-cursor request. */
export async function buildEditorPrompt(
	app: App, folderPath: string, settings: PluginSettings,
	outline: string, currentText: string,
): Promise<string> {
	const result = await buildEditorPromptDetails(
		app, folderPath, settings, outline, currentText,
	);
	return result.prompt;
}

export async function buildEditorPromptDetails(
	app: App, folderPath: string, settings: PluginSettings,
	outline: string, currentText: string,
): Promise<{ prompt: string; blocks: ResolvedTemplateBlock[] }> {
	const manuscript = (currentText || '').replace(/^---\s*[\s\S]*?---\s*/, '');
	const codex = await buildCodexYaml(
		app, folderPath, undefined, manuscript,
		settings.codexOptions.searchRange,
	);
	const storyBible = buildStoryBibleBlock(await readBlueprint(app, folderPath));
	const memory = await getPromptMetaCascading(app, settings, 'memoryContent');
	const authorNote = await getPromptMetaCascading(app, settings, 'authorNote');
	const id = settings.defaultTextPromptId;
	const selected = settings.customPrompts?.find(prompt => {
		return prompt.id_prompt === id && prompt.tipo === 'text';
	}) ?? settings.customPrompts?.find(prompt => prompt.tipo === 'text');
	const outlineBlock = outline.trim()
		? `Chapter outline: ${outline.trim()}`
		: '';
	const blocks = {
		instructions: selected?.texto ?? settings.prefix,
		codex: `--- Codex ---\n${codex || '(empty)'}\n--- End Codex ---`,
		story_bible: storyBible,
		memory: memory.trim() ? `Memory content: ${memory.trim()}` : '',
		author_note: authorNote.trim()
			? `Author note: ${authorNote.trim()}` : '',
		chapter_outline: outlineBlock,
		manuscript: manuscript
			? manuscript
			: 'Begin the new chapter:',
	};
	return renderTemplateWithBlocks('text', selected?.plantilla, blocks);
}
