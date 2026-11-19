import type { Categoria, EntradaCodex, EntityId } from "../../../domain";

export interface CodexEntrySelectProps {
	value: EntityId | null | undefined;
	entries: EntradaCodex[];
	categories: Categoria[];
	/** Category listed first (e.g. "Characters" for the point of view). */
	preferredCategory: string;
	ariaLabel: string;
	onChange: (id: EntityId | null) => void;
}

interface EntryGroup {
	name: string;
	entries: EntradaCodex[];
}

/**
 * Entries grouped by category, the preferred category first. Archived entries
 * are left out, except the one already chosen so the field never goes blank.
 */
function groupEntries(
	props: CodexEntrySelectProps,
): EntryGroup[] {
	const preferred = props.preferredCategory.toLowerCase();
	const ordered = [...props.categories].sort((first, second) => {
		const firstPreferred = first.nombre.toLowerCase() === preferred ? 0 : 1;
		const secondPreferred = second.nombre.toLowerCase() === preferred ? 0 : 1;
		return firstPreferred - secondPreferred;
	});
	const shown = props.entries.filter((entry) =>
		!entry.archivado || entry.id_entrada_codex === props.value);
	const groups = ordered.map((category) => ({
		name: category.nombre,
		entries: shown
			.filter((entry) => entry.id_categoria === category.id_categoria)
			.sort((first, second) => first.nombre.localeCompare(second.nombre)),
	}));
	const known = new Set(props.categories.map((item) => item.id_categoria));
	const loose = shown.filter((entry) => !known.has(entry.id_categoria));
	if (loose.length) groups.push({ name: "Other", entries: loose });
	return groups.filter((group) => group.entries.length > 0);
}

/** Select of a codex entry, with "None". */
export function CodexEntrySelect(props: CodexEntrySelectProps) {
	const groups = groupEntries(props);
	return (
		<select
			className="dropdown nw-chapter-info-select"
			aria-label={props.ariaLabel}
			value={props.value ?? ""}
			onChange={(event) => props.onChange(event.target.value || null)}
		>
			<option value="">None</option>
			{groups.map((group) => (
				<optgroup key={group.name} label={group.name}>
					{group.entries.map((entry) => (
						<option
							key={entry.id_entrada_codex}
							value={entry.id_entrada_codex}
						>
							{entry.nombre || "(unnamed)"}
						</option>
					))}
				</optgroup>
			))}
		</select>
	);
}
