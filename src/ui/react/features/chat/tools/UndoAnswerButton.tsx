import { useState } from 'react';
import { Notice } from 'obsidian';
import type NovelWriterPlugin from '../../../../../../main';
import type { ChatSession } from '../session/ChatSession';
import { confirmDialog } from '../../../../modals/ConfirmModal';
import { useNovelWriter } from '../../../store/novelWriterStore';
import { Icon } from '../../../components/Icon';

export interface UndoAnswerButtonProps {
	plugin: NovelWriterPlugin;
	session: ChatSession;
	messageId: string;
	disabled: boolean;
}

function reportUndo(reverted: number, conflicts: string[]): string {
	const done = `Undid ${reverted} ${reverted === 1 ? 'file' : 'files'}.`;
	if (!conflicts.length) return done;
	const names = conflicts.map((path) => path.split('/').pop()).join(', ');
	return `${done} Left as they are, because they changed again since: ${names}.`;
}

/**
 * Takes back every change an answer of the AI made to the novel. Shown while
 * Obsidian stays open after the answer; files edited again since are kept.
 */
export function UndoAnswerButton({ plugin, session, messageId, disabled }: UndoAnswerButtonProps) {
	const [working, setWorking] = useState(false);

	const undo = async () => {
		const proceed = await confirmDialog(
			plugin.app,
			'Undo every change this answer made to the novel? Files you edited '
				+ 'after it are left as they are. The chat messages stay.',
		);
		if (!proceed) return;
		setWorking(true);
		try {
			const result = await session.undo(messageId);
			if (!result) {
				new Notice('There is nothing left to undo for this answer.');
				return;
			}
			await useNovelWriter.getState().reloadAll();
			new Notice(reportUndo(result.reverted, result.conflicts));
		} catch (error: any) {
			new Notice(`Could not undo: ${error?.message ?? String(error)}`);
		} finally {
			setWorking(false);
		}
	};

	return (
		<button
			className="nw-msg-action-btn"
			title="Undo the changes of this answer"
			disabled={disabled || working}
			onClick={() => void undo()}
		>
			<Icon.Back width={13} height={13} />
		</button>
	);
}
