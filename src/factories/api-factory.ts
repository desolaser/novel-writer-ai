import { ApiInterface } from '../interfaces/api-interface';
import { DeepseekApi } from '../apis/deepseek-api';
import { OpenRouterApi } from '../apis/openrouter-api';

export class ApiFactory {
    createApi(provider: string, apiKey: string): ApiInterface {
        switch (provider.toLowerCase()) {
            case 'deepseek':
                return new DeepseekApi(apiKey);
            case 'openrouter':
                return new OpenRouterApi(apiKey);
            default:
                throw new Error(`Proveedor de API no soportado: ${provider}`);
        }
    }
}