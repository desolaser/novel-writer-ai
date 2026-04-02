import { ItemView, WorkspaceLeaf, Setting, TextAreaComponent } from 'obsidian';
import ContextModal from '../modals/ContextModal';
import MemoryModal from '../modals/MemoryModal';
import AuthorModal from '../modals/AuthorModal';
import { getPromptMetaCascading } from '../utils/prompt-meta';
import { writeFrontmatterValue } from '../utils/frontmatter';
import type WriterAIPlugin from '../../main';

export const VIEW_TYPE_OPTIONS = 'options-view';

export class OptionsView extends ItemView {
  private memoryTextarea: TextAreaComponent;
  private authorTextarea: TextAreaComponent;
  private memoryTokens: HTMLElement;
  private authorTokens: HTMLElement;
  private plugin: WriterAIPlugin;
  private activeLeafChangeCallback: () => void;

  constructor(leaf: WorkspaceLeaf, plugin: WriterAIPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.activeLeafChangeCallback = this.onActiveLeafChange.bind(this);
  }

  getViewType() {
    return VIEW_TYPE_OPTIONS;
  }

  getDisplayText() {
    return 'Options view';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('options-view-container');
    
    // Add a header
    container.createEl('h4', { text: 'Options' });

    const contextSection = container.createDiv('options-section');
    contextSection.createEl('h5', { text: 'Context' });
    contextSection.createEl('p', { 
      text: "Get a full view of what's sent to the AI",
      cls: 'setting-item-description'
    });

    new Setting(contextSection)
      .setName('View current context')
      .setDesc('Open a modal to see the full context sent to the AI')
      .addButton(button => {
        button
          .setButtonText('Current Context')
          .setCta() // Esto lo hace un botón de acción primaria (azul)
          .onClick(() => {
            this.openContextModal();
          });
      });

    // Memory Section
    const memorySection = container.createDiv('options-section');
    memorySection.createEl('h5', { text: 'Memory' });
    memorySection.createEl('p', { 
      text: 'The AI will better remember info placed here.',
      cls: 'setting-item-description'
    });
    
    // Create a custom wrapper for the textarea
    const memoryWrapper = memorySection.createDiv('textarea-wrapper');
    const memoryLabel = memoryWrapper.createDiv('textarea-label');
    memoryLabel.createSpan({ text: 'Memory content: ' });
    this.memoryTokens = memoryLabel.createSpan({ text: '0 tokens', cls: 'token-count' });
    
    this.memoryTextarea = new TextAreaComponent(memoryWrapper);
    this.memoryTextarea.setPlaceholder('Enter memory information...');
    this.memoryTextarea.inputEl.rows = 6;
    this.memoryTextarea.setValue(await getPromptMetaCascading(this.app, this.plugin.settings, 'memoryContent'));
    this.memoryTextarea.onChange(async (value) => {
      const tokenCount = this.estimateTokens(value);
      this.memoryTokens.setText(`${tokenCount} tokens`);
      //this.plugin.settings.memoryContent = value;
      await writeFrontmatterValue(this.app, 'memoryContent', value);
      await this.plugin.saveSettings();
    });

    new Setting(memoryWrapper)
      .setName('Memory Modal')
      .setDesc('Open a modal to edit the memory')
      .addButton(button => {
        button
          .setButtonText('[ ]')
          .setCta() // Esto lo hace un botón de acción primaria (azul)
          .onClick(() => {
            this.openMemoryModal();
          });
      });

    // Author's Note Section
    const authorSection = container.createDiv('options-section');
    authorSection.createEl('h5', { text: "Author's Note" });
    authorSection.createEl('p', { 
      text: 'Info placed here will strongly influence AI output.',
      cls: 'setting-item-description'
    });
    
    const authorWrapper = authorSection.createDiv('textarea-wrapper');
    const authorLabel = authorWrapper.createDiv('textarea-label');
    authorLabel.createSpan({ text: "Author's note content: " });
    this.authorTokens = authorLabel.createSpan({ text: '0 tokens', cls: 'token-count' });
    
    this.authorTextarea = new TextAreaComponent(authorWrapper);
    this.authorTextarea.setPlaceholder("Enter author's note...");
    this.authorTextarea.inputEl.rows = 6;
    this.authorTextarea.setValue(await getPromptMetaCascading(this.app, this.plugin.settings, 'authorNote'));
    this.authorTextarea.onChange(async (value) => {
      const tokenCount = this.estimateTokens(value);
      this.authorTokens.setText(`${tokenCount} tokens`);
      //this.plugin.settings.authorNote = value;
      await writeFrontmatterValue(this.app, 'authorNote', value);
      await this.plugin.saveSettings();
    });

    new Setting(authorWrapper)
      .setName("Author's Note Modal")
      .setDesc("Open a modal to edit the author's note")
      .addButton(button => {
        button
          .setButtonText('[ ]')
          .setCta() // Esto lo hace un botón de acción primaria (azul)
          .onClick(() => {
            this.openAuthorModal();
          });
      });

    // Register event listener for active leaf change to refresh content
    this.app.workspace.on('active-leaf-change', this.activeLeafChangeCallback);
  }

  // Public methods to get the values
  async getMemoryContent(): Promise<string> {
    return await getPromptMetaCascading(this.app, this.plugin.settings, 'memoryContent');
  }

  async getAuthorNote(): Promise<string> {
    return await getPromptMetaCascading(this.app, this.plugin.settings, 'authorNote');
  }

  openContextModal(): void {
    new ContextModal(this.plugin.app, this.plugin).open();
  }

  openMemoryModal(): void {
    new MemoryModal(this.plugin.app, this.plugin).open();
  }

  openAuthorModal(): void {
    new AuthorModal(this.plugin.app, this.plugin).open();
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async onClose() {
    // Remove event listener to prevent memory leaks
    this.app.workspace.off('active-leaf-change', this.activeLeafChangeCallback);
  }

  private async onActiveLeafChange(): Promise<void> {
    // Refresh the content when the active note changes
    const memoryContent = await getPromptMetaCascading(this.app, this.plugin.settings, 'memoryContent');
    const authorNote = await getPromptMetaCascading(this.app, this.plugin.settings, 'authorNote');
    
    this.memoryTextarea.setValue(memoryContent);
    this.authorTextarea.setValue(authorNote);
    
    // Update token counts
    this.memoryTokens.setText(`${this.estimateTokens(memoryContent)} tokens`);
    this.authorTokens.setText(`${this.estimateTokens(authorNote)} tokens`);
  }
}