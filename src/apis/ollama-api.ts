import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';
import { toOllamaOptions, toOllamaThink, type CompletionOptions } from '../utils/provider-options';

export class OllamaApi extends ApiInterface {
    baseUrl: string = "http://localhost:11434";

    constructor(apiKey: string) {
        super(apiKey);
    }

    async getAvailableModels(): Promise<Model[]> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            if (!response.ok) throw new Error('Failed to fetch models');
            const data = await response.json();
            
            return data.models.map((model: any) => ({
                id: model.name,
                name: model.name,
                description: '',
                contextLength: 0,
                pricing: "",
            }));
        } catch (error) {
            console.error('Error en OllamaApi.getAvailableModels:', error);
            throw error;
        }
    }

    async generateCompletion(
        prompt: string,
        model: string,
        options: CompletionOptions = {}
    ): Promise<CompletionResponse> {
        try {
            const isStream = options.stream ?? true;

            const response = await fetch(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: options.messages ?? [
                        {
                            role: "system",
                            content: `You are an assistant for creative writing.`
                        },
                        { role: "user", content: prompt }
                    ],
                    stream: isStream,
                    think: toOllamaThink(options),
                    options: toOllamaOptions(options)
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Ollama error: ${errorText}`);
            }

            if (isStream) {
                const reader = response.body?.getReader();
                if (!reader) throw new Error('No response body for stream');

                const stream = new ReadableStream({
                    async start(controller) {
                        const decoder = new TextDecoder();
                        let buffer = '';
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) break;
                            buffer += decoder.decode(value, { stream: true });
                            const lines = buffer.split('\n');
                            buffer = lines.pop() || '';
                            for (const line of lines) {
                                if (!line.trim()) continue;
                                try {
                                    const json = JSON.parse(line);
                                    const content = json.message?.content || '';
                                    if (content) {
                                        controller.enqueue({
                                            choices: [{ delta: { content } }]
                                        });
                                    }
                                    if (json.done) {
                                        controller.close();
                                        return;
                                    }
                                } catch (e) {}
                            }
                        }
                        if (buffer.trim()) {
                            try {
                                const json = JSON.parse(buffer);
                                const content = json.message?.content || '';
                                if (content) {
                                    controller.enqueue({
                                        choices: [{ delta: { content } }]
                                    });
                                }
                            } catch (e) {}
                        }
                        controller.close();
                    }
                });
                return { stream: stream as any, model };
            } else {
                const data = await response.json();
                return { text: data.message?.content || '', model };
            }
        } catch (error) {
            console.error('Error en OllamaApi.generateCompletion:', error);
            throw error;
        }
    }

    async validateApiKey(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/api/tags`);
            return response.ok;
        } catch (error) {
            return false;
        }
    }
}
