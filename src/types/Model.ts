type Model = {
    id: string;
    name: string;
    description: string;
    contextLength?: number | null;
    pricing?: string;
    /** The provider reports that this model can return generated images. */
    supportsImageGeneration?: boolean;
    /** The provider reports that this model can accept images as input (vision). */
    supportsVision?: boolean;
};

export type {
    Model
};
