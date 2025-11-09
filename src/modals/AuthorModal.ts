import { App, Modal, TextAreaComponent } from 'obsidian';
import type WriterAIPlugin from '../../main';

export default class AuthorModal extends Modal {
  private authorTextarea: TextAreaComponent;
  private plugin: WriterAIPlugin;

  constructor(app: App, plugin: WriterAIPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    
    modalEl.addClass('context-modal-large');    
    contentEl.empty();    
    contentEl.createEl('h4', { text: "Author's Note" });
    contentEl.createEl('p', { text: 'Info placed here will strongly influence AI output.' });
    const authorLabel = contentEl.createDiv('textarea-label');
    authorLabel.createSpan({ text: "Author's note content: " });
    const authorTokens = authorLabel.createSpan({ text: '0 tokens', cls: 'token-count' });

    const authorSection = contentEl.createDiv('options-section');
    const authorWrapper = authorSection.createDiv('textarea-wrapper');
    
    this.authorTextarea = new TextAreaComponent(authorWrapper);
    this.authorTextarea.setPlaceholder("Enter author's note...");
    this.authorTextarea.inputEl.rows = 38;
    this.authorTextarea.setValue(this.plugin.settings.authorNote);
    this.authorTextarea.onChange(async (value) => {
        const tokenCount = this.plugin.estimateTokens(value);
        authorTokens.setText(`${tokenCount} tokens`);
        this.plugin.settings.authorNote = value;
        await this.plugin.saveSettings();
    });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}