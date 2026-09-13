export function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function groupEntriesByCategory(entradas: any[], categorias: any[], excludeId: string) {
	const groups: { key: string; label: string; entries: any[] }[] = [];
	const byCat = new Map<string, any[]>();
	for (const e of entradas) {
		if (!e || e.archivado) continue;
		if (e.id_entrada_codex === excludeId) continue;
		const arr = byCat.get(e.id_categoria) ?? [];
		arr.push(e); byCat.set(e.id_categoria, arr);
	}
	for (const c of categorias) {
		const arr = byCat.get(c.id_categoria) ?? [];
		if (arr.length > 0) groups.push({ key: c.id_categoria, label: c.nombre, entries: arr });
	}
	const sinCat = entradas.filter((e: any) => e && !e.archivado && e.id_entrada_codex !== excludeId && !categorias.find((c: any) => c.id_categoria === e.id_categoria));
	if (sinCat.length > 0) groups.push({ key: '__sin__', label: 'No category', entries: sinCat });
	return groups;
}
