import {
	Editor, 
	MarkdownFileInfo, 
	MarkdownView, 
	Notice, 
	Plugin, 
	WorkspaceLeaf,
	TFile
} from 'obsidian';
import { AIPluginSettingsTab } from './src/ai-plugin-settings-tab';
import { ApiFactory } from './src/factories/api-factory';
import { ApiInterface } from 'src/interfaces/api-interface';
import { CompletionResponse } from 'src/types/CompletionResponse';
import providers, { ApiProvider } from 'src/constants/providers';
import { extractLorebookMeta } from './src/utils/lorebook';
import { getPromptMetaCascading } from './src/utils/prompt-meta';
import { extractValueFromFrontmatter } from './src/utils/frontmatter';
import { OptionsView, VIEW_TYPE_OPTIONS } from './src/views/OptionsView';
import ContextModal from './src/modals/ContextModal';

export type WriterAIPluginSettings = {
	selectedApi: ApiProvider;
	apiToken: Record<string, string>;
	defaultModel: string;
	stream: boolean;
	prefixPrompt: string;
	maxTokens: number;
	maxContextTokens: number;
	presencePenalty: number;
	frequencyPenalty: number;
	temperature: number;
	topP: number;
	lorebook: { 
		searchRange: number,
		folder: string;
		prompt: string;
	}
	lorebookPercentage: number;
	memoryContent: string;
	authorNote: string;
}

const DEFAULT_SETTINGS: WriterAIPluginSettings = {
    selectedApi: 'openrouter',
    apiToken: Object.keys(providers).reduce((acc: any, provider: string) => ({
		[provider]: '',
		...acc
	}), {}),
    defaultModel: '',
	stream: false,
	prefixPrompt: "Continue the text following the narration style of the user: ",
	maxTokens: 512,
	maxContextTokens: 32764,
	presencePenalty: 0,
	frequencyPenalty: 0,
	temperature: 1,
	topP: 0.01,
	lorebook: { 
		searchRange: 1000,
		folder: "Lorebook",
		prompt: `You are an expert worldbuilding assistant. 
Given the following description, generate a lorebook entry in markdown format for a story-writing tool. 
The entry MUST start with a YAML frontmatter block with a "keys" field (a list of keywords relevant to the entry, in lower case, comma separated or as a YAML array). 
After the frontmatter, write a concise but detailed definition or description for the concept. 
Do not include anything except the frontmatter and the lorebook entry.`,
	},	
	lorebookPercentage: 25,
	memoryContent: '',
	authorNote: '',
}

export default class WriterAIPlugin extends Plugin {
	settings: WriterAIPluginSettings = DEFAULT_SETTINGS;
	apiFactory = new ApiFactory();
	api: ApiInterface | null = null;

	async onload() {
		await this.loadSettings();

		this.registerView(
			VIEW_TYPE_OPTIONS,
			(leaf) => new OptionsView(leaf, this)
		);
		this.activateView();
		
		this.registerEvent(
			this.app.workspace.on('editor-menu', (menu: any, editor: Editor, view) => {
				if (!view) {
					new Notice('Por favor, seleccionar un archivo markdown.');
					return;
				}

				menu.addItem((item: any) => {
					item
						.setTitle('Generate text')
						.setIcon('text')
						.onClick(async () => {
							const file = 'file' in view ? view.file : undefined;
							await this.generateCompletionAtSelection(editor, file ?? undefined);
						});
				});

				menu.addItem((item: any) => {
					item
						.setTitle('Generate lorebook entry')
						.setIcon('text')
						.onClick(async () => {
							await this.generateLorebookEntry(editor);
						});
				});

				menu.addItem((item: any) => {
					item
						.setTitle('Traduce text to spanish')
						.setIcon('text')
						.onClick(async () => {
							await this.traduceText(editor);
						});
				});

				menu.addItem((item: any) => {
					item
						.setTitle('Summarize text')
						.setIcon('text')
						.onClick(async () => {
							await this.summarizeText(editor);
						});
				});
			})
		);

		const selectedApi = this.settings.selectedApi;
        if (selectedApi) {
            this.api = this.apiFactory.createApi(
                this.settings.selectedApi,
                this.settings.apiToken[this.settings.selectedApi]
            );
        }
		
		this.addRibbonIcon('text', 'Generate text', async () => {
			const view = this.app.workspace.getActiveViewOfType(MarkdownView);
			if (!view) {
				new Notice('Por favor, seleccionar un archivo markdown.');
				return;
			}

			await this.generateCompletionAtSelection(view.editor, view.file ?? undefined);
		});

        this.addSettingTab(new AIPluginSettingsTab(this.app, this));

        this.addCommand({
            id: 'generate-text',
            name: 'Generate text with AI',
            editorCallback: async (editor, view: MarkdownView | MarkdownFileInfo) => {
                await this.generateCompletionAtSelection(editor, view.file ?? undefined);
            }
        });

		this.addCommand({
			id: 'generate-lorebook-entry',
			name: 'Generate Lorebook Entry from Note',
			editorCallback: async (editor, view: MarkdownView | MarkdownFileInfo) => {
				await this.generateLorebookEntry(editor);
			}
		});

		this.addCommand({
			id: 'split-into-chapters',
			name: 'Split note into chapters',
			editorCallback: async (editor, view: MarkdownView | MarkdownFileInfo) => {
				await this.splitIntoChapters(editor);
			}
		});

		this.addCommand({
			id: 'crear-nuevo-capitulo',
			name: 'Create new chapter',
			editorCallback: async (editor, view: MarkdownView | MarkdownFileInfo) => {
				await this.crearNuevoCapitulo(editor);
			}
		});

		this.addCommand({
			id: 'open-context-modal',
			name: 'Open Context Modal',
			callback: () => {
				const view = this.app.workspace.getActiveViewOfType(MarkdownView);
				
				if (!view) {
					new Notice('Por favor, abre un archivo markdown primero.');
					return;
				}
			
				new ContextModal(this.app, this).open();
			}
		});

        console.log('AI Plugin loaded');
	}

	onunload() {
        console.log('AI Plugin unloaded');
	}

	async activateView() {
		let leaf: WorkspaceLeaf | null = null;
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_OPTIONS);
		if (leaves.length > 0) {
			leaf = leaves[0];
		} else {
			leaf = this.app.workspace.getRightLeaf(false);
			if (leaf !== null) {
				await leaf.setViewState({ type: VIEW_TYPE_OPTIONS, active: true });
			}
		}
	
		if (leaf !== null) {
			this.app.workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		if (Object.keys(providers).length !== Object.keys(this.settings.apiToken).length) {
			// Si el número de proveedores ha cambiado, agregamos al objeto un nuevo key.

			Object.keys(providers).forEach((provider) => {
				if (!this.settings.apiToken[provider]) {
					this.settings.apiToken[provider] = '';
				}
			});
		}

		// Forzar apiToken a objeto si viene como string
		if (typeof this.settings.apiToken === 'string') {
			const obj: any = {};
			Object.keys(providers).forEach(provider => {
				obj[provider] = '';
			});
			this.settings.apiToken = obj;
		}

		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

    async saveSettings() {
        await this.saveData(this.settings);

		const selectedApi = this.settings.selectedApi
        if (selectedApi) {
            this.api = this.apiFactory.createApi(
                this.settings.selectedApi,
                this.settings.apiToken[this.settings.selectedApi]
            );
        } else {
            this.api = null;
  		}
    }

	async generateCompletionAtSelection(editor: Editor, sourceFile?: TFile) {
		const cursor = editor.getCursor();
		const context = editor.getRange({ line: 0, ch: 0 }, cursor);
		const excludeFile = sourceFile ?? this.app.workspace.getActiveFile() ?? undefined;
		const prompt = await this.generatePrompt(context, false, excludeFile);
		const result = await this.generateText(prompt, "Generating text...");
		if (!result) return;
		this.continueText(editor, result);
	}

	async generatePrompt(context: string, skipTruncation: boolean = false, excludeFile?: TFile): Promise<string> {
		const loreEntries = await this.filterLorebookEntriesByContext(context, excludeFile);
		const authorNote = await getPromptMetaCascading(this.app, this.settings, 'authorNote');
		const memoryContent = await getPromptMetaCascading(this.app, this.settings, 'memoryContent');

		const loreText = loreEntries
			.map(e => e.content.replace(/^---[\s\S]*?---\s*/, ''))
			.join('\n---\n\n---\n');

		const maxContextTokens = this.settings.maxContextTokens;
		const lorebookPercentage = this.settings.lorebookPercentage ?? 25;

		// Build the fixed parts of the prompt (everything except the story context)
		const lorebookHeader = '--- Start of the lorebook\n';
		const lorebookFooter = '\n--- End of the lorebook\n\nRelevant persistent information:\n';
		const memorySection = `${memoryContent}\n\nRelevant guidelines:\n`;
		const authorSection = `${authorNote}\n\n## Prefix Prompt:\n`;
		const prefixSection = `${this.settings.prefixPrompt} \n\n`;

		// Calculate available tokens for lorebook
		const maxLorebookTokens = Math.floor(maxContextTokens * (lorebookPercentage / 100));

		// Truncate lorebook text if it exceeds its budget (skip if viewing full context)
		let truncatedLoreText = loreText;
		if (!skipTruncation && this.estimateTokens(loreText) > maxLorebookTokens) {
			// Truncate lore entries from the end, respecting entry boundaries (separated by ---)
			const loreEntrySeparator = '\n---\n\n---\n';
			const loreEntryList = loreText.split(loreEntrySeparator);
			let accumulatedTokens = 0;
			const keptEntries: string[] = [];
			for (const entry of loreEntryList) {
				const entryTokens = this.estimateTokens(entry);
				if (accumulatedTokens + entryTokens > maxLorebookTokens) break;
				keptEntries.push(entry);
				accumulatedTokens += entryTokens;
			}
			truncatedLoreText = keptEntries.join(loreEntrySeparator);
		}

		// We remove the metadata from the prompt
		const content = context.replace(/^---[\s\S]*?---\s*/, '');
		// Build the full prompt with truncated lore
		let prompt = `${lorebookHeader}${truncatedLoreText}${lorebookFooter}${memorySection}${authorSection}${prefixSection}${content}`;

		// If the full prompt still exceeds maxContextTokens, truncate the story context from the beginning
		if (!skipTruncation) {
			const totalTokens = this.estimateTokens(prompt);
			if (totalTokens > maxContextTokens) {
				const overflowTokens = totalTokens - maxContextTokens;
				// Remove overflow from the story context (the last part of the prompt)
				const contextTokens = this.estimateTokens(context);
				const keepTokens = Math.max(0, contextTokens - overflowTokens);
				const keepChars = keepTokens * 4;
				const truncatedContext = context.slice(-keepChars);
				prompt = `${lorebookHeader}${truncatedLoreText}${lorebookFooter}${memorySection}${authorSection}${prefixSection}${truncatedContext}`;
			}
		}

		return prompt;
	}

	async splitIntoChapters(editor: Editor) {
		const content = editor.getValue();
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file found.');
			return;
		}

		// 1. Remove YAML frontmatter
		const contentWithoutMeta = content.replace(/^---[\s\S]*?---\s*/, '').trim();

		// 2. Split by *** (dinkus) into chapters
		const rawChapters = contentWithoutMeta.split(/\n\s*\*{3,}\s*\n/);

		// 3. Parse each chapter: extract [Title] from first line
		type Chapter = { title: string; text: string };
		const chapters: Chapter[] = [];

		for (const raw of rawChapters) {
			const trimmed = raw.trim();
			if (!trimmed) continue;

			const titleMatch = trimmed.match(/^\s*\[([^\]]+)\]\s*([\s\S]*)/);
			let title: string;
			let text: string;

			if (titleMatch) {
				title = titleMatch[1].trim();
				text = titleMatch[2].trim();
			} else {
				title = `Chapter ${chapters.length + 1}`;
				text = trimmed;
			}

			chapters.push({ title, text });
		}

		if (chapters.length === 0) {
			new Notice('No chapters found. Make sure chapters are separated by ***');
			return;
		}

		new Notice(`Found ${chapters.length} chapters. Generating summaries...`);

		// 4. Generate summary of all chapters via AI
		const chaptersForPrompt = chapters
			.map((ch, i) => `## Chapter ${i + 1}: ${ch.title}\n\n${ch.text}`)
			.join('\n\n***\n\n');

		const summaryPrompt = `I need you to summarize the following chapters of a story. 
For each chapter, provide a concise summary in spanish.

Format your response exactly like this (do not include anything else, no brackets):

${chapters.map((ch, i) => `${ch.title}:\nSummary of chapter ${i + 1}`).join('\n\n===\n\n')}

Replace "Summary of chapter N" with the actual summary text. Use "===" as separator between chapters.

Here are the chapters:

${chaptersForPrompt}`;

		const summaryResult = await this.generateText(summaryPrompt, "Generating chapter summaries...", {
			max_tokens: Math.floor(this.estimateTokens(summaryPrompt) * 0.8),
			presence_penalty: 0,
			frequency_penalty: 0,
			temperature: 0.5,
			top_p: 0.9,
			stream: false
		});

		if (!summaryResult || !summaryResult.text) {
			new Notice('Failed to generate summaries.');
			return;
		}

		// Parse summaries from AI response (separated by ===)
		const summaryBlocks = summaryResult.text.trim().split(/\n\s*={3,}\s*\n/);
		const summaries: string[] = [];

		for (const block of summaryBlocks) {
			const summaryMatch = block.match(/^([^:\n]+):\s*\n([\s\S]*)/);
			if (summaryMatch) {
				summaries.push(summaryMatch[2].trim());
			}
		}

		// Ensure we have the right number of summaries
		while (summaries.length < chapters.length) {
			summaries.push('No summary available.');
		}

		// Get the current folder path
		const folderPath = activeFile.parent ? activeFile.parent.path : '';

		// 5. Create one note per chapter with previous summaries in memoryContent
		for (let i = 0; i < chapters.length; i++) {
			const chapter = chapters[i];
			const previousSummaries = summaries.slice(0, i)
				.map((s, j) => `${chapters[j].title}:\n${s}`)
				.join('\n\n===\n\n');

			const memoryContent = previousSummaries 
				? `Previous chapter summaries:\n\n${previousSummaries}`
				: '';

			const chapterFileName = `${chapter.title.replace(/[\\/:*?"<>|]/g, '_')}.md`;
			const chapterFilePath = folderPath ? `${folderPath}/${chapterFileName}` : chapterFileName;

			// Build frontmatter with memoryContent
			let chapterContent = '---\n';
			if (memoryContent) {
				chapterContent += `memoryContent: |\n  ${memoryContent.replace(/\n/g, '\n  ')}\n`;
			}
			chapterContent += `---\n\n${chapter.text}`;

			// Check if file already exists
			const existingFile = this.app.vault.getAbstractFileByPath(chapterFilePath);
			if (existingFile instanceof TFile) {
				await this.app.vault.modify(existingFile, chapterContent);
			} else {
				await this.app.vault.create(chapterFilePath, chapterContent);
			}
		}

		// 6. Create "Capítulo Nuevo" note with full summary in memoryContent
		const fullSummary = summaries
			.map((s, i) => `${chapters[i].title}:\n${s}`)
			.join('\n\n===\n\n');

		const newChapterContent = `---\nmemoryContent: |\n  Complete story summary:\n  ${fullSummary.replace(/\n/g, '\n  ')}\n---\n\n`;
		const newChapterPath = folderPath ? `${folderPath}/Capítulo Nuevo.md` : 'Capítulo Nuevo.md';

		const existingNewFile = this.app.vault.getAbstractFileByPath(newChapterPath);
		if (existingNewFile instanceof TFile) {
			await this.app.vault.modify(existingNewFile, newChapterContent);
		} else {
			await this.app.vault.create(newChapterPath, newChapterContent);
		}

		new Notice(`Created ${chapters.length} chapter files + Capítulo Nuevo`);
	}

	async crearNuevoCapitulo(editor: Editor) {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file found.');
			return;
		}

		// Get the full content of the current note
		const content = editor.getValue();

		// Remove YAML frontmatter for the summary prompt
		const contentWithoutMeta = content.replace(/^---[\s\S]*?---\s*/, '').trim();

		// Get memoryContent from the current chapter's frontmatter
		const memoryContentChapter = extractValueFromFrontmatter(content, 'memoryContent') || '';

		// Generate summary of the current chapter via AI
		const summaryPrompt = `I need you to summarize the following chapter of a story.
Provide a concise summary in spanish.

Here is the chapter:

${contentWithoutMeta}`;

		const inputTokens = this.estimateTokens(summaryPrompt);
		const summaryResult = await this.generateText(summaryPrompt, "Summarizing current chapter...", {
			max_tokens: Math.floor(inputTokens * 0.5),
			presence_penalty: 0,
			frequency_penalty: 0,
			temperature: 0.5,
			top_p: 0.9,
			stream: false
		});

		if (!summaryResult || !summaryResult.text) {
			new Notice('Failed to generate summary.');
			return;
		}

		const summaryActualChapter = summaryResult.text.trim();

		// Build the new memoryContent combining previous memoryContent and the new summary
		let newMemoryContent = '';
		if (memoryContentChapter) {
			newMemoryContent += memoryContentChapter + '\n\n===\n\n';
		}
		newMemoryContent += summaryActualChapter;

		// Create the new note "Capítulo Nuevo" in the same folder
		const folderPath = activeFile.parent ? activeFile.parent.path : '';
		const newChapterPath = folderPath ? `${folderPath}/Capítulo Nuevo.md` : 'Capítulo Nuevo.md';

		const newChapterContent = `---\nmemoryContent: |\n  ${newMemoryContent.replace(/\n/g, '\n  ')}\n---\n\n`;

		const existingFile = this.app.vault.getAbstractFileByPath(newChapterPath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, newChapterContent);
		} else {
			await this.app.vault.create(newChapterPath, newChapterContent);
		}

		new Notice('New chapter created successfully.');
	}

	async generateLorebookEntry(editor: Editor) {
		const noteText = editor.getValue();
		const relatedLore = (await this.filterLorebookEntriesByContext(noteText))
			.map(e => e.content.replace(/^---[\s\S]*?---\s*/, ''))
			.join('---\n\n---');

		const prompt = `${this.settings.lorebook.prompt}	
### Lore:
${relatedLore ? `Relevant lorebook entries:\n${relatedLore}` : ''}

### This is the text of the note, write a lorebook entry about this:
${noteText}`;
		
		const inputTokens = this.estimateTokens(prompt);
		const result = await this.generateText(prompt, "Generating lorebook entry...", {
			max_tokens: Math.floor(inputTokens * 1.3),
			presence_penalty: 0,
			frequency_penalty: 0,
			temperature: 0.7,
			top_p: 0.9
		});
		if (!result) return;
		this.overwriteNote(editor, result);
	}	

	async traduceText(editor: Editor) {	
		const selection = editor.getSelection();
		const prompt = `Traduce this text to spanish, you will answer just with the traduction. This is the text: ${selection}`;
		const inputTokens = this.estimateTokens(prompt);
		const options = {
			max_tokens: Math.floor(inputTokens * 1.3),
			presence_penalty: 0,
			frequency_penalty: 0,
			temperature: 0.7,
			top_p: 0.9
		}

		const result = await this.generateText(prompt, "Traducing text...", options);
		if (!result) return;
		this.replaceSelection(editor, result);
	}
	
	async summarizeText(editor: Editor) {	
		const selection = editor.getSelection();
		const prompt = `I need you to summarize the selected text. This is the text: ${selection}`;
		const inputTokens = this.estimateTokens(prompt);
		const options = {
			max_tokens: Math.floor(inputTokens * 0.5),
			presence_penalty: 0,
			frequency_penalty: 0,
			temperature: 0.7,
			top_p: 0.9
		}
		const result = await this.generateText(prompt, "Summarizing text...", options);
		if (!result) return;
		this.replaceSelection(editor, result);
	}

	async filterLorebookEntriesByContext(context: string, excludeFile?: TFile): Promise<{file: TFile, content: string}[]> {
		const files = this.app.vault.getFiles();
		const lorebookFiles = files.filter(file => file.path.startsWith(`${this.settings.lorebook.folder}/`));
		const entries = [];
		const lastContext = context.slice(-this.settings.lorebook.searchRange).toLowerCase();
	
		for (const file of lorebookFiles) {
			// Skip the excluded file (e.g., the current note being edited)
			if (excludeFile && file.path === excludeFile.path) continue;

			const content = await this.app.vault.read(file);
			const meta = extractLorebookMeta(content);
	
			if (meta.enabled === false) continue;
	
			if (meta.alwaysOn === true) {
				entries.push({ file, content });
				continue;
			}
	
			if (meta.keys.some(key => {
				const regex = new RegExp(`\\b${key.toLowerCase()}\\b`, 'u');
				return regex.test(lastContext);
			})) {
				entries.push({ file, content });
			}
		}
		return entries;
	}

	async replaceSelection(editor: Editor, result: CompletionResponse) {
		let text = '';
		if (result.text) {
			text = result.text;
			editor.replaceSelection(text);
		} else if (result.stream) {
			editor.replaceSelection("");
			const startCursor = editor.getCursor();
			let insertedText = '';
			for await (const chunk of result.stream) {
				const newText = chunk.choices[0]?.delta?.content || '';
				if (newText) {
					const from = {
						line: startCursor.line,
						ch: startCursor.ch + insertedText.length
					};
					editor.replaceRange(newText, from);
					insertedText += newText;
				}
			}
		}
	}

	async continueText(editor: Editor, result: CompletionResponse) {
		let text = '';
		if (result.text) {
			text = result.text;
			const cursor = editor.getCursor();
			editor.replaceRange(text, cursor);
		} else if (result.stream) {
			let insertedText = '';
			const startCursor = editor.getCursor();
			for await (const chunk of result.stream) {
				const isNovelAIChunk = this.settings.selectedApi === "novelai" && ["kayra-v1", "llama-3-erato-v1"].includes(this.settings.defaultModel);
				const newText = isNovelAIChunk ? chunk.token : (chunk.choices[0]?.delta?.content || '');
				if (newText) {
					const from = {
						line: startCursor.line,
						ch: startCursor.ch + insertedText.length
					};
					editor.replaceRange(newText, from);
					insertedText += newText;
				}
			}
		}
	}

	async overwriteNote(editor: Editor, result: CompletionResponse) {
		if (result.text) {
			editor.setValue(result.text.trim());
		} else if (result.stream) {
			let insertedText = '';
			for await (const chunk of result.stream) {
				const newText = chunk.choices[0]?.delta?.content || '';
				if (newText) {
					insertedText += newText;
					editor.setValue(insertedText);
				}
			}
		}
	}

	async generateText(prompt: string, loadingText: string = "Generating text", options = {}) {
		const defaultOptions = {
			stream: this.settings.stream,
			max_tokens: this.settings.maxTokens,
			presence_penalty: this.settings.presencePenalty,
			frequency_penalty: this.settings.frequencyPenalty,
			temperature: this.settings.temperature,
			top_p: this.settings.topP
		}

		if (!this.api) {
			new Notice('Please, configure an API key and add a valid token first.');
			throw new Error('Please, configure an API key and add a valid token first.');
		}

		new Notice(loadingText);
	
		try {
			const statusBarItem = this.addStatusBarItem();
			statusBarItem.setText(loadingText);
	
			const result: CompletionResponse = await this.api.generateCompletion(
				prompt,
				this.settings.defaultModel,
				{ ...defaultOptions, ...options }
			);

			if ((!result.text || result.text === "") && !result.stream) {
				new Notice('The response of the API is empty.');
				throw new Error('The response of the API is empty.');
			}
	
			statusBarItem.remove();

			return result;	
		} catch (error) {
			new Notice(`Error generating the lorebook entry: ${error.message}`);
		}
	}

	estimateTokens(text: string): number {
	  return Math.ceil(text.length / 4);
	}
}