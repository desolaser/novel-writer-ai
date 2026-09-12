import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';
import { toLlamaCppBody, type CompletionOptions } from '../utils/provider-options';
import { parseSSEStream } from '../utils/sseStream';

export class LlamaCppApi extends ApiInterface {
    baseUrl: string = "http://127.0.0.1:8080";

    constructor(apiKey: string) {
        super(apiKey);
    }

    async getAvailableModels(): Promise<Model[]> {
        try {
            const response = await fetch(`${this.baseUrl}/v1/models`, {
                method: "GET",
                headers: { 'Content-Type': 'application/json' },
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error fetching models: ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();

            return data.data.map((model: any) => ({
                id: model.id,
                name: model.id,
                description: '',
            }));
        } catch (error) {
            console.error('Error in LlamaCppApi.getAvailableModels:', error);
            throw error;
        }
    }

    async generateCompletion(prompt: string, model: string, options: CompletionOptions = {}): Promise<CompletionResponse> {
        try {
            const messages = options.messages ?? [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt },
            ];

            const body = toLlamaCppBody(model, messages, options);

            const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Error generating text: ${errorData.error?.message || response.statusText}`);
            }

            if (body.stream && response.body) {
                const stream = parseSSEStream(response.body);
                return { stream, model };
            }

            const data = await response.json();

            return {
                text: data.choices[0].message.content,
                usage: data.usage,
                model: data.model,
            };
        } catch (error) {
            console.error('Error in LlamaCppApi.generateCompletion:', error);
            throw error;
        }
    }

    async validateApiKey(): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/health`);
            return response.ok;
        } catch {
            return false;
        }
    }
}
