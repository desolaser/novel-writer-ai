import {
	Editor, 
	MarkdownFileInfo, 
	MarkdownView, 
	Notice, 
	Plugin, 
	TFile,
	Vault
} from 'obsidian';
import { AIPluginSettingsTab } from './src/ai-plugin-settings-tab';
import { ApiFactory } from './src/factories/api-factory';
import { ApiInterface } from 'src/interfaces/api-interface';
import { CompletionResponse } from 'src/types/CompletionResponse';
import providers, { ApiProvider } from 'src/constants/providers';
import { extractLorebookMeta } from './src/utils/lorebook';

type WriterAIPluginSettings = {
	selectedApi: ApiProvider;
	apiToken: any;
	defaultModel: string;
	stream: boolean;
	prefixPrompt: string;
	maxTokens: number;
	presencePenalty: number;
	frequencyPenalty: number;
	temperature: number;
	topP: number;
	lorebook: { 
		searchRange: number,
		folder: string;
		prompt: string;
	}
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
Do not include anything except the frontmatter and the lorebook entry.`
	}
}

export default class WriterAIPlugin extends Plugin {
	settings: WriterAIPluginSettings = DEFAULT_SETTINGS;
	apiFactory = new ApiFactory();
	api: ApiInterface | null = null;

	async onload() {
		console.log('WriterAIPlugin: onload start');
        try {
            await this.loadSettings();
            // ...resto del código...
            console.log('WriterAIPlugin: onload end');
        } catch (e) {
            console.error('WriterAIPlugin: onload error', e);
        }
		
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
							await this.generateCompletionAtSelection(editor, view);
						});
				});

				menu.addItem((item: any) => {
					item
						.setTitle('Generate lorebook entry')
						.setIcon('text')
						.onClick(async () => {
							await this.generateLorebookEntry(editor, view);
						});
				});				

			})
		);

        if (this.settings.selectedApi && this.settings.apiToken[this.settings.selectedApi]) {
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

			await this.generateCompletionAtSelection(view.editor, view);
		});

        this.addSettingTab(new AIPluginSettingsTab(this.app, this));

		// Registrar comandos de Obsidian
        this.addCommand({
            id: 'generate-text',
            name: 'Generate text with AI',
            editorCallback: async (editor, view: MarkdownView | MarkdownFileInfo) => {
                await this.generateCompletionAtSelection(editor, view);
            }
        });

		this.addCommand({
			id: 'generate-lorebook-entry',
			name: 'Generate Lorebook Entry from Note',
			editorCallback: async (editor, view: MarkdownView | MarkdownFileInfo) => {
				await this.generateLorebookEntry(editor, view);
			}
		});
		
        console.log('AI Plugin loaded');
	}

	onunload() {
        console.log('AI Plugin unloaded');
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
        
        // Actualizar la instancia de API si hay cambios en la configuración
        if (this.settings.selectedApi && this.settings.apiToken[this.settings.selectedApi]) {
            this.api = this.apiFactory.createApi(
                this.settings.selectedApi,
                this.settings.apiToken[this.settings.selectedApi]
            );
        } else {
            this.api = null;
		}
    }

	async generateCompletionAtSelection(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
		// Verificar si hay una API configurada
		if (!this.api) {
			new Notice('Please, configure an API key and add a valid token first.');
			return;
		}

		// Obtenemos el texto de los lorebooks
		const context = editor.getValue();
		const loreEntries = await this.filterLorebookEntriesByContext(context);
		const loreText = loreEntries
			.map(e => e.content.replace(/^---[\s\S]*?---\s*/, ''))
			.join('\n\n');

		const prompt = `START OF THE LORE:
${loreText}
END OF THE LORE:
${this.settings.prefixPrompt} ${context}`;

		console.log({ prompt });

		new Notice('Generating text...');

		try {
			// Mostrar indicador de carga
			const statusBarItem = this.addStatusBarItem();
			statusBarItem.setText('Generating text...');

			// Generar texto usando la API configurada
			const result: CompletionResponse = await this.api.generateCompletion(
				prompt,
				this.settings.defaultModel,
				{ 
					stream: this.settings.stream,
					max_tokens: this.settings.maxTokens,
					presence_penalty: this.settings.presencePenalty,
					frequency_penalty: this.settings.frequencyPenalty,
					temperature: this.settings.temperature,
					top_p: this.settings.topP
				}
			);

			let text = '';
			if (result.text) {
				text = result.text;
				const cursor = editor.getCursor();
				editor.replaceRange(text, cursor);
			} else if (result.stream) {
				let insertedText = '';
				const startCursor = editor.getCursor();
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
			} else {
				new Notice('The response of the API is empty.');
			}

			statusBarItem.remove();
		} catch (error) {
			new Notice(`Error generating the text: ${error.message}`);
		}
	}

	async generateLorebookEntry(editor: Editor, view: MarkdownView | MarkdownFileInfo) {
		if (!this.api) {
			new Notice('Please, configure an API key and add a valid token first.');
			return;
		}
	
		const noteText = editor.getValue();
		// Optionally, you can also concatenate relevant lorebook entries if you want more context
		const relatedLore = (await this.filterLorebookEntriesByContext(noteText))
			.map(e => e.content.replace(/^---[\s\S]*?---\s*/, ''))
			.join('\n\n');
	
		// Prompt for the AI
		const prompt = `${this.settings.lorebook.prompt}
	
	Description:
	${noteText}
	
	${relatedLore ? `Relevant lorebook entries:\n${relatedLore}` : ''}`;
	
		new Notice('Generating lorebook entry...');
	
		try {
			const statusBarItem = this.addStatusBarItem();
			statusBarItem.setText('Generating lorebook entry...');
	
			const result: CompletionResponse = await this.api.generateCompletion(
				prompt,
				this.settings.defaultModel,
				{
					stream: false,
					max_tokens: 512,
					presence_penalty: 0,
					frequency_penalty: 0,
					temperature: 0.7,
					top_p: 0.9
				}
			);
	
			if (result.text) {
				// Replace the entire note with the generated lorebook entry
				editor.setValue(result.text.trim());
				new Notice('Lorebook entry generated!');
			} else {
				new Notice('The response of the API is empty.');
			}
	
			statusBarItem.remove();
		} catch (error) {
			new Notice(`Error generating the lorebook entry: ${error.message}`);
		}
	}
	
	async filterLorebookEntriesByContext(context: string): Promise<{file: TFile, content: string}[]> {
		const files = this.app.vault.getFiles();
		const lorebookFiles = files.filter(file => file.path.startsWith(`${this.settings.lorebook.folder}/`));
		const entries = [];
		const lastContext = context.slice(-this.settings.lorebook.searchRange).toLowerCase();
	
		for (const file of lorebookFiles) {
			const content = await this.app.vault.read(file);
			const meta = extractLorebookMeta(content);
	
			if (meta.enabled === false) continue;
	
			if (meta.alwaysOn === true) {
				entries.push({ file, content });
				continue;
			}
	
			if (meta.keys.some(key => lastContext.includes(key.toLowerCase()))) {
				entries.push({ file, content });
			}
		}
		return entries;
	}
}