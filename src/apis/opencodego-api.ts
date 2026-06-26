import { requestUrl } from 'obsidian';
import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

/**
 * Modelos que usan el endpoint Anthropic-compatible (/v1/messages)
 * Los modelos MiniMax y Qwen usan este formato.
 */
const ANTHROPIC_MODELS = new Set([
    'minimax-m3',
    'minimax-m2.7',
    'minimax-m2.5',
    'qwen3.7-max',
    'qwen3.7-plus',
    'qwen3.6-plus',
]);

/**
 * Implementación específica para la API de OpenCode Go
 * API: https://opencode.ai/zen/go/v1
 * 
 * OpenCode Go es un servicio de pago que da acceso a múltiples modelos.
 * - La mayoría usa /chat/completions (OpenAI-compatible)
 * - MiniMax y Qwen usan /messages (Anthropic-compatible)
 * 
 * Usa requestUrl de Obsidian para evitar problemas de CORS.
 */
export class OpenCodeGoApi extends ApiInterface {
    apiKey: string = ""
    baseUrl: string = "https://opencode.ai/zen/go/v1";

    constructor(apiKey: string) {
        super(apiKey);
        this.apiKey = apiKey;
    }

    /**
     * Determina si un modelo usa el endpoint Anthropic /messages
     */
    private isAnthropicModel(modelId: string): boolean {
        return ANTHROPIC_MODELS.has(modelId) ||
            modelId.startsWith('minimax-') ||
            modelId.startsWith('qwen');
    }

    /**
     * Obtiene los modelos disponibles de OpenCode Go
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
            return (data.data || []).map((model: any) => {
                const modelId = model.id;
                const endpointType = this.isAnthropicModel(modelId) ? 'Anthropic' : 'OpenAI';

                return {
                    id: modelId,
                    name: `${model.id} (${endpointType})`,
                    description: model?.description || model?.owned_by || '',
                    contextLength: model?.context_length || null,
                    pricing: model?.pricing ? `$${model.pricing.prompt}/1K prompt, $${model.pricing.completion}/1K completion` : null
                };
            });
        } catch (error) {
            console.error('Error en OpenCodeGoApi.getAvailableModels:', error);
            throw error;
        }
    }

    /**
     * Genera una respuesta usando el endpoint apropiado según el modelo.
     * Usa requestUrl de Obsidian para evitar CORS.
     * 
     * Nota: requestUrl no soporta streaming, por lo que las solicitudes stream
     * se convierten automáticamente a no-streaming.
     */
    async generateCompletion(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        try {
            if (this.isAnthropicModel(model)) {
                return this.generateAnthropicCompletion(prompt, model, options);
            } else {
                return this.generateOpenAICompletion(prompt, model, options);
            }
        } catch (error) {
            console.error('Error en OpenCodeGoApi.generateCompletion:', error);
            throw error;
        }
    }

    /**
     * Genera una respuesta usando el endpoint OpenAI-compatible /chat/completions
     */
    private async generateOpenAICompletion(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        const messages = options.messages ?? [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: prompt }
        ];

        const defaultOptions = {
            model,
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
    }

    /**
     * Genera una respuesta usando el endpoint Anthropic-compatible /messages
     * Formato: https://docs.anthropic.com/en/api/messages
     */
    private async generateAnthropicCompletion(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        const messages = options.messages ?? [
            { role: "user", content: prompt }
        ];

        // Extraer system prompt si existe (Anthropic lo maneja aparte)
        let systemPrompt = '';
        const filteredMessages = messages.filter((msg: any) => {
            if (msg.role === 'system') {
                systemPrompt = msg.content;
                return false;
            }
            return true;
        });

        const maxTokens = options.max_tokens || 1000;
        const temperature = options.temperature ?? 0.7;

        // Construir el body en formato Anthropic
        const anthropicBody: Record<string, any> = {
            model,
            messages: filteredMessages,
            max_tokens: maxTokens,
            temperature,
            stream: false,
        };

        // Anthropic pone el system prompt como campo separado
        if (systemPrompt) {
            anthropicBody.system = systemPrompt;
        }

        // Los endpoints Anthropic de OpenCode Go pueden requerir
        // x-api-key en lugar de Authorization: Bearer
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };

        // Enviar la API key en ambos formatos para compatibilidad
        headers['Authorization'] = `Bearer ${this.apiKey}`;
        headers['x-api-key'] = this.apiKey;

        const response = await requestUrl({
            url: `${this.baseUrl}/messages`,
            method: 'POST',
            headers,
            body: JSON.stringify(anthropicBody),
            throw: false,
        });

        if (response.status !== 200) {
            const errorData = response.json;
            console.log({ error: errorData.error });
            throw new Error(`Error al generar texto: ${errorData.error?.message || response.status}`);
        }

        const data = response.json;

        // El formato de respuesta Anthropic es:
        // { content: [{ type: "text", text: "..." }], ... }
        const text = data.content
            ?.filter((block: any) => block.type === 'text')
            ?.map((block: any) => block.text)
            ?.join('') || '';

        return {
            text,
            usage: data.usage ?? null,
            model: data.model || model
        };
    }

    /**
     * Valida si el API token de OpenCode Go es correcto
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
            console.error('Error validando API key de OpenCode Go:', error);
            return false;
        }
    }
}
