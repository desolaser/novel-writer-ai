type Model = {
    id: string;
    name: string;
    description: string;
    contextLength?: number | null;
    pricing?: string;
    /** The provider reports that this model can return generated images. */
    supportsImageGeneration?: boolean;
};

export type {
    Model
};
