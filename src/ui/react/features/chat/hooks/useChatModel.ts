import type { SettingsService } from '../../../../../infrastructure/settings/settings-service';
import { getActiveModelProfile } from '../../../../../infrastructure/settings/active-model';
import { useNovelWriter } from '../../../store/novelWriterStore';

/** Keep capabilities and labels in sync with edits made in Settings. */
export function useChatModel(settings: SettingsService) {
	useNovelWriter((state) => state.settingsRevision);
	try {
		return {
			profile: getActiveModelProfile(settings.data, 'chat'),
			error: '',
		};
	} catch (error) {
		return { profile: undefined, error: String(error) };
	}
}
