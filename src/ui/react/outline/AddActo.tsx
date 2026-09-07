import { Icon } from "../components/Icon";

export interface AddActoProps {
	value: string;
	onChange: (value: string) => void;
	onCreate: () => void;
}

/** Fila para crear un nuevo acto. */
export function AddActo({ value, onChange, onCreate }: AddActoProps) {
	return (
		<div className="nw-outline-add">
			<input
				className="nw-input"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder="New act"
				onKeyDown={(e) => {
					if (e.key === "Enter") onCreate();
				}}
			/>
			<button className="nw-btn nw-btn-primary" onClick={onCreate}>
				<Icon.Plus />
			</button>
		</div>
	);
}
