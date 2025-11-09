import { App, Modal, TextAreaComponent } from 'obsidian';
import type WriterAIPlugin from '../../main';

export default class MemoryModal extends Modal {
  private memoryTextarea: TextAreaComponent;
  private plugin: WriterAIPlugin;

  constructor(app: App, plugin: WriterAIPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    
    modalEl.addClass('context-modal-large');    
    contentEl.empty();    
    contentEl.createEl('h4', { text: 'Memory' });
    contentEl.createEl('p', { text: 'The AI will better remember info placed here.' });
    const memoryLabel = contentEl.createDiv('textarea-label');
    memoryLabel.createSpan({ text: 'Memory content: ' });
    const memoryTokens = memoryLabel.createSpan({ text: '0 tokens', cls: 'token-count' });

    const memorySection = contentEl.createDiv('options-section');
    const memoryWrapper = memorySection.createDiv('textarea-wrapper');
    
    this.memoryTextarea = new TextAreaComponent(memoryWrapper);
    this.memoryTextarea.setPlaceholder('Enter memory information...');
    this.memoryTextarea.inputEl.rows = 38;
    this.memoryTextarea.setValue(this.plugin.settings.memoryContent);
    this.memoryTextarea.onChange(async (value) => {
        const tokenCount = this.plugin.estimateTokens(value);
        memoryTokens.setText(`${tokenCount} tokens`);
        this.plugin.settings.memoryContent = value;
        await this.plugin.saveSettings();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}