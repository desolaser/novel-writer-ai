import { useEffect, useState } from 'react';
import { TipoDetalle } from '../../../../../../domain';
import type { CodexAiChoice, CodexAiField, CodexAiFieldType } from '../../../../../../types/CodexAi';
import { useNovelWriter } from '../../../../store/novelWriterStore';

/**
 * Derives the list of generatable fields of a codex entry: the fixed ones plus
 * every detail currently attached to it, each resolved to readable text and to
 * the choices the model is allowed to answer with.
 *
 * `notas` is intentionally not a field: private notes never reach a prompt.
 */

const DETAIL_TYPES: Record<string, CodexAiFieldType> = {
	[TipoDetalle.Text]: 'text',
	[TipoDetalle.Line]: 'line',
	[TipoDetalle.Dropdown]: 'dropdown',
	[TipoDetalle.CodexRef]: 'codex_ref',
};

export const ALIAS_KEY = 'alias';
export const DESCRIPTION_KEY = 'descripcion';
export const detailKey = (idDetalle: string) => `detalle:${idDetalle}`;

export function useCodexAiFields(entry: any): CodexAiField[] {
	const { detalles, entradas, listOpcionesByDetalle } = useNovelWriter() as any;
	const [opciones, setOpciones] = useState<Record<string, any[]>>({});

	const attached: any[] = entry?.detalles ?? [];
	const dropdownIds = attached
		.map((value: any) => detalles.find((definition: any) => definition.id_detalle === value.id_detalle))
		.filter((definition: any) => definition?.tipo_detalle === TipoDetalle.Dropdown)
		.map((definition: any) => definition.id_detalle);
	const dropdownKey = dropdownIds.join('|');

	useEffect(() => {
		if (!dropdownIds.length) { setOpciones({}); return; }
		let cancelled = false;
		(async () => {
			const loaded: Record<string, any[]> = {};
			for (const id of dropdownIds) loaded[id] = await listOpcionesByDetalle(id);
			if (!cancelled) setOpciones(loaded);
		})().catch((error) => console.error('useCodexAiFields options load error', error));
		return () => { cancelled = true; };
	}, [dropdownKey]);

	if (!entry) return [];

	const entryChoices: CodexAiChoice[] = entradas
		.filter((other: any) => !other.archivado && other.id_entrada_codex !== entry.id_entrada_codex)
		.map((other: any) => ({
			id: other.id_entrada_codex,
			name: other.nombre,
			aliases: (other.alias ?? '').split(',').map((alias: string) => alias.trim()).filter(Boolean),
		}));

	const fields: CodexAiField[] = [
		{
			key: ALIAS_KEY,
			label: 'Aliases',
			type: 'alias',
			currentText: entry.alias ?? '',
			currentValue: entry.alias ?? '',
		},
		{
			key: DESCRIPTION_KEY,
			label: 'Description',
			type: 'text',
			currentText: entry.descripcion ?? '',
			currentValue: entry.descripcion ?? '',
		},
	];

	for (const value of attached) {
		const definition = detalles.find((item: any) => item.id_detalle === value.id_detalle);
		if (!definition) continue;
		const type = DETAIL_TYPES[definition.tipo_detalle] ?? 'line';
		const stored: string | null = value.valor ?? null;
		let choices: CodexAiChoice[] | undefined;
		let currentText = stored ?? '';
		if (type === 'dropdown') {
			choices = (opciones[definition.id_detalle] ?? []).map((option: any) => ({ id: option.id_opcion_detalle, name: option.nombre }));
			currentText = choices.find((choice) => choice.id === stored)?.name ?? '';
		} else if (type === 'codex_ref') {
			choices = entryChoices;
			currentText = entryChoices.find((choice) => choice.id === stored)?.name ?? '';
		}
		fields.push({
			key: detailKey(definition.id_detalle),
			label: definition.nombre || 'Detail',
			type,
			idDetalle: definition.id_detalle,
			aiHint: definition.ai_hint,
			choices,
			currentText,
			currentValue: stored,
		});
	}

	return fields;
}
