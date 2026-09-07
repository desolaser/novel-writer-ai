/** Input de renombrado inline reutilizable (actos y capítulos). */
export interface InlineRenameProps {
	defaultValue: string;
	/** Se invoca al confirmar (blur/Enter) con el valor ya recortado. */
	onCommit: (value: string) => void;
	/** Se invoca al cancelar con Escape. */
	onCancel: () => void;
}

export function InlineRename({
	defaultValue,
	onCommit,
	onCancel,
}: InlineRenameProps) {
	return (
		<input
			className="nw-input nw-inline-rename"
			autoFocus
			defaultValue={defaultValue}
			onBlur={(e) => onCommit(e.target.value.trim())}
			onKeyDown={(e) => {
				if (e.key === "Enter") (e.target as HTMLInputElement).blur();
				if (e.key === "Escape") onCancel();
			}}
		/>
	);
}
