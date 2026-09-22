import { Setting } from 'obsidian';
import type { SettingsService } from '../infrastructure/settings/settings-service';
import { ModelRepository } from '../infrastructure/settings/model-repository';
import { getActiveModelProfile } from '../infrastructure/settings/active-model';
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
}
