// Tipos base del dominio. Puros, sin dependencia de Obsidian ni React.

/** Identificador unico de entidad (UUID v7 recomendado). */
export type EntityId = string;

/** Timestamp ISO-8601 (UTC). */
export type ISODate = string;

/** Tipo de valor que puede tomar un Detalle en una EntradaCodex. */
export type DetalleValor =
	| string // text | line | nombre de opcion (dropdown resuelto) | nombre de entry (codex_ref resuelto)
	| null; // presente pero vacio

/** Como se incluye una entrada de codex en el contexto de IA. */
export enum AiContextPolicy {
	/** Siempre incluir en contexto. */
	Always = 'always',
	/** Incluir solo si es detectado por nombre/alias. */
	OnDetect = 'on_detect',
	/** No incluir en el contexto de IA, incluso si es detectado. */
	NeverIfDetected = 'never_if_detected',
	/** Nunca incluir. */
	Never = 'never',
}

/** Tipo de un Detalle. */
export enum TipoDetalle {
	/** Textarea con multiples filas. */
	Text = 'text',
	/** Inputtext de una linea. */
	Line = 'line',
	/** Listado de opciones (OpcionDetalle). */
	Dropdown = 'dropdown',
	/** FK a otra entrada de Codex. */
	CodexRef = 'codex_ref',
}

/** Rol de un Mensaje de chat. */
export type MessageRole = 'user' | 'assistant';

/** Brindar timestamp actual ISO-8601. Helper puro. */
export function nowISO(): ISODate {
	return new Date().toISOString();
}