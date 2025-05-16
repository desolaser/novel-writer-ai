import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

export class ApiInterface {
    apiKey = "";

    constructor(apiKey: string) {
        if (this.constructor === ApiInterface) {
            throw new Error("ApiInterface es una clase abstracta y no puede ser instanciada directamente");
        }
        this.apiKey = apiKey;
    }

    async getAvailableModels(): Promise<Model[]> {
        throw new Error("El método getAvailableModels debe ser implementado por las clases hijas");
    }

    async generateCompletion(prompt: string, model: string, options = {}): Promise<CompletionResponse> {
        throw new Error("El método generateCompletion debe ser implementado por las clases hijas");
    }

    async validateApiKey(): Promise<boolean> {
        throw new Error("El método validateApiKey debe ser implementado por las clases hijas");
    }
}