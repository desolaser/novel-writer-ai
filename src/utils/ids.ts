// Generador de IDs tipo UUID v7 (48-bit timestamp + 4-bit version + random),
// sin dependencias. Formato 8-4-4-4-12 (36 chars). Suficiente para distinguir
// entidades del plugin dentro de un vault.

export function genId(): string {
	const ts = Date.now();
	const tsHex = ts.toString(16).padStart(12, '0');           // 12 hex = 48 bits
	const randA = (Math.random() * 0x0fff) | 0;                  // 12 bits
	const randAHex = randA.toString(16).padStart(3, '0');        // 3 hex
	const variant = (((Math.random() * 0x3fff) | 0) & 0x0fff) | 0x8000; // variant 10xx
	const variantHex = variant.toString(16).padStart(4, '0');    // 4 hex
	const randB = Math.floor(Math.random() * 0xffffffffffff);    // 48 bits
	const randBHex = randB.toString(16).padStart(12, '0');       // 12 hex

	// version 7 nibble en bloque 3
	return [
		tsHex.slice(0, 8),
		tsHex.slice(8, 12),
		'7' + randAHex,
		variantHex,
		randBHex,
	].join('-');
}