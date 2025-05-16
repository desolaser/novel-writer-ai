import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

/**
 * Implementación específica para la API de OpenRouter
 */
export class OpenRouterApi extends ApiInterface {
    apiKey: string = ""
    baseUrl: string = "https://openrouter.ai/api/v1";

    constructor(apiKey: string) {
        super(apiKey);
    }

    /**
     * Obtiene los modelos disponibles de OpenRouter
     */
    async getAvailableModels(): Promise<Model[]> {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://obsidian.md',
                    'X-Title': 'Obsidian AI Plugin'
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error al obtener modelos: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            
            // Transformar la respuesta al formato común para todas las APIs
            return data.data.map((model: any) => ({
                id: model.id,
                name: model.name || model.id,
                description: model.description || '',
                contextLength: model.context_length || null,
                pricing: model.pricing ? `$${model.pricing.prompt}/1K prompt, $${model.pricing.completion}/1K completion` : null
            }));
        } catch (error) {
            console.error('Error en OpenRouterApi.getAvailableModels:', error);
            throw error;
        }
    }

    /**
     * Genera una respuesta usando el modelo especificado de OpenRouter
     */
    async generateCompletion(prompt: string, model: string, options = {}): Promise<CompletionResponse | Response> {
        try {
            const defaultOptions = {
                temperature: 0.7,
                max_tokens: 1000,
                stream: false
            };

            const requestOptions = { ...defaultOptions, ...options };

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://obsidian.md',
                    'X-Title': 'Obsidian AI Plugin'
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: "user", content: prompt }
                    ],
                    temperature: requestOptions.temperature,
                    max_tokens: requestOptions.max_tokens,
                    stream: requestOptions.stream
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error al generar texto: ${errorData.error?.message || response.statusText}`);
            }

            // Si es streaming, devolver la respuesta directamente
            if (requestOptions.stream) {
                return response;
            }

            const data = await response.json();
            return {
                text: data.choices[0].message.content,
                usage: data.usage,
                model: data.model
            };
        } catch (error) {
            console.error('Error en OpenRouterApi.generateCompletion:', error);
            throw error;
        }
    }

    /**
     * Valida si el API token de OpenRouter es correcto
     * @returns {Promise<boolean>} - True si el token es válido
     */
    async validateApiKey() {
        try {
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://obsidian.md',
                    'X-Title': 'Obsidian AI Plugin'
                }
            });
            
            return response.ok;
        } catch (error) {
            console.error('Error validando API key de OpenRouter:', error);
            return false;
        }
    }
}