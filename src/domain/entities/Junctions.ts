import { EntityId, ISODate } from '../types';

// ---- Relaciones N-M ----

/** Un Detalle puede aplicar a varias Categorias y viceversa. */
export interface DetalleCategoria {
	id_detalle_categoria: EntityId;
	id_detalle: EntityId;
	id_categoria: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}

/** Varias Etiquetas pueden aplicarse a un Capitulo. */
export interface CapituloEtiqueta {
	id_capitulo_etiqueta: EntityId;
	id_capitulo: EntityId;
	id_etiqueta: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}

/** Varias Tags pueden aplicarse a una EntradaCodex. */
export interface EntradaCodexTag {
	id_entrada_codex_tag: EntityId;
	id_entrada_codex: EntityId;
	id_tag: EntityId;
	created_at: ISODate;
	updated_at: ISODate;
}
