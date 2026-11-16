import { useEffect, useState } from 'react';
import type NovelWriterPlugin from '../../../../../main';
import type { PromptMetaKey } from '../../../../types/PromptMeta';
import { estimateTokens } from '../../../../context/promptBuilder';
import {
	readNovelPromptMeta,
	writeNovelPromptMeta,
} from '../../../../infrastructure/storage/repos/NovelConfigRepo';
import { AutoSaveTextarea } from '../../components/AutoSaveTextarea';
import { useNovelWriter } from '../../store/novelWriterStore';

const FIELDS: Array<[PromptMetaKey, string, string]> = [
	['memoryContent', 'Novel memory', 'Facts every chapter of this novel should remember.'],
	['authorNote', 'Novel author\'s note', 'Style guidance for every chapter of this novel.'],
];

/**
 * Memory and author note of the whole novel, kept in its `__config.json`. A
 * chapter's own values win over these, and these win over the global ones in
 * Settings. The chat's write_memory tool writes here when no chapter is given.
 */
export function NovelMemorySection({ plugin }: { plugin: NovelWriterPlugin }) {
	const folder = useNovelWriter((state) => state.store?.activeFolderPath ?? null);
	const [values, setValues] = useState<Record<PromptMetaKey, string> | null>(null);

	useEffect(() => {
		let cancelled = false;
		setValues(null);
		if (!folder) return;
		void (async () => {
			const memoryContent = await readNovelPromptMeta(plugin.app, folder, 'memoryContent');
			const authorNote = await readNovelPromptMeta(plugin.app, folder, 'authorNote');
			if (!cancelled) {
				setValues({ memoryContent: memoryContent ?? '', authorNote: authorNote ?? '' });
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [plugin, folder]);

	if (!folder || !values) return null;
	return (
		<div className="options-section">
			<h5>This novel</h5>
			<p className="setting-item-description">
				Used by every chapter that has no memory or author's note of its own.
			</p>
			{FIELDS.map(([key, label, placeholder]) => (
				<div key={`${folder}-${key}`} className="textarea-wrapper">
					<div className="textarea-label">
						<span>{label}:</span>
						<span className="token-count">{estimateTokens(values[key])} tokens</span>
					</div>
					<AutoSaveTextarea
						value={values[key]}
						placeholder={placeholder}
						rows={4}
						onSave={async (value) => {
							await writeNovelPromptMeta(plugin.app, folder, key, value);
							setValues((current) => current ? { ...current, [key]: value } : current);
						}}
					/>
				</div>
			))}
		</div>
	);
}
