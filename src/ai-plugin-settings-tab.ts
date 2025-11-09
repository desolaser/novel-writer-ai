import { PluginSettingTab, Setting, TextAreaComponent } from 'obsidian';
import { ApiFactory } from './factories/api-factory';
import type { Model } from './types/Model';

export class AIPluginSettingsTab extends PluginSettingTab {
    plugin;
    apiFactory: ApiFactory;
    availableApis: string[] = ['OpenRouter', 'Deepseek'];
    models: Model[] = [];

    constructor(app: any, plugin: any) {
        super(app, plugin);
        this.plugin = plugin;
        this.apiFactory = new ApiFactory();
    }

    async display() {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h1', { text: 'Novel writer configuration' });

        new Setting(containerEl)
            .setName('API Provider')
            .setDesc('Select the API provider that you decided to use.')
            .addDropdown(dropdown => {
                this.availableApis.forEach(api => {
                    dropdown.addOption(api.toLowerCase(), api);
                });
                
                dropdown.setValue(this.plugin.settings.selectedApi || 'openrouter')
                    .onChange(async (value: string) => {
                        this.plugin.settings.selectedApi = value;
                        await this.plugin.saveSettings();
                        localStorage.removeItem('models');
                        await this.display();
                    });
            });

        new Setting(containerEl)
            .setName('API Token')
            .setDesc('Add the API token of your selected provider')
            .addText(text => text
            .setPlaceholder('Add your API token')
            .setValue(this.plugin.settings.apiToken[this.plugin.settings.selectedApi] || '')
            .onChange(async (value) => {
                if (typeof this.plugin.settings.apiToken === "string") {
                    this.plugin.settings.apiToken = {
                        [this.plugin.settings.selectedApi]: value
                    };
                } else {
                    this.plugin.settings.apiToken[this.plugin.settings.selectedApi] = value;
                }
                await this.plugin.saveSettings();
                localStorage.removeItem('models');
                await this.display();
            }));

        const modelContainer = containerEl.createDiv();
        modelContainer.createEl('h3', { text: 'Available Models' });

        const token = this.plugin.settings.apiToken[this.plugin.settings.selectedApi];
        if (this.plugin.settings.selectedApi && token) {
            const cachedModels = localStorage.getItem('models');
            if (cachedModels) {
                this.models = JSON.parse(cachedModels);
                this.renderModels(modelContainer);
            } else {
                await this.loadModels(this.plugin.settings.selectedApi, modelContainer);
            }
        } else {
            modelContainer.createEl('p', { 
                text: 'Add an API token to see the available models.'
            });
        }

        const optionsContainer = containerEl.createDiv();
        optionsContainer.createEl('h3', { text: 'Model Options' });

        new Setting(optionsContainer)
            .setName('Streaming')
            .setDesc('Enable this option if you want the text to be added to your note as it is being generated.')
            .addToggle(toggle => {                
                toggle.setValue(this.plugin.settings.stream)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.stream = value;
                        await this.plugin.saveSettings();
                    });
                });

        // Prefix prompt
        const prefixSection = optionsContainer.createDiv('options-section');
        prefixSection.createEl('p', { text: 'Prompt Prefix' });
        prefixSection.createEl('span', { 
            text: 'Here you can change the prompt prefix that will be sent to the API. The selected text will come after this.',
            cls: 'setting-item-description'
        });
        prefixSection.addClass('bg-primary');
        
        const prefixWrapper = prefixSection.createDiv('textarea-wrapper');        
        const prefixTextarea = new TextAreaComponent(prefixWrapper);
        prefixTextarea.setPlaceholder('Enter memory information...');
        prefixTextarea.inputEl.rows = 6;
        prefixTextarea.setValue(this.plugin.settings.prefixPrompt);
        prefixTextarea.onChange(async (value) => { 
            this.plugin.settings.prefixPrompt = value;
            await this.plugin.saveSettings();
        });

        new Setting(optionsContainer)
            .setName('Max Tokens')
            .setDesc('Maximum number of tokens that can be generated in the response.')
            .addText(text => {
                text.setValue(this.plugin.settings.maxTokens.toString())
                    .onChange(async (value: string) => {
                        const parsedValue = parseInt(value);
                        if (!isNaN(parsedValue)) {
                            this.plugin.settings.maxTokens = parsedValue;
                            await this.plugin.saveSettings();
                        }
                    });
                });

        new Setting(optionsContainer)
            .setName('Temperature')
            .setDesc('Controls the randomness of the response. A higher value means more randomness.')
            .addText(text => {
                text.setValue(this.plugin.settings.temperature.toString())
                    .onChange(async (value: string) => {
                        const parsedValue = parseFloat(value);
                        if (!isNaN(parsedValue)) {
                            this.plugin.settings.temperature = parsedValue;
                            await this.plugin.saveSettings();
                        }
                    });
                });

        new Setting(optionsContainer)
            .setName('Top P')
            .setDesc('Controls the diversity of the response. A lower value means less diversity.')
            .addText(text => {
                text.setValue(this.plugin.settings.topP.toString())
                    .onChange(async (value: string) => {
                    const parsedValue = parseFloat(value);
                        if (!isNaN(parsedValue)) {
                            this.plugin.settings.topP = parsedValue;
                            await this.plugin.saveSettings();
                        }
                    });
                });

        new Setting(optionsContainer)
            .setName('Presence Penalty')
            .setDesc('Controls the presence penalty. A higher value means less repetition.')
            .addText(text => {
                text.setValue(this.plugin.settings.presencePenalty.toString())
                    .onChange(async (value: string) => {
                        const parsedValue = parseFloat(value);
                        if (!isNaN(parsedValue)) {
                            this.plugin.settings.presencePenalty = parsedValue;
                            await this.plugin.saveSettings();
                        }
                    });
                });

        new Setting(optionsContainer)
            .setName('Frequency Penalty')
            .setDesc('Controls the frequency penalty. A higher value means less repetition.')  
            .addText(text => {
                text.setValue(this.plugin.settings.frequencyPenalty.toString())
                    .onChange(async (value: string) => {
                        const parsedValue = parseFloat(value);
                        if (!isNaN(parsedValue)) {
                            this.plugin.settings.frequencyPenalty = parsedValue;
                            await this.plugin.saveSettings();
                        }
                    });
                });

                
        const lorebookContainer = containerEl.createDiv();
        lorebookContainer.createEl('h3', { text: 'Lorebook Options' });

        new Setting(lorebookContainer)
            .setName('Search Range')
            .setDesc('The number of characters of the story that will be searched for keys.')  
            .addText(text => {
                text.setValue(this.plugin.settings.lorebook.searchRange.toString())
                    .onChange(async (value: string) => {
                        const parsedValue = parseInt(value);
                        if (!isNaN(parsedValue)) {
                            this.plugin.settings.lorebook.searchRange = parsedValue;
                            await this.plugin.saveSettings();
                        }
                    });
                });

        new Setting(lorebookContainer)
            .setName('Lorebook Folder')
            .setDesc('The folder where the plugin will look for your lorebook entries.')  
            .addText(text => {
                text.setValue(this.plugin.settings.lorebook.folder)
                    .onChange(async (value: string) => {
                        this.plugin.settings.lorebook.folder = value;
                        await this.plugin.saveSettings();
                    });
                });
        
        // Lorebook prompt section
        const lorebookSection = lorebookContainer.createDiv('options-section');
        lorebookSection.createEl('p', { text: 'Lorebook Prompt' });
        lorebookSection.createEl('span', { 
            text: 'Prompt to generate lorebook entries.',
            cls: 'setting-item-description'
        });
        lorebookSection.addClass('bg-primary');
        
        const lorebookWrapper = lorebookSection.createDiv('textarea-wrapper');        
        const lorebookTextarea = new TextAreaComponent(lorebookWrapper);
        lorebookTextarea.setPlaceholder('Enter memory information...');
        lorebookTextarea.inputEl.rows = 6;
        lorebookTextarea.setValue(this.plugin.settings.lorebook.prompt);
        lorebookTextarea.onChange(async (value) => { 
            this.plugin.settings.lorebook.prompt = value;
            await this.plugin.saveSettings();
        });
    }

    async loadModels(apiProvider: string, container: any = null) {
        try {
            // Limpiamos los modelos anteriores si se proporciona un contenedor
            if (container) {
                container.empty();
                container.createEl('h3', { text: 'Available Models' });
            }

            // Si no hay token, no podemos cargar modelos
            const token = this.plugin.settings.apiToken[this.plugin.settings.selectedApi]
            if (!token || token === '') {
                if (container) {
                    container.createEl('p', { 
                        text: 'Add an API token to see the available models.'
                    });
                }
                return;
            }

            // Crear la instancia de API adecuada usando la factory
            const api = this.apiFactory.createApi(
                apiProvider,
                token
            );

            // Mostrar un mensaje de carga
            if (container) {
                const loadingEl = container.createEl('p', { 
                    text: 'Loading models...'
                });
                
                // Obtener modelos de la API
                this.models = await api.getAvailableModels();
                localStorage.setItem('models', this.models ? JSON.stringify(this.models) : '[]');
                
                // Eliminar mensaje de carga
                loadingEl.remove();

                this.renderModels(container);
            }
        } catch (error) {
            console.error('Error loading the models:', error);
            
            if (container) {
                container.createEl('p', { 
                    text: `Error loading the models: ${error.message}`,
                    cls: 'error-message'
                }).style.color = 'red';
            }
        }
    }

    renderModels(container: any) {
        // Crear un elemento de configuración para seleccionar el modelo por defecto
        if (this.models && this.models.length > 0) {
            new Setting(container)
                .setName('Default Model')
                .setDesc('Select the default model to use.')
                .addDropdown(dropdown => {
                    this.models.forEach(model => {
                        dropdown.addOption(model.id, model.name || model.id);
                    });                    
                    dropdown.setValue(this.plugin.settings.defaultModel || this.models[0].id)
                        .onChange(async (value) => {
                            this.plugin.settings.defaultModel = value;
                            await this.plugin.saveSettings();
                        });
                });
        } else {
            container.createEl('p', { 
                text: 'No models available for the selected API provider.'
            });
        }
    }
}