const providers = {
    openrouter: "openrouter",
    deepseek: "deepseek",
    ooba: "ooba",
    ollama: "ollama",
    opencodezen: "opencodezen",
    opencodego: "opencodego",
    novelai: "novelai"
};

type ApiProvider = "openrouter" | "deepseek" | "ooba" | "ollama" | "opencodezen" | "opencodego" | "novelai";

export default providers;
export type { ApiProvider };
