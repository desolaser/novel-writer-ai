import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

/**
 * Implementación específica para la API de NovelAI
 */
export class NovelAiApi extends ApiInterface {
    apiKey: string = "";
    baseUrl: string = "https://api.novelai.net";
    TEXT_URL = "https://text.novelai.net";

    private static readonly MODELS: Model[] = [
        { id: "xialong-v1", name: "Xialong (GLM-4.6)", description: "" },
        { id: "llama-3-erato-v1", name: "Erato (Llama 3)", description: "" },
        { id: "kayra-v1", name: "Kayra", description: "" },
    ];

    /**
     * Modelos que usan el endpoint OpenAI-compatible (/v1/chat/completions)
     * en lugar de los endpoints tradicionales de NovelAI (/ai/generate)
     */
    private static readonly OPENAI_COMPATIBLE_MODELS: string[] = [
        "xialong-v1",
    ];

    constructor(apiKey: string) {
        super(apiKey);
        this.apiKey = apiKey;
    }

    /**
     * Determina si un modelo usa el endpoint OpenAI-compatible
     */
    private isOpenAICompatibleModel(model: string): boolean {
        return NovelAiApi.OPENAI_COMPATIBLE_MODELS.includes(model);
    }

    /**
     * Devuelve los modelos disponibles de NovelAI (hardcodeados)
     */
    async getAvailableModels(): Promise<Model[]> {
        return NovelAiApi.MODELS;
    }

    /**
     * Genera una respuesta usando la API de NovelAI
     * 
     * Para modelos como xialong-v1, usa el endpoint OpenAI-compatible /v1/chat/completions. 
     * Para el resto, usa los endpoints tradicionales de NovelAI
     */
    async generateCompletion(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        try {
            // Detectar si el modelo usa el endpoint OpenAI-compatible
            if (this.isOpenAICompatibleModel(model)) {
                return this.generateOpenAICompatible(prompt, model, options);
            }

            // Modelos tradicionales de NovelAI (kayra, erato, etc.)
            return this.generateLegacy(prompt, model, options);
        } catch (error) {
            console.error('Error en NovelAiApi.generateCompletion:', error);
            throw error;
        }
    }

    /**
     * Genera una respuesta usando el endpoint OpenAI-compatible /v1/chat/completions
     * para modelos como xialong-v1.
     */
    private async generateOpenAICompatible(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        const defaultOptions: Record<string, any> = {
            temperature: 0.7,
            max_tokens: 1000,
            stream: false,
        };

        const requestOptions: Record<string, any> = { ...defaultOptions, ...options };

        // Construir mensajes: usar los proporcionados en options o crear desde prompt
        const messages = requestOptions.messages ?? [
            { role: "user", content: prompt }
        ];

        // Construir el body en formato OpenAI-compatible
        // TODO: Investigar como devolver texto coherente sin streaming
        const data: Record<string, any> = {
            model: model,
            messages: messages,
            temperature: requestOptions.temperature,
            max_tokens: requestOptions.max_tokens,
            stream: true, // No es posible generar sin streaming, el endpoint no devuelve texto coherente en modo no streaming
            top_p: requestOptions.top_p ?? 0.9,
            frequency_penalty: requestOptions.frequency_penalty ?? 0,
            presence_penalty: requestOptions.presence_penalty ?? 0,
        };

        // Añadir stop sequences si existen
        if (requestOptions.stop) {
            data.stop = requestOptions.stop;
        }

        const endpoint = '/oa/v1/chat/completions';

        const response = await fetch(`${this.TEXT_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = response.statusText;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.message || errorData.error?.message || JSON.stringify(errorData);
            } catch {
                errorMessage = errorText || response.statusText;
            }
            throw new Error(`NovelAI API error (${endpoint}): ${errorMessage}`);
        }

        if (response.body) {
            const stream = this.parseOpenAIStream(response.body);
            return {
                stream,
                model,
            };
        }

        return {
            text: "",
            model
        }
    }

    /**
     * Genera una respuesta usando los endpoints tradicionales de NovelAI
     * (/ai/generate o /ai/generate-stream)
     */
    private async generateLegacy(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        const defaultOptions: Record<string, any> = {
            temperature: 0.7,
            max_tokens: 1000,
            stream: false,
        };

        const requestOptions: Record<string, any> = { ...defaultOptions, ...options };

        // Construir el body según el formato de NovelAI
        const data: Record<string, any> = {
            input: prompt,
            model: model,
            parameters: {
                bad_words_ids: [[0]],
                bracket_ban: true,
                cfg_scale: 0,
                cfg_uc: "",
                cropped_token: 0,
                eos_token_id: 0,
                force_emotion: true,
                generate_until_sentence: true,
                line_start_ids: [[0]],
                logit_bias_exp: [
                    {
                        bias: 0,
                        ensure_sequence_finish: true,
                        generate_once: true,
                        sequence: [0],
                    }
                ],
                math1_quad: 0,
                math1_quad_entropy_scale: 0,
                math1_temp: 0,
                max_length: requestOptions.max_tokens,
                min_p: 1,
                mirostat_lr: 1,
                mirostat_tau: 0,
                num_logprobs: 30,
                order: [0],
                phrase_rep_pen: "off",
                prefix: "",
                repetition_penalty: requestOptions.frequency_penalty ?? 0,
                repetition_penalty_range: 2048,
                repetition_penalty_slope: 0,
                repetition_penalty_frequency: 0,
                repetition_penalty_presence: requestOptions.presence_penalty ?? 0,
                repetition_penalty_whitelist: [0],
                stop_sequences: [[0]],
                tail_free_sampling: 1,
                temperature: requestOptions.temperature,
                top_a: 0,
                top_g: 0,
                top_k: 0,
                top_p: requestOptions.top_p ?? 0.0,
                typical_p: 0,
                use_string: true,
                valid_first_tokens: [0]
            },
            prefix: ""
        };

        const endpoint = requestOptions.stream ? '/ai/generate-stream' : '/ai/generate';

        const response = await fetch(`${this.TEXT_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(data),
        });

        if (!response.ok) {
            const errorText = await response.text();
            let errorMessage = response.statusText;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.message || JSON.stringify(errorData);
            } catch {
                errorMessage = errorText || response.statusText;
            }
            throw new Error(`NovelAI API error: ${errorMessage}`);
        }

        // Si es streaming, procesar el stream SSE
        if (requestOptions.stream && response.body) {
            const stream = this.parseSSEStream(response.body);
            return {
                stream,
                model,
            };
        }

        // Respuesta normal: NovelAI devuelve un JSON con el campo 'text'
        const result = await response.json();
        return {
            text: result.output || '',
            model,
        };
    }

    /**
     * Valida si el API token de NovelAI es correcto
     * GET /user/subscription
     */
    async validateApiKey(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/user/subscription`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
            });

            return response.ok;
        } catch (error) {
            console.error('Error validando API key de NovelAI:', error);
            return false;
        }
    }

    /**
     * Procesa un stream SSE para el endpoint OpenAI-compatible
     * Formato: data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"text"},"index":0}]}
     */
    private async *parseOpenAIStream(body: ReadableStream<Uint8Array>): AsyncGenerator<any, void, unknown> {
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop()!; // La última línea puede estar incompleta

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.replace(/^data:\s*/, '');
                    if (data === '[DONE]') return;
                    try {
                        const parsed = JSON.parse(data);

                        // Transformar el chunk al formato esperado por el consumidor
                        // Extraer el texto del chunk
                        let text = '';
                        if (parsed.choices && parsed.choices.length > 0) {
                            const choice = parsed.choices[0];
                            if (choice.delta?.content) {
                                text = choice.delta.content;
                            }
                            else if (choice.message?.content) {
                                text = choice.message.content;
                            }
                            else if (choice.text) {
                                text = choice.text;
                            }
                        }

                        yield {
                            ...parsed,
                            text: text,
                        };
                    } catch (err) {
                        throw new Error(`NovelAI API error: ${err}`);
                    }
                }
            }
        }
    }

    /**
     * Procesa un stream SSE (Server-Sent Events) para endpoints tradicionales
     */
    private async *parseSSEStream(body: ReadableStream<Uint8Array>): AsyncGenerator<any, void, unknown> {
        console.log({ body })
        const reader = body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split('\n');
            buffer = lines.pop()!; // La última línea puede estar incompleta

            for (const line of lines) {
                if (line.startsWith('data:')) {
                    const data = line.replace(/^data:\s*/, '');
                    if (data === '[DONE]') return;
                    try {
                        const parsed = JSON.parse(data);
                        yield parsed;
                    } catch {
                        // Puede haber keep-alive u otros eventos no JSON
                    }
                }
            }
        }
    }
}
