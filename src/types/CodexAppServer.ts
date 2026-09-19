export interface CodexRpcMessage {
	id?: number | string;
	method?: string;
	params?: any;
	result?: any;
	error?: { code?: number; message?: string; data?: any };
}

export interface CodexCatalogModel {
	id: string;
	model: string;
	displayName: string;
	description: string;
	hidden: boolean;
	supportedReasoningEfforts: Array<{ reasoningEffort: string; description: string }>;
	inputModalities: string[];
}

export interface CodexProcessResult {
	code: number;
	stdout: string;
	stderr: string;
}
