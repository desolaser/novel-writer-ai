import { App, Editor, MarkdownFileInfo, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, WorkspaceLeaf } from 'obsidian';
import { AIPluginSettingsTab } from './src/ai-plugin-settings-tab';
import { ApiFactory } from './src/factories/api-factory';
import { ApiInterface } from 'src/interfaces/api-interface';
import { CompletionResponse } from 'src/types/CompletionResponse';
import providers, { ApiProvider } from 'src/constants/providers';

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
				menu.addItem((item: any) => {
					item
						.setTitle('Generate text')
						.setIcon('text')
						.onClick(async () => {
							if (view.file) {
								new Notice(view.file?.path);
							}
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

		// Obtener el texto seleccionado o usar un prompt predeterminado
		const selection = editor.getValue();
		const prompt = ` ${this.settings.prefixPrompt} ${selection}`;

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
					console.log({ chunk });
					const newText = chunk.choices[0]?.delta?.content || '';
					if (newText) {
						// Siempre insertamos al final del texto ya insertado
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
}