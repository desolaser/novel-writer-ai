const providers = {
    openrouter: "openrouter",
    deepseek: "deepseek",
    ooba: "ooba",
    ollama: "ollama",
    opencodezen: "opencodezen",
    opencodego: "opencodego"
};

type ApiProvider = "openrouter" | "deepseek" | "ooba" | "ollama" | "opencodezen" | "opencodego";

export default providers;
export type { ApiProvider };
