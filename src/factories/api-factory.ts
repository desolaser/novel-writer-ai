import { ApiInterface } from '../interfaces/api-interface';
import { DeepseekApi } from '../apis/deepseek-api';
import { OpenRouterApi } from '../apis/openrouter-api';
import { TextGenerationWebuiApi } from '../apis/text-generation-webui-api';
import { OllamaApi } from '../apis/ollama-api';

export class ApiFactory {
    createApi(provider: string, apiKey: string): ApiInterface {
        switch (provider.toLowerCase()) {
            case 'deepseek':
                return new DeepseekApi(apiKey);
            case 'openrouter':
                return new OpenRouterApi(apiKey);
            case 'ooba':
                return new TextGenerationWebuiApi(apiKey);
            case 'ollama':
                return new OllamaApi(apiKey);
            default:
                throw new Error(`Proveedor de API no soportado: ${provider}`);
        }
    }
}
