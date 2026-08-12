import React, { useState } from "react";
import { useNovelWriter } from '../../../store/novelWriterStore';
import { ApiFactory } from '../../../../../factories/api-factory';
import { getActiveModelConfig } from '../../../../../infrastructure/settings/active-model';
import NovelWriterPlugin from "../../../../../../main";
import { Icon } from '../../../components/Icon';

const CodexAiGenerator = ({
    plugin,
    entry,
    setDraft,
    setDirty,
}: {
    plugin: NovelWriterPlugin, 
    entry: any,
    setDraft: React.Dispatch<any>,
    setDirty: React.Dispatch<React.SetStateAction<boolean>>,
}) => {
    const {
        entradas, updateEntry, tags, categorias, refreshEntry, detalles
    } = useNovelWriter();

    // AI Generation state
    const [aiGenOpen, setAiGenOpen] = useState(false);
    const [aiGenInput, setAiGenInput] = useState('');
    const [aiGenLoading, setAiGenLoading] = useState(false);
    
	const allFieldsFilled = ((): boolean => {
		if (!entry.alias?.trim()) return false;
		if (!entry.descripcion?.trim()) return false;
		if (!entry.notas?.trim()) return false;
		const entryDetalles = entry.detalles ?? [];
		for (const ed of entryDetalles) {
			if (!ed.valor?.toString().trim()) return false;
		}
		return true;
	})();

    /** Build a text prompt for the AI to generate/complete codex entry fields. */
    const buildAiPrompt = (mode: 'generate' | 'complete'): string => {
        const catName = categorias.find((c: any) => c.id_categoria === entry.id_categoria)?.nombre ?? 'Sin categoria';
        const tagNames = (entry.tags ?? []).map((id: string) => tags.find((t: any) => t.id_tag === id)?.nombre ?? '').filter(Boolean).join(', ');
        const entryDetalles = entry.detalles ?? [];
        const filledDetails = entryDetalles.map((ed: any) => {
            const d = (detalles as any[]).find((x: any) => x.id_detalle === ed.id_detalle);
            return { nombre: d?.nombre ?? ed.id_detalle, tipo: d?.tipo_detalle ?? 'text', valor: ed.valor ?? '' };
        });

        // Find keywords in input that match other codex entries
        const inputLower = aiGenInput.toLowerCase();
        const referencedEntries = entradas
            .filter((e: any) => e.id_entrada_codex !== entry.id_entrada_codex && !e.archivado)
            .filter((e: any) => {
                const nameLower = (e.nombre ?? '').toLowerCase();
                const aliasLower = (e.alias ?? '').toLowerCase();
                return nameLower && inputLower.includes(nameLower) || aliasLower && inputLower.includes(aliasLower);
            })
            .slice(0, 5);

        let referencedContext = '';
        if (referencedEntries.length > 0) {
            referencedContext = '\n\n--- ENTRIES REFERENCED IN INPUT ---\n' +
                referencedEntries.map((e: any) =>
                    `Name: ${e.nombre}\nAlias: ${e.alias || 'N/A'}\nCategory: ${categorias.find((c: any) => c.id_categoria === e.id_categoria)?.nombre ?? 'Unknown'}\nDescription: ${e.descripcion || 'N/A'}\n` +
                    (e.detalles ?? []).map((ed: any) => {
                        const d = (detalles as any[]).find((x: any) => x.id_detalle === ed.id_detalle);
                        return `  ${d?.nombre ?? ed.id_detalle}: ${ed.valor ?? ''}`;
                    }).join('\n')
                ).join('\n---\n');
        }

        const parts: string[] = [];
        parts.push('You are generating a Codex entry for a worldbuilding system. Output ONLY valid JSON (no markdown, no code fences).');
        parts.push(`\nCategory: ${catName}`);
        parts.push(`Entry Name: ${entry.nombre || '(empty)'}`);
        if (tagNames) parts.push(`Tags: ${tagNames}`);
        if (aiGenInput.trim()) parts.push(`\nUser Input/Instructions: ${aiGenInput.trim()}`);
        if (referencedContext) parts.push(referencedContext);

        if (mode === 'generate') {
            parts.push('\n--- CURRENT VALUES (will be REPLACED) ---');
            parts.push(`Alias/Nicknames: ${entry.alias || '(empty)'}`);
            parts.push(`Description: ${entry.descripcion || '(empty)'}`);
            parts.push(`Notes: ${entry.notas || '(empty)'}`);
            if (filledDetails.length > 0) {
                parts.push('Details:');
                filledDetails.forEach((fd: any) => parts.push(`  ${fd.nombre} (type: ${fd.tipo}): ${fd.valor || '(empty)'}`));
            }
            parts.push('\nTASK: Generate a COMPLETELY NEW codex entry. Replace ALL fields (alias, description, notes, and ALL details) with fresh content. Only keep the entry name and tags unchanged. Be creative and surprise the user while fitting the category. The description should be a short summary paragraph. Notes are private research/inspiration notes for the author. Alias should be comma-separated nicknames/alternate names.');
            parts.push('\nOutput JSON format: {"alias":"...", "descripcion":"...", "notas":"...", "detalles":{"Detail Name 1":"value", "Detail Name 2":"value"}}');
        } else {
            // Complete mode: only fill empty/blanks
            const emptyFields: string[] = [];
            if (!entry.alias?.trim()) emptyFields.push('alias');
            if (!entry.descripcion?.trim()) emptyFields.push('descripcion');
            if (!entry.notas?.trim()) emptyFields.push('notas');
            const emptyDetails = filledDetails.filter((fd: any) => !fd.valor?.toString().trim());
            emptyDetails.forEach((fd: any) => emptyFields.push(`detail:${fd.nombre}`));

            if (emptyFields.length === 0) {
                parts.push('\nTASK: All fields are filled. No generation needed.');
            } else {
                if (entry.alias?.trim()) parts.push(`Alias/Nicknames: ${entry.alias}`);
                if (entry.descripcion?.trim()) parts.push(`Description: ${entry.descripcion}`);
                if (entry.notas?.trim()) parts.push(`Notes: ${entry.notas}`);
                if (filledDetails.some((fd: any) => fd.valor?.toString().trim())) {
                    parts.push('Filled Details:');
                    filledDetails.filter((fd: any) => fd.valor?.toString().trim()).forEach((fd: any) => parts.push(`  ${fd.nombre}: ${fd.valor}`));
                }
                parts.push(`\nTASK: Only fill these EMPTY/BLANK fields: ${emptyFields.join(', ')}. Do NOT modify already filled fields.`);
                parts.push('\nOutput JSON format with ONLY the empty fields: {"alias":"...", "detalles":{"Detail Name":"value"}}');
            }
        }

        return parts.join('\n');
    };

    const callAiForCodex = async (mode: 'generate' | 'complete') => {
        setAiGenLoading(true);
        try {
            const settings = plugin.settings.data;
            const activeModel = getActiveModelConfig(settings, 'generate');
            if (!activeModel.modelName) throw new Error('Configura un modelo activo en Settings.');
            const token = settings.apiToken[activeModel.providerId] ?? '';
            const api = new ApiFactory().createApi(activeModel.providerId, token);
            const prompt = buildAiPrompt(mode);
            const result = await api.generateCompletion(prompt, activeModel.modelName, {
                ...activeModel.options,
                max_tokens: 4096,
                stream: false,
            });
            const text = result.text ?? '';
            // Try to extract JSON from response (handle possible markdown fences)
            let jsonStr = text.trim();
            const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (fenceMatch) jsonStr = fenceMatch[1].trim();
            // Find JSON object boundaries
            const objStart = jsonStr.indexOf('{');
            const objEnd = jsonStr.lastIndexOf('}');
            if (objStart === -1 || objEnd === -1 || objEnd <= objStart) {
                throw new Error('La IA no devolvió JSON válido.');
            }
            jsonStr = jsonStr.slice(objStart, objEnd + 1);
            const parsed = JSON.parse(jsonStr);

            // Build the updated entry
            const updatedEntry: any = { ...entry };

            if (mode === 'generate') {
                // Replace all fields except name and tags
                if (parsed.alias !== undefined) updatedEntry.alias = parsed.alias;
                if (parsed.descripcion !== undefined) updatedEntry.descripcion = parsed.descripcion;
                if (parsed.notas !== undefined) updatedEntry.notas = parsed.notas;
                // Handle detalles
                if (parsed.detalles && typeof parsed.detalles === 'object') {
                    const entryDetalles = updatedEntry.detalles ?? [];
                    for (const ed of entryDetalles) {
                        const d = (detalles as any[]).find((x: any) => x.id_detalle === ed.id_detalle);
                        const detailName = d?.nombre ?? ed.id_detalle;
                        const newVal = parsed.detalles[detailName] ?? parsed.detalles[ed.id_detalle];
                        if (newVal !== undefined) {
                            ed.valor = String(newVal);
                        }
                    }
                    updatedEntry.detalles = entryDetalles;
                }
            } else {
                // Complete mode: only fill empty fields
                if (!updatedEntry.alias?.trim() && parsed.alias) updatedEntry.alias = parsed.alias;
                if (!updatedEntry.descripcion?.trim() && parsed.descripcion) updatedEntry.descripcion = parsed.descripcion;
                if (!updatedEntry.notas?.trim() && parsed.notas) updatedEntry.notas = parsed.notas;
                if (parsed.detalles && typeof parsed.detalles === 'object') {
                    const entryDetalles = updatedEntry.detalles ?? [];
                    for (const ed of entryDetalles) {
                        if (ed.valor?.toString().trim()) continue; // skip filled
                        const d = (detalles as any[]).find((x: any) => x.id_detalle === ed.id_detalle);
                        const detailName = d?.nombre ?? ed.id_detalle;
                        const newVal = parsed.detalles[detailName] ?? parsed.detalles[ed.id_detalle];
                        if (newVal !== undefined) {
                            ed.valor = String(newVal);
                        }
                    }
                    updatedEntry.detalles = entryDetalles;
                }
            }

            // Save the updated entry
            await updateEntry(updatedEntry);
            setDraft(updatedEntry);
            setDirty(false);
            // Reload to get fresh data from store
            await refreshEntry(entry.id_entrada_codex);
        } catch (e: any) {
            alert('Error en generación IA: ' + (e?.message ?? String(e)));
        } finally {
            setAiGenLoading(false);
        }
    };
    
	return (
		<div className="nw-ai-gen-section">
			<button
				className="nw-ai-gen-header"
				onClick={() => setAiGenOpen(!aiGenOpen)}
				type="button"
			>
				<span className="nw-ai-gen-header-text">Generación por IA</span>
				{aiGenOpen ? (
					<span
						style={{
							transform: "rotate(180deg)",
							display: "inline-flex",
							transition: "transform 0.2s",
						}}
					>
						<Icon.ChevronDown width={16} height={16} />
					</span>
				) : (
					<span
						style={{
							display: "inline-flex",
							transition: "transform 0.2s",
						}}
					>
						<Icon.ChevronDown width={16} height={16} />
					</span>
				)}
			</button>
			{aiGenOpen && (
				<div className="nw-ai-gen-body">
					<div className="nw-field nw-field-stacked">
						<label>Input</label>
						<textarea
							className="nw-textarea"
							rows={3}
							value={aiGenInput}
							onChange={(e) => setAiGenInput(e.target.value)}
							placeholder="Escribe lo que deseas generar"
							disabled={aiGenLoading}
						/>
					</div>
					<div className="nw-ai-gen-actions">
						<button
							className="nw-btn nw-btn-primary"
							onClick={() => callAiForCodex("generate")}
							disabled={aiGenLoading}
							type="button"
						>
							<Icon.Magic width={14} height={14} />
							Generar
						</button>
						<button
							className="nw-btn"
							onClick={() => callAiForCodex("complete")}
							disabled={aiGenLoading || allFieldsFilled}
							type="button"
						>
							Completar
						</button>
						{aiGenLoading && (
							<span className="nw-ai-gen-spinner">
								Generando...
							</span>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default CodexAiGenerator;
