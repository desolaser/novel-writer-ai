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
                throw new Error(`Error fetching models: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            
            // Transformar la respuesta al formato común para todas las APIs
            return data.data.map((model: any) => ({
                id: model.id,
                name: model.name,
                description: model.description || '',
                contextLength: model.context_length || null,
                pricing: model.pricing ? `$${model.pricing.prompt}/1K prompt, $${model.pricing.completion}/1K completion` : null,
                supportsImageGeneration: model.architecture?.output_modalities?.includes('image') ?? false,
                supportsVision: model.architecture?.input_modalities?.includes('image') ?? false
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

            const { images: _inputImages, ...restOptions } = options as any;
            const requestOptions = { ...defaultOptions, ...restOptions };

            // Build messages: if images are provided, use content array format for vision
            const inputImages: string[] = (Array.isArray(_inputImages) ? _inputImages : []) as string[];
            const userMessage = inputImages.length > 0
                ? { role: "user" as const, content: [
                    { type: "text" as const, text: prompt },
                    ...inputImages.map(url => ({ type: "image_url" as const, image_url: { url } })),
                ]}
                : { role: "user" as const, content: prompt };

            console.log({ requestOptions, apiKey: this.apiKey });

            const response = await fetch(`${this.baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    messages: [userMessage],
                    ...requestOptions
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.log({ error: errorData.error });
                throw new Error(`Error generating text: ${errorData.error?.message || response.statusText}`);
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
            console.log('[OpenRouter] Full response data:', JSON.stringify(data));
            const message = data.choices?.[0]?.message ?? {};
            const content = message.content;
            const contentBlocks = Array.isArray(content) ? content : content ? [content] : [];
            // Search the entire response object for images, not just choices[0].message.
            // OpenRouter may return generated images at the top level (data.images, data.data)
            // or nested inside content arrays that the message-only search would miss.
            const images = this.extractImages(data);
            return {
                text: typeof content === 'string' ? content : contentBlocks.filter((block: any) => block?.type === 'text').map((block: any) => block.text ?? '').join(''),
                ...(images.length ? { images } : {}),
                usage: data.usage,
                model: data.model
            };
        } catch (error) {
            console.error('Error en OpenRouterApi.generateCompletion:', error);
            throw error;
        }
    }

    /**
     * OpenRouter normalizes providers where possible, but image-capable models
     * currently return their image in more than one OpenAI/Gemini-compatible
     * shape. Normalize URL and inline-base64 variants for the chat UI.
     */
    private extractImages(value: any, found = new Set<string>()): string[] {
        if (!value) return [...found];
        if (Array.isArray(value)) {
            value.forEach(item => this.extractImages(item, found));
            return [...found];
        }
        if (typeof value !== 'object') return [...found];

        const addUrl = (url: unknown) => {
            if (typeof url === 'string' && (url.startsWith('data:image/') || /^https?:\/\//.test(url))) found.add(url);
        };
        const inlineData = value.inline_data ?? value.inlineData;
        if (inlineData?.data && typeof inlineData.data === 'string') {
            const mimeType = inlineData.mime_type ?? inlineData.mimeType ?? 'image/png';
            found.add(`data:${mimeType};base64,${inlineData.data}`);
        }
        if (value.b64_json && typeof value.b64_json === 'string') found.add(`data:image/png;base64,${value.b64_json}`);
        if (value.type === 'image_url') addUrl(typeof value.image_url === 'string' ? value.image_url : value.image_url?.url);
        if (value.type === 'image' || value.type === 'output_image') addUrl(value.url ?? value.source?.url);

        // Images can be supplied in message.images, response.data, or content blocks.
        // "choices" and "message" are needed so that a top-level data object can
        // be walked down into data.choices[*].message.* when extractImages
        // receives the full response payload.
        ['choices', 'message', 'images', 'image', 'content', 'parts', 'data', 'image_url', 'source'].forEach(key => {
            const child = value[key];
            if (child && typeof child === 'object') this.extractImages(child, found);
        });
        return [...found];
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
