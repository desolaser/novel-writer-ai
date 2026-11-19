import type {
	ChapterHeadingStyle,
	ExportPreferences,
} from "../../../../types/ManuscriptExport";

const HEADING_STYLES: { id: ChapterHeadingStyle; label: string }[] = [
	{ id: "number-title", label: "Chapter 1: Title" },
	{ id: "number", label: "Chapter 1" },
	{ id: "title", label: "Title only" },
];

export interface HeadingFieldsProps {
	prefs: ExportPreferences;
	onChange: (patch: Partial<ExportPreferences>) => void;
}

/** How chapters are titled: style and the word before the number. */
export function HeadingFields({ prefs, onChange }: HeadingFieldsProps) {
	const usesWord = prefs.headingStyle !== "title";
	return (
		<>
			<label className="nw-export-field">
				<span>Chapter headings</span>
				<select
					className="dropdown"
					value={prefs.headingStyle}
					onChange={(event) =>
						onChange({
							headingStyle: event.target.value as ChapterHeadingStyle,
						})
					}
				>
					{HEADING_STYLES.map((style) => (
						<option key={style.id} value={style.id}>
							{style.label}
						</option>
					))}
				</select>
			</label>
			{usesWord && (
				<label className="nw-export-field">
					<span>Word for "Chapter"</span>
					<input
						type="text"
						value={prefs.chapterWord}
						placeholder="Chapter"
						onChange={(event) => onChange({ chapterWord: event.target.value })}
					/>
				</label>
			)}
		</>
	);
}
