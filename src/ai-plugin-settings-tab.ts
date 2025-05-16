import { App, PluginSettingTab, Setting } from 'obsidian';
import { ApiFactory } from './factories/api-factory';
import { ApiInterface } from './interfaces/api-interface';
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

        containerEl.createEl('h1', { text: 'Configuración de Novel Writer' });

        new Setting(containerEl)
            .setName('Proveedor de API')
            .setDesc('Selecciona el proveedor de API que deseas utilizar')
            .addDropdown(dropdown => {
                this.availableApis.forEach(api => {
                    dropdown.addOption(api.toLowerCase(), api);
                });
                
                dropdown.setValue(this.plugin.settings.selectedApi || 'openrouter')
                    .onChange(async (value: string) => {
                        this.plugin.settings.selectedApi = value;
                        await this.loadModels(value);
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(containerEl)
            .setName('API Token')
            .setDesc('Introduce tu token de API para el proveedor seleccionado')
            .addText(text => text
            .setPlaceholder('Ingresa tu API token')
            .setValue(this.plugin.settings.apiToken || '')
            .onChange(async (value) => {
                this.plugin.settings.apiToken = value;
                await this.plugin.saveSettings();
                // Limpiar modelos cacheados y recargar modelos del nuevo token/provider
                localStorage.removeItem('models');
                await this.display();
            }));

        const modelContainer = containerEl.createDiv();
        modelContainer.createEl('h3', { text: 'Modelos Disponibles' });

        if (this.plugin.settings.apiToken && this.plugin.settings.selectedApi) {
            const cachedModels = localStorage.getItem('models');
            if (cachedModels) {
                this.models = JSON.parse(cachedModels);
                this.renderModels(modelContainer);
            } else {
                await this.loadModels(this.plugin.settings.selectedApi, modelContainer);
            }
        } else {
            modelContainer.createEl('p', { 
                text: 'Ingresa un API token para ver los modelos disponibles.'
            });
        }

        const optionsContainer = containerEl.createDiv();
        optionsContainer.createEl('h3', { text: 'Opciones del modelo' });

        new Setting(optionsContainer)
            .setName('Streaming')
            .setDesc('Selecciona esta opción si deseas que el texto se vaya agregando a tu nota mientras se va generando.')
            .addToggle(toggle => {                
                toggle.setValue(this.plugin.settings.stream)
                    .onChange(async (value: boolean) => {
                        this.plugin.settings.stream = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(optionsContainer)
            .setName('Prefijo del prompt')
            .setDesc('Aquí puedes cambiar el prefijo del prompt que le vamos a enviar a la API. Luego de este texto vendrá el texto seleccionado.')
            .addTextArea(textArea => {               
                textArea.setValue(this.plugin.settings.prefixPrompt || '')
                    .onChange(async (value: string) => {
                        this.plugin.settings.prefixPrompt = value;
                        await this.plugin.saveSettings();
                    });
            });

        new Setting(optionsContainer)
            .setName('Máximo de tokens')
            .setDesc('Máximo de tokens que se pueden generar en la respuesta.')
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
            .setName('Temperatura')
            .setDesc('Controla la aleatoriedad de la respuesta. Un valor más alto significa más aleatoriedad.')
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
            .setDesc('Controla la diversidad de la respuesta. Un valor más bajo significa menos diversidad.')
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
            .setName('Penalización de presencia')
            .setDesc('Controla la penalización por presencia. Un valor más alto significa menos repetición.')
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
            .setName('Penalización de frecuencia')
            .setDesc('Controla la penalización por frecuencia. Un valor más alto significa menos repetición.')  
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
    }

    async loadModels(apiProvider: string, container: any = null) {
        try {
            // Limpiamos los modelos anteriores si se proporciona un contenedor
            if (container) {
                container.empty();
                container.createEl('h3', { text: 'Modelos Disponibles' });
            }

            // Si no hay token, no podemos cargar modelos
            if (!this.plugin.settings.apiToken) {
                if (container) {
                    container.createEl('p', { 
                        text: 'Ingresa un API token para ver los modelos disponibles.'
                    });
                }
                return;
            }

            // Crear la instancia de API adecuada usando la factory
            const api = this.apiFactory.createApi(
                apiProvider,
                this.plugin.settings.apiToken
            );

            // Mostrar un mensaje de carga
            if (container) {
                const loadingEl = container.createEl('p', { 
                    text: 'Cargando modelos...'
                });
                
                // Obtener modelos de la API
                this.models = await api.getAvailableModels();
                localStorage.setItem('models', this.models ? JSON.stringify(this.models) : '[]');
                
                // Eliminar mensaje de carga
                loadingEl.remove();

                this.renderModels(container);
            }
        } catch (error) {
            console.error('Error al cargar los modelos:', error);
            
            if (container) {
                container.createEl('p', { 
                    text: `Error al cargar los modelos: ${error.message}`,
                    cls: 'error-message'
                }).style.color = 'red';
            }
        }
    }

    renderModels(container: any) {
        // Crear un elemento de configuración para seleccionar el modelo por defecto
        if (this.models && this.models.length > 0) {
            new Setting(container)
                .setName('Modelo por defecto')
                .setDesc('Selecciona el modelo que se usará por defecto')
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
                text: 'No se encontraron modelos disponibles para esta API.'
            });
        }
    }
}