import { requestUrl } from 'obsidian';
import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

/**
 * Implementación específica para la API de OpenCode Zen
 * API compatible con OpenAI: https://opencode.ai/zen/v1
 * Los modelos usan el formato: opencode/<model-id>
 * 
 * Usa requestUrl de Obsidian para evitar problemas de CORS
 * al ejecutarse desde app://obsidian.md
 */
export class OpenCodeZenApi extends ApiInterface {
    apiKey: string = ""
    baseUrl: string = "https://opencode.ai/zen/v1";

    constructor(apiKey: string) {
        super(apiKey);
        this.apiKey = apiKey;
    }

    /**
     * Obtiene los modelos disponibles de OpenCode Zen
     */
    async getAvailableModels(): Promise<Model[]> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/models`,
                method: "GET",
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                throw: false,
            });

            if (response.status !== 200) {
                throw new Error(`Error al obtener modelos: ${response.status}`);
            }

            const data = response.json;

            // Transformar la respuesta al formato común para todas las APIs
            // OpenCode Zen devuelve modelos en formato OpenAI-compatible
            return (data.data || []).map((model: any) => ({
                id: `opencode/${model.id}`,
                name: model.id,
                description: model?.description || model?.owned_by || '',
                contextLength: model?.context_length || null,
                pricing: model?.pricing ? `$${model.pricing.prompt}/1K prompt, $${model.pricing.completion}/1K completion` : null
            }));
        } catch (error) {
            console.error('Error en OpenCodeZenApi.getAvailableModels:', error);
            throw error;
        }
    }

    /**
     * Genera una respuesta usando el endpoint de chat completions de OpenCode Zen
     * Usa requestUrl de Obsidian para evitar CORS.
     * Nota: requestUrl no soporta streaming, por lo que las solicitudes stream
     * se convierten automáticamente a no-streaming.
     */
    async generateCompletion(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        try {
            // El modelo se almacena como "opencode/<model-id>" en la UI,
            // pero la API espera el ID sin el prefijo "opencode/"
            const apiModel = model.startsWith('opencode/') ? model.slice('opencode/'.length) : model;

            // Construir el mensaje para el endpoint de chat
            const messages = options.messages ?? [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt }
            ];

            const defaultOptions = {
                model: apiModel,
                messages,
                temperature: 0.7,
                max_tokens: 1000,
                stream: false,
                ...options
            };

            // requestUrl no soporta streaming, así que forzamos stream=false
            const body = JSON.stringify({
                model: defaultOptions.model,
                messages: defaultOptions.messages,
                temperature: defaultOptions.temperature,
                max_tokens: defaultOptions.max_tokens,
                stream: false,
                ...(options.top_p !== undefined ? { top_p: options.top_p } : {}),
                ...(options.presence_penalty !== undefined ? { presence_penalty: options.presence_penalty } : {}),
                ...(options.frequency_penalty !== undefined ? { frequency_penalty: options.frequency_penalty } : {})
            });

            const response = await requestUrl({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body,
                throw: false,
            });

            if (response.status !== 200) {
                const errorData = response.json;
                console.log({ error: errorData.error });
                throw new Error(`Error al generar texto: ${errorData.error?.message || response.status}`);
            }

            const data = response.json;
            return {
                text: data.choices?.[0]?.message?.content || "",
                usage: data.usage ?? null,
                model: data.model || model
            };
        } catch (error) {
            console.error('Error en OpenCodeZenApi.generateCompletion:', error);
            throw error;
        }
    }

    /**
     * Valida si el API token de OpenCode Zen es correcto
     */
    async validateApiKey() {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                throw: false,
            });

            return response.status === 200;
        } catch (error) {
            console.error('Error validando API key de OpenCode Zen:', error);
            return false;
        }
    }
}
