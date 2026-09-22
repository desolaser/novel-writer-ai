/** Features select a saved profile by purpose, independently of output length. */
export type ModelPurpose = 'chat' | 'writing' | 'utilities';

export type ModelAssignments = Record<ModelPurpose, string>;
