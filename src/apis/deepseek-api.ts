import OpenAI from "openai";
import { ApiInterface } from '../interfaces/api-interface';
import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

export class DeepseekApi extends ApiInterface {
    openai: OpenAI | null = null;
    apiKey: string = ""
    baseUrl: string = "https://api.deepseek.com/v1";

    constructor(apiKey: string) {
        super(apiKey);
        this.openai = new OpenAI({
            baseURL: this.baseUrl,
            apiKey,            
            dangerouslyAllowBrowser: true
        });
    }

    /**
     * Obtiene los modelos disponibles de DeepSeek
     */
    async getAvailableModels(): Promise<Model[]> {
        if (!this.openai) {
            return [];
        }

        try {
            const models: Model[] = [];

            const modelsPage = await this.openai.models.list()
            for await (const model of modelsPage) {
                models.push({
                    id: model.id,
                    name: model.id,
                    description: model?.object || '',
                    contextLength: 0,
                    pricing: "",
                });
            }

            return models;
        } catch (error) {
            console.error('Error en DeepseekApi.getAvailableModels:', error);
            throw error;
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
        if (!this.openai) {
            return {
                text: "",
                model: ""
            };
        }

        try {
            // Construir el mensaje para el endpoint de chat
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

            console.log({ defaultOptions });

            const completion: any = await this.openai.chat.completions.create(defaultOptions);

            // Manejar streaming
            if (
                defaultOptions.stream &&
                completion &&
                typeof completion[Symbol.asyncIterator] === "function"
            ) {
                // Retornar el AsyncIterable para que el consumidor procese el stream
                return {
                    stream: completion as AsyncIterable<any>,
                    model
                };
            }
            // Manejar respuesta normal
            else if (completion && Array.isArray(completion.choices)) {
                return {
                    text: completion.choices?.[0]?.message?.content || "",
                    usage: completion.usage ?? null,
                    model
                };
            } else {
                return {
                    text: "",
                    model
                };
            }
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
            const response = await fetch(`${this.baseUrl}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });
            
            return response.ok;
        } catch (error) {
            console.error('Error validando API key de DeepSeek:', error);
            return false;
        }
    }
}