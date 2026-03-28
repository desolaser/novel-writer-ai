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
        this.apiKey = apiKey;
    }

    /**
     * Obtiene los modelos disponibles de OpenRouter
     */
    async getAvailableModels(): Promise<Model[]> {
        try {
            const response = await fetch("https://openrouter.ai/api/v1/models", {
                method: "GET",
                headers: {},
            });              

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error al obtener modelos: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            
            // Transformar la respuesta al formato común para todas las APIs
            return data.data.map((model: any) => ({
                id: model.id,
                name: model.name,
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
    async generateCompletion(prompt: string, model: string, options = {}): Promise<CompletionResponse> {
        try {
            const defaultOptions = {
                temperature: 0.7,
                max_tokens: 1000,
                stream: false
            };

            const requestOptions = { ...defaultOptions, ...options };

            console.log({ requestOptions, apiKey: this.apiKey });

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    messages: [
                        { role: "user", content: prompt }
                    ],
                    ...requestOptions
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error al generar texto: ${errorData.error?.message || response.statusText}`);
            }

            // Si es streaming, devolver la respuesta directamente
            if (requestOptions.stream && response.body) {
                // Procesar el stream SSE y devolver un AsyncIterable de objetos tipo OpenAI
                const stream = this.parseSSEStream(response.body);
                return {
                    stream,
                    model,
                };
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

    // Añade este método a tu clase
    private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<any, void, unknown> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            let lines = buffer.split('\n');
            buffer = lines.pop()!; // La última línea puede estar incompleta

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.replace(/^data:\s*/, '');
                    if (data === '[DONE]') return;
                    try {
                        const parsed = JSON.parse(data);
                        yield parsed;
                    } catch (e) {
                        // Puede haber keep-alive u otros eventos no JSON
                    }
                }
            }
        }
    }
}