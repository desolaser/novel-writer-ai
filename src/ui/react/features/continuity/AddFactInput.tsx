import { useState } from "react";

export interface AddFactInputProps {
	onAdd: (text: string) => Promise<void>;
}

/** "Add a fact": Enter adds it and clears the field; Escape clears it. */
export function AddFactInput({ onAdd }: AddFactInputProps) {
	const [text, setText] = useState("");

	const add = async () => {
		const clean = text.trim();
		if (!clean) return;
		setText("");
		await onAdd(clean);
	};

	return (
		<input
			className="nw-fact-add"
			value={text}
			placeholder="+ Add a fact (Enter)"
			aria-label="Add a fact"
			onChange={(event) => setText(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.preventDefault();
					void add();
				} else if (event.key === "Escape") {
					setText("");
				}
			}}
		/>
	);
}
