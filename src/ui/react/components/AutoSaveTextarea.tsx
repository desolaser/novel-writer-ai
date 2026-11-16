import { useEffect, useRef, useState } from "react";
import { Notice } from "obsidian";

export interface AutoSaveTextareaProps {
	/** Value held by the store. Only adopted while the author is not editing. */
	value: string;
	/** Persists the text. Called after a pause in typing, on blur and on unmount. */
	onSave: (value: string) => Promise<void>;
	className?: string;
	placeholder?: string;
	rows?: number;
	/** Pause after the last keystroke before saving, in milliseconds. */
	delay?: number;
}

/**
 * Textarea that owns its text while the author types and saves it in the
 * background.
 *
 * Every keystroke used to go through the parent's state, so the whole outline
 * re-rendered on each key and every save reloaded the store into the field. With
 * a long outline that made typing stall, and a reload landing mid-word could
 * replace the text under the cursor. Here a keystroke only re-renders this
 * component, and a new value from the store is ignored while the field has focus
 * or a save of its own is still pending.
 */
export function AutoSaveTextarea({
	value,
	onSave,
	className,
	placeholder,
	rows,
	delay = 600,
}: AutoSaveTextareaProps) {
	const [text, setText] = useState(value);
	const latestText = useRef(value);
	const lastSaved = useRef(value);
	const focused = useRef(false);
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savesInFlight = useRef(0);
	const saveRef = useRef(onSave);
	saveRef.current = onSave;

	const isBusy = () =>
		focused.current || timer.current !== null || savesInFlight.current > 0;

	// Adopt outside changes (the AI rewrote the outline, another view saved)
	// only when nothing local could be overwritten by them.
	useEffect(() => {
		if (isBusy()) return;
		if (value === latestText.current) return;
		latestText.current = value;
		lastSaved.current = value;
		setText(value);
	}, [value]);

	const flush = () => {
		if (timer.current) {
			clearTimeout(timer.current);
			timer.current = null;
		}
		const next = latestText.current;
		if (next === lastSaved.current) return;
		lastSaved.current = next;
		savesInFlight.current += 1;
		void saveRef.current(next)
			.catch((error: any) => {
				new Notice(`Could not save: ${error?.message ?? String(error)}`);
			})
			.finally(() => {
				savesInFlight.current -= 1;
			});
	};

	// Closing the view or collapsing the chapter must not drop the last words.
	useEffect(() => () => flush(), []);

	return (
		<textarea
			className={className}
			value={text}
			placeholder={placeholder}
			rows={rows}
			onFocus={() => {
				focused.current = true;
			}}
			onBlur={() => {
				focused.current = false;
				flush();
			}}
			onChange={(event) => {
				const next = event.target.value;
				latestText.current = next;
				setText(next);
				if (timer.current) clearTimeout(timer.current);
				timer.current = setTimeout(flush, delay);
			}}
		/>
	);
}
