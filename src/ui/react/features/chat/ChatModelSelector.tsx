import { useState } from 'react';
import { Notice } from 'obsidian';
import type { Modelo } from '../../../../domain/entities/Modelo';
import type { SettingsService } from '../../../../infrastructure/settings/settings-service';
import { ModelRepository } from '../../../../infrastructure/settings/model-repository';
import { Icon } from '../../components/Icon';
import { useChatModel } from './hooks/useChatModel';

function ModelCapabilities({ model }: { model?: Modelo }) {
	return <>
		{model?.supports_image_generation && (
			<Icon.Paintbrush width={14} height={14}
				className="nw-model-image-capability" />
		)}
		{model?.supports_vision && (
			<Icon.Eye width={14} height={14}
				className="nw-model-image-capability" />
		)}
	</>;
}

export function ChatModelSelector({ settings }: { settings: SettingsService }) {
	const [open, setOpen] = useState(false);
	const { profile, error } = useChatModel(settings);
	const selected = settings.data.modelAssignments.chat;
	const select = async (id: string) => {
		try {
			await new ModelRepository(settings).setForPurpose('chat', id);
			setOpen(false);
		} catch (failure) {
			new Notice(`Could not change the chat model: ${String(failure)}`);
		}
	};
	return (
		<div className="nw-chat-model-selector">
			<span className="nw-chat-model-label" role="button" tabIndex={0}
				aria-expanded={open} title={error || 'Change the chat model'}
				onClick={() => setOpen(!open)}
				onKeyDown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						event.preventDefault();
						setOpen(!open);
					}
				}}>
				{error ? 'Missing chat model' : profile?.nombre_listado
					?? 'No active model'}
				<ModelCapabilities model={profile} />
				<Icon.ChevronDown width={14} height={14}
					className={open ? 'nw-chat-model-chevron-open'
						: 'nw-chat-model-chevron-closed'} />
			</span>
			{open && (
				<div className="nw-chat-model-dropdown">
					<button className="nw-context-row" aria-pressed={!selected}
						onClick={() => void select('')}>
						Use default model
					</button>
					{settings.data.modelos.map((model) => (
						<button key={model.id_modelo} className="nw-context-row"
							aria-pressed={selected === model.id_modelo}
							onClick={() => void select(model.id_modelo)}>
							{model.nombre_listado}
							<ModelCapabilities model={model} />
						</button>
					))}
					{!settings.data.modelos.length && <span>No models created.</span>}
				</div>
			)}
		</div>
	);
}
