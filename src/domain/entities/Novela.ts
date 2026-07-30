import { EntityId, ISODate } from '../types';

/** Novela: historia del usuario. Define una carpeta con su propio lorebook. */
export interface Novela {
	id_novela: EntityId;
	/** Nombre visible (independiente del nombre de carpeta). */
	nombre: string;
	autor: string;
	/** Path relativo (dentro del vault) del thumbnail, o null. */
	thumbnail: string | null;
	/** Version del schema de la carpeta de novela (para migraciones). */
	schema_version: number;
	created_at: ISODate;
	updated_at: ISODate;
}