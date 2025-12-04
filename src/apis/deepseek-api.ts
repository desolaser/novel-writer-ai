import OpenAI from "openai";
import { requestUrl } from 'obsidian';
import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

export class DeepseekApi extends ApiInterface {
    apiKey: string = ""
    baseUrl: string = "https://api.deepseek.com";

    constructor(apiKey: string) {
        super(apiKey);
        this.apiKey = apiKey;
    }

    async getAvailableModels(): Promise<Model[]> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`
                },
                throw: false
            });

            if (response.status !== 200) {
                return [];
            }

            const data = response.json;
            return (data.data || []).map((model: any) => ({
                id: model.id,
                name: model.id,
                description: model?.object || '',
                contextLength: 0,
                pricing: "",
            }));
        } catch (error) {
            console.error('Error en DeepseekApi.getAvailableModels:', error);
            return [];
        }
    }

    /**
     * Genera una respuesta usando el endpoint de chat completions de DeepSeek
     */
    async generateCompletion(
        prompt: string,
        model: string,
        options: Record<string, any> = {}
    ): Promise<CompletionResponse> {
        try {
            const messages = options.messages ?? [
                { role: "system", content: "You are a helpful assistant." },
                { role: "user", content: prompt }
            ];
            const body = {
                model,
                messages,
                temperature: options.temperature ?? 0.7,
                max_tokens: options.max_tokens ?? 1000,
                stream: false, // Como deepseek puso CORS para evitar conexiones de Plugins tuve que quitar el streaming porque no funciona con requestUrl
            };

            const response = await requestUrl({
                url: `${this.baseUrl}/chat/completions`,
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                throw: false
            });

            if (response.status !== 200) {
                throw new Error(`API Error: ${response.status}`);
            }

            const completion = response.json;
            if (completion && Array.isArray(completion.choices)) {
                return {
                    text: completion.choices?.[0]?.message?.content || "",
                    usage: completion.usage ?? null,
                    model
                };
            }

            return { text: "", model };
        } catch (error) {
            console.error('Error en DeepseekApi.generateCompletion:', error);
            throw error;
        }
    }

    /**
     * Valida si el API token de DeepSeek es correcto
     */
    async validateApiKey(): Promise<boolean> {
        try {
            const response = await requestUrl({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                throw: false
            });
            
            return response.status === 200;
        } catch (error) {
            console.error('Error validando API key de DeepSeek:', error);
            return false;
        }
    }
}