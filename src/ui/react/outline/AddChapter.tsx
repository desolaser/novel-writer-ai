import { Icon } from "../components/Icon";

export interface AddChapterProps {
	adding: boolean;
	name: string;
	onNameChange: (value: string) => void;
	onStartAdding: () => void;
	onCancel: () => void;
	onAdd: () => void;
}

/** Botón/fila para añadir un capítulo a un acto. */
export function AddChapter({
	adding,
	name,
	onNameChange,
	onStartAdding,
	onCancel,
	onAdd,
}: AddChapterProps) {
	if (!adding) {
		return (
			<button className="nw-cap-add" onClick={onStartAdding}>
				+ Chapter
			</button>
		);
	}

	return (
		<div className="nw-cap-add-row">
			<input
				className="nw-input"
				autoFocus
				value={name}
				onChange={(e) => onNameChange(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter") onAdd();
					if (e.key === "Escape") onCancel();
				}}
			/>
			<button className="nw-btn nw-btn-primary" onClick={onAdd}>
				<Icon.Plus />
			</button>
		</div>
	);
}
