import type { Model } from '../types/Model';
import type { CompletionResponse } from '../types/CompletionResponse';

export class ApiInterface {
    apiKey = "";

    constructor(apiKey: string) {
        if (this.constructor === ApiInterface) {
            throw new Error("ApiInterface is an abstract class and cannot be instantiated directly");
        }
        this.apiKey = apiKey;
    }

    async getAvailableModels(): Promise<Model[]> {
        throw new Error("The getAvailableModels method must be implemented by child classes");
    }

    async generateCompletion(prompt: string, model: string, options = {}): Promise<CompletionResponse> {
        throw new Error("The generateCompletion method must be implemented by child classes");
    }

    async validateApiKey(): Promise<boolean> {
        throw new Error("The validateApiKey method must be implemented by child classes");
    }
}