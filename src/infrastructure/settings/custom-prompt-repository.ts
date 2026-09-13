import type { CustomPrompt } from '../../domain/entities/CustomPrompt';
import type { SettingsService } from './settings-service';
import { createDefaultPrompts } from './plugin-settings';
import { genId } from '../../utils/ids';

/** Storage abstraction for custom chat/text prompts, backed by the plugin settings. */
export class CustomPromptRepository {
	constructor(private readonly settings: SettingsService) {}

	list(): CustomPrompt[] {
		return this.settings.data.customPrompts ?? [];
	}

	get(id: string): CustomPrompt | undefined {
		return this.list().find(p => p.id_prompt === id);
	}

	getDefault(tipo: 'chat' | 'text'): CustomPrompt | undefined {
		const id = tipo === 'chat' ? this.settings.data.defaultChatPromptId : this.settings.data.defaultTextPromptId;
		if (id) {
			const found = this.get(id);
			if (found) return found;
		}
		// Fallback to the first prompt of the type
		return this.list().find(p => p.tipo === tipo);
	}

	async create(tipo: 'chat' | 'text', nombre: string, texto: string): Promise<CustomPrompt> {
		if (!this.settings.data.customPrompts) {
			this.settings.data.customPrompts = createDefaultPrompts();
		}
		const now = new Date().toISOString();
		const prompt: CustomPrompt = { id_prompt: genId(), tipo, nombre, texto, created_at: now, updated_at: now };
		this.settings.data.customPrompts.push(prompt);
		await this.settings.save();
		return prompt;
	}

	async update(id: string, patch: Partial<Pick<CustomPrompt, 'nombre' | 'texto'>>): Promise<void> {
		const prompts = this.settings.data.customPrompts;
		if (!prompts) return;
		const idx = prompts.findIndex(p => p.id_prompt === id);
		if (idx < 0) return;
		prompts[idx] = { ...prompts[idx], ...patch, updated_at: new Date().toISOString() };
		await this.settings.save();
	}

	/** Removes a prompt, unless it is the last one of its type. Returns whether it was removed. */
	async remove(id: string): Promise<boolean> {
		const prompts = this.settings.data.customPrompts;
		if (!prompts) return false;
		const target = prompts.find(p => p.id_prompt === id);
		if (!target) return false;
		const sameType = prompts.filter(p => p.tipo === target.tipo);
		if (sameType.length <= 1) return false;
		this.settings.data.customPrompts = prompts.filter(p => p.id_prompt !== id);
		// If the default was removed, fall back to the first of the same type
		if (target.tipo === 'chat' && this.settings.data.defaultChatPromptId === id) {
			const first = this.settings.data.customPrompts.find(p => p.tipo === 'chat');
			this.settings.data.defaultChatPromptId = first?.id_prompt ?? '';
		}
		if (target.tipo === 'text' && this.settings.data.defaultTextPromptId === id) {
			const first = this.settings.data.customPrompts.find(p => p.tipo === 'text');
			this.settings.data.defaultTextPromptId = first?.id_prompt ?? '';
		}
		await this.settings.save();
		return true;
	}

	async setDefault(tipo: 'chat' | 'text', id: string): Promise<void> {
		if (tipo === 'chat') this.settings.data.defaultChatPromptId = id;
		else this.settings.data.defaultTextPromptId = id;
		await this.settings.save();
	}

	/** Ensures default chat/text prompts exist. Called after loading or migrating settings. */
	ensureDefaults(): void {
		if (!this.settings.data.customPrompts || this.settings.data.customPrompts.length === 0) {
			this.settings.data.customPrompts = createDefaultPrompts();
		}
		const hasChat = this.settings.data.customPrompts.some(p => p.tipo === 'chat');
		const hasText = this.settings.data.customPrompts.some(p => p.tipo === 'text');
		if (!hasChat || !hasText) {
			const defaults = createDefaultPrompts();
			if (!hasChat) {
				const dp = defaults.find(p => p.tipo === 'chat')!;
				if (!this.settings.data.customPrompts.some(p => p.id_prompt === dp.id_prompt)) {
					this.settings.data.customPrompts.push(dp);
				}
			}
			if (!hasText) {
				const dp = defaults.find(p => p.tipo === 'text')!;
				if (!this.settings.data.customPrompts.some(p => p.id_prompt === dp.id_prompt)) {
					this.settings.data.customPrompts.push(dp);
				}
			}
		}
		if (!this.settings.data.defaultChatPromptId) {
			const first = this.settings.data.customPrompts.find(p => p.tipo === 'chat');
			if (first) this.settings.data.defaultChatPromptId = first.id_prompt;
		}
		if (!this.settings.data.defaultTextPromptId) {
			const first = this.settings.data.customPrompts.find(p => p.tipo === 'text');
			if (first) this.settings.data.defaultTextPromptId = first.id_prompt;
		}
	}
}
