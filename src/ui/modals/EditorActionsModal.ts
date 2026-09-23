import { App, Modal, Notice, Setting } from 'obsidian';
import type NovelWriterPlugin from '../../../main';
import type { EditorAction } from '../../types/EditorAction';
import { EditorActionRepository, validateEditorAction } from
	'../../infrastructure/settings/editor-action-repository';

const NEW_ACTION: Omit<EditorAction, 'id'> = {
	name: '',
	placement: 'both',
	instruction: '',
	input: 'selection',
	output: 'replace-input',
	menuGroup: '',
};

export class EditorActionsModal extends Modal {
	private readonly actions: EditorActionRepository;

	constructor(app: App, plugin: NovelWriterPlugin) {
		super(app);
		this.actions = new EditorActionRepository(plugin.settings);
		this.modalEl.addClass('nw-editor-actions-modal');
	}

	onOpen(): void {
		this.renderList();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private renderList(): void {
		this.contentEl.empty();
		this.contentEl.createEl('h2', { text: 'Editor actions' });
		this.contentEl.createEl('p', {
			text: 'Create AI actions for Markdown text. Generate text is '
				+ 'configured separately through Custom Prompts.',
			cls: 'setting-item-description',
		});
		for (const action of this.actions.list()) {
			new Setting(this.contentEl)
				.setName(action.name)
				.setDesc(this.placementLabel(action.placement))
				.addButton(button => button
					.setButtonText('Edit')
					.onClick(() => this.renderForm(action)))
				.addButton(button => button
					.setIcon('trash')
					.setTooltip('Delete')
					.onClick(async () => {
						if (!confirm(`Delete "${action.name}"?`)) return;
						await this.actions.remove(action.id);
						this.renderList();
					}));
		}
		new Setting(this.contentEl)
			.addButton(button => button
					.setButtonText('New action')
					.setCta()
					.onClick(() => this.renderForm()));
	}

	private renderForm(existing?: EditorAction): void {
		this.contentEl.empty();
		this.contentEl.createEl('h2', {
			text: existing ? 'Edit editor action' : 'New editor action',
		});
		const draft: EditorAction = {
			...NEW_ACTION,
			...existing,
			id: existing?.id ?? '',
		};
		new Setting(this.contentEl)
			.setName('Name')
			.addText(text => text
				.setPlaceholder('Summarize')
				.setValue(draft.name)
				.onChange(value => { draft.name = value; }));
		new Setting(this.contentEl)
			.setName('Location')
			.setDesc('Where this action appears.')
			.addDropdown(dropdown => dropdown
				.addOption('command', 'Command palette')
				.addOption('context-menu', 'Context menu')
				.addOption('both', 'Both')
				.setValue(draft.placement)
				.onChange(value => {
					draft.placement = value as EditorAction['placement'];
				}));
		new Setting(this.contentEl)
			.setName('Input')
			.addDropdown(dropdown => dropdown
				.addOption('selection', 'Selected text')
				.addOption('selection-or-note', 'Selection or full note')
				.addOption('before-cursor', 'Text before cursor')
				.setValue(draft.input)
				.onChange(value => {
					draft.input = value as EditorAction['input'];
				}));
		new Setting(this.contentEl)
			.setName('Result')
			.addDropdown(dropdown => dropdown
				.addOption('replace-input', 'Replace input')
				.addOption('insert-at-cursor', 'Insert at cursor')
				.setValue(draft.output)
				.onChange(value => {
					draft.output = value as EditorAction['output'];
				}));
		new Setting(this.contentEl)
			.setName('Context menu group')
			.setDesc('Optional submenu title, such as "Translate to".')
			.addText(text => text
				.setValue(draft.menuGroup ?? '')
				.onChange(value => { draft.menuGroup = value; }));
		const instructionField = this.contentEl.createDiv(
			'nw-editor-action-instructions'
		);
		const label = instructionField.createEl('label', {
			text: 'Instructions',
		});
		label.htmlFor = 'nw-editor-action-instructions';
		const area = instructionField.createEl('textarea', {
			attr: {
				id: 'nw-editor-action-instructions',
				'aria-describedby': 'nw-editor-action-help',
			},
		});
		area.value = draft.instruction;
		area.oninput = () => { draft.instruction = area.value; };
		area.addEventListener('keydown', event => event.stopPropagation());
		area.addEventListener('keyup', event => event.stopPropagation());
		instructionField.createEl('p', {
			text: 'Available: {{input}}, {{selection}}, {{note}}, '
				+ '{{before_cursor}}, {{memory}}, {{author_note}}, '
				+ '{{chapter_outline}}, {{codex}}, {{story_bible}}. '
				+ 'Input is appended if no text marker is present.',
			attr: { id: 'nw-editor-action-help' },
		});
		new Setting(this.contentEl)
			.addButton(button => button
				.setButtonText('Save')
				.setCta()
				.onClick(async () => {
					const error = validateEditorAction(draft);
					if (error) {
						new Notice(error);
						return;
					}
					try {
						if (existing) await this.actions.update(draft);
						else await this.actions.create(draft);
						this.renderList();
					} catch (failure) {
						new Notice(String(failure));
					}
				}))
			.addButton(button => button
				.setButtonText('Cancel')
				.onClick(() => this.renderList()));
	}

	private placementLabel(placement: EditorAction['placement']): string {
		if (placement === 'command') return 'Command palette';
		if (placement === 'context-menu') return 'Context menu';
		return 'Command palette and context menu';
	}
}
