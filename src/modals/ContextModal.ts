import { App, Modal, MarkdownView, Notice } from 'obsidian';
import type WriterAIPlugin from '../../main';

interface TokenInfo {
  identifier: string;
  tokens: number;
}

export default class ContextModal extends Modal {
  private plugin: WriterAIPlugin;

  constructor(app: App, plugin: WriterAIPlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    
    modalEl.addClass('context-modal-large');
    
    contentEl.empty();
    contentEl.addClass('options-view-container');
    
    contentEl.createEl('h4', { text: 'Current Context' });

    const markdownLeaves = this.app.workspace.getLeavesOfType('markdown');
    
    if (markdownLeaves.length === 0) {
      contentEl.createEl('p', { 
        text: 'No hay ningún archivo markdown abierto.',
        cls: 'mod-warning'
      });
      return;
    }

    const activeLeaf = this.app.workspace.getMostRecentLeaf();
    let targetView: MarkdownView | null = null;
    
    if (activeLeaf && activeLeaf.view instanceof MarkdownView) {
      targetView = activeLeaf.view;
    }
    
    if (!targetView) {
      targetView = markdownLeaves[0].view as MarkdownView;
    }

    if (!targetView || !targetView.editor) {
      contentEl.createEl('p', { 
        text: 'No se pudo acceder al editor.',
        cls: 'mod-warning'
      });
      return;
    }

    const context = targetView.editor.getValue();
    
    if (!context || context.trim() === '') {
      contentEl.createEl('p', { text: 'El archivo está vacío.' });
      return;
    }

    const loadingEl = contentEl.createEl('p', { text: 'Generando prompt...' });

    this.plugin.generatePrompt(context).then((prompt) => {
      loadingEl.remove();
      
      // Contenedor del prompt con scroll
      const promptContainer = contentEl.createDiv('prompt-container');
      promptContainer.createEl('pre', { text: prompt });

      // Agregar tabla de tokens
      this.createTokenTable(contentEl, context);
    }).catch((error) => {
      loadingEl.remove();
      contentEl.createEl('p', { 
        text: `Error: ${error.message}`,
        cls: 'mod-warning'
      });
    });
  }

  private async createTokenTable(container: HTMLElement, context: string) {
    const tokenSection = container.createDiv('token-table-section');
    tokenSection.createEl('h5', { text: 'Token Breakdown' });

		const loreEntries = await this.plugin.filterLorebookEntriesByContext(context);
		const loreText = loreEntries
			.map(e => e.content.replace(/^---[\s\S]*?---\s*/, ''))
			.join('\n---\n\n---\n');

    // Calcular tokens para cada sección
    const tokenData: TokenInfo[] = [
      { identifier: 'Story', tokens: this.plugin.estimateTokens(context) },
      { identifier: 'Memory', tokens: this.plugin.estimateTokens(this.plugin.settings.memoryContent) },
      { identifier: 'Author\'s Note', tokens: this.plugin.estimateTokens(this.plugin.settings.authorNote) },
      { identifier: 'Lorebook', tokens: this.plugin.estimateTokens(loreText) },
    ];

    // Calcular total
    const totalTokens = tokenData.reduce((sum, item) => sum + item.tokens, 0);

    // Crear tabla
    const table = tokenSection.createEl('table', { cls: 'token-table' });
    
    // Header
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Identifier' });
    headerRow.createEl('th', { text: 'Tokens', cls: 'token-column' });

    // Body
    const tbody = table.createEl('tbody');
    
    tokenData.forEach(item => {
      const row = tbody.createEl('tr');
      row.createEl('td', { text: item.identifier });
      row.createEl('td', { text: item.tokens.toString(), cls: 'token-column' });
    });

    // Total row
    const totalRow = tbody.createEl('tr', { cls: 'total-row' });
    totalRow.createEl('td', { text: 'Total' });
    totalRow.createEl('td', { text: totalTokens.toString(), cls: 'token-column' });
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}