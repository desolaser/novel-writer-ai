import { EntityId } from '../domain/types';

/** Version actual del schema de carpeta de novela. */
export const NOVELA_SCHEMA_VERSION = 1;

/** Nombre del archivo de metadata de una novela dentro de su carpeta. */
export const NOVELA_META_FILE = '__metadata.json';

/** Nombre del archivo de config (overrides) dentro de la carpeta de novela. */
export const NOVELA_CONFIG_FILE = '__config.json';

/** Subcarpetas creadas por novela. */
export const NOVELA_SUBFOLDERS = ['escritura', 'codex', 'images'] as const;

/** Subcarpeta interna de codex para imagenes de entradas (si se usa). */
export const CODEX_IMAGES_SUBFOLDER = 'images';

/** 10 colores preestablecidos para categorias, opciones, tags y entries. */
export const DEFAULT_COLORS: string[] = [
	'#e74c3c', // rojo
	'#e67e22', // naranja
	'#f1c40f', // amarillo
	'#2ecc71', // verde
	'#1abc9c', // teal
	'#3498db', // azul
	'#9b59b6', // violeta
	'#e91e63', // pink
	'#95a5a6', // gris
	'#34495e', // gris oscuro
];

/** Categorias por defecto de una novela nueva. Ellas no son borrables. */
export const DEFAULT_CATEGORIES: { nombre: string; color: string }[] = [
	{ nombre: 'Characters', color: '#' },
	{ nombre: 'Locations', color: '#' },
	{ nombre: 'Objects', color: '#' },
	{ nombre: 'Lore', color: '#' },
	{ nombre: 'Subplot', color: '#' },
	{ nombre: 'Others', color: '#' },
];

/** Asignacion de colores predefinidos a las categorias por defecto (indice en DEFAULT_COLORS). */
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
	Characters: '0',
	Locations: '1',
	Objects: '2',
	Lore: '3',
	Subplot: '4',
	Others: '5',
};

/** Helper: color real para un nombre de categoria default. */
export function defaultCategoryColor(nombre: string): string {
	const idx = DEFAULT_CATEGORY_COLORS[nombre];
	return idx !== undefined ? DEFAULT_COLORS[Number(idx)] : DEFAULT_COLORS[5];
}