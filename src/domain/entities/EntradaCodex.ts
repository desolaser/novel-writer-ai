import { EntityId, ISODate, DetalleValor } from '../types';
import { AiContextPolicy } from '../types';

/**
 * Entrada de Codex (lore). Una por archivo JSON dentro de `codex/entradas/`.
 * Incluye referencias externas y valores de detalles embebidos.
 */
export interface ReferenciaExternaEmbed {
	id_referencia_externa: EntityId;
	url: string;
	created_at: ISODate;
	updated_at: ISODate;
}

export interface DetalleValorEmbed {
	id_entrada_codex_detalle: EntityId;
	id_detalle: EntityId;
	/** valor: string | id_opcion_detalle | id_entrada_codex | null */
	valor: DetalleValor;
	created_at: ISODate;
	updated_at: ISODate;
}

export interface EntradaCodex {
	id_entrada_codex: EntityId;
	nombre: string;
	/** Keywords separados por coma. String unico (\"a, b, c\"). */
	alias: string;
	descripcion: string;
	/** Notas privadas del usuario; la IA NUNCA las vera. */
	notas: string;
	/** Id de la categoria. La categoria \"Otros\" se asigna si ninguna. */
	id_categoria: EntityId;
	id_novela: EntityId;
	/** Path relativo del thumbnail, o null. */
	thumbnail: string | null;
	/** Color individual override; si null, hereda de la categoria. */
	color: string | null;
	/** Borrado logico. */
	archivado: boolean;

	// ---- Tracking / AI policy ----
	/** Obtener esta entrada por nombre/alias */
	tracking_por_nombre: boolean;
	/** Matching sensible a mayusculas/minusculas */
	case_sensitive: boolean;
	ai_context_policy: AiContextPolicy;

	// ---- Relaciones embebidas ----
	referencias_externas: ReferenciaExternaEmbed[];
	detalles: DetalleValorEmbed[];

	// ---- N-M (ids) ----
	tags: EntityId[]; // EntradaCodexTag

	created_at: ISODate;
	updated_at: ISODate;
}