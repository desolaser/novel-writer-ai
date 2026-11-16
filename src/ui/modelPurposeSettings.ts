import { Setting } from 'obsidian';
import type { SettingsService } from '../infrastructure/settings/settings-service';
import { ModelRepository } from '../infrastructure/settings/model-repository';
import {
	getActiveModelProfile,
	IMAGE_PROVIDER,
} from '../infrastructure/settings/active-model';
import { getProvider } from '../constants/providers';
import type { ModelPurpose } from '../types/ModelPurpose';

const PURPOSES: Array<[ModelPurpose, string, string]> = [
	['chat', 'Chat model', 'Conversations, roleplay, and chat tools.'],
	['writing', 'Writing model',
		'Editor actions and chapter drafts. Draft output follows the word target.'],
	['utilities', 'Utilities model',
		'Outlines, act summaries, story bible, codex proposals, and chat titles.'],
];

export function renderModelPurposeSettings(
	host: HTMLElement,
	settings: SettingsService
): void {
	const repository = new ModelRepository(settings);
	for (const [purpose, label, description] of PURPOSES) {
		const row = new Setting(host).setName(label);
		const refreshDescription = () => {
			try {
				const profile = getActiveModelProfile(settings.data, purpose);
				const name = profile?.nombre_listado || 'No model configured';
				row.setDesc(`${description} Current: ${name}.`);
			} catch (error) {
				row.setDesc(`${description} ${String(error)}`);
			}
		};
		refreshDescription();
		row.addDropdown((dropdown) => {
			dropdown.addOption('', 'Use default model');
			for (const model of repository.list()) {
				dropdown.addOption(model.id_modelo, model.nombre_listado);
			}
			const selected = settings.data.modelAssignments[purpose];
			if (selected && !repository.get(selected)) {
				dropdown.addOption(selected, 'Missing model — select a replacement');
			}
			dropdown.setValue(selected).onChange(async (id) => {
				await repository.setForPurpose(purpose, id);
				refreshDescription();
			});
		});
	}
	renderImageModelSetting(host, settings);
}

/**
 * The images model: only profiles that can generate images are offered, and
 * "None" turns the portrait tool off instead of falling back to the default.
 */
function renderImageModelSetting(host: HTMLElement, settings: SettingsService): void {
	const repository = new ModelRepository(settings);
	const capable = repository.list().filter((model) =>
		model.supports_image_generation
		&& getProvider(model.id_proveedor)?.nombre === IMAGE_PROVIDER);
	new Setting(host)
		.setName('Images model')
		.setDesc(
			'Draws codex portraits when the chat asks for one (generate_portrait). '
			+ 'Lists OpenRouter models marked 🖌. With None, the chat cannot make portraits.'
		)
		.addDropdown((dropdown) => {
			dropdown.addOption('', 'None');
			for (const model of capable) dropdown.addOption(model.id_modelo, model.nombre_listado);
			const selected = settings.data.imageModelId;
			if (selected && !capable.some((model) => model.id_modelo === selected)) {
				dropdown.addOption(selected, 'Missing model — select a replacement');
			}
			dropdown.setValue(selected).onChange(async (id) => {
				settings.data.imageModelId = id;
				await settings.save();
			});
		});
}
