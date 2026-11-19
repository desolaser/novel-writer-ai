import { useEffect, useRef, useState } from "react";

export interface CommitInputProps {
	value: string;
	onCommit: (value: string) => void | Promise<void>;
	type?: "text" | "number";
	placeholder?: string;
	className?: string;
	title?: string;
	ariaLabel?: string;
}

/**
 * One-line input that saves on blur or Enter, not on every key. While it has
 * focus the author's text wins over a new value from the store, the same rule
 * as `AutoSaveTextarea`. Escape restores the stored value.
 */
export function CommitInput({
	value,
	onCommit,
	type = "text",
	placeholder,
	className,
	title,
	ariaLabel,
}: CommitInputProps) {
	const [text, setText] = useState(value);
	const focused = useRef(false);
	// Escape blurs the field; its blur must not save the discarded text.
	const discarding = useRef(false);

	useEffect(() => {
		if (!focused.current) setText(value);
	}, [value]);

	const commit = () => {
		if (text === value) return;
		void onCommit(text);
	};

	return (
		<input
			type={type}
			className={className}
			value={text}
			placeholder={placeholder}
			title={title}
			aria-label={ariaLabel}
			onFocus={() => {
				focused.current = true;
			}}
			onChange={(event) => setText(event.target.value)}
			onBlur={() => {
				focused.current = false;
				if (discarding.current) {
					discarding.current = false;
					return;
				}
				commit();
			}}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					event.currentTarget.blur();
				} else if (event.key === "Escape") {
					discarding.current = true;
					setText(value);
					event.currentTarget.blur();
				}
			}}
		/>
	);
}
