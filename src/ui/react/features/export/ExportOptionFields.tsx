import type { ChapterStatus } from "../../../../domain";
import type {
	ChapterFormat,
	CompileFormat,
	ExportPreferences,
} from "../../../../types/ManuscriptExport";
import { CHAPTER_STATUSES } from "../../../../constants/chapterStatus";
import { HeadingFields } from "./HeadingFields";

export const COMPILE_FORMATS: { id: CompileFormat; label: string }[] = [
	{ id: "epub", label: "EPUB (e-readers, KDP)" },
	{ id: "docx", label: "Word (DOCX)" },
	{ id: "html", label: "HTML page" },
	{ id: "md", label: "Markdown (then Obsidian's Export to PDF)" },
];

export const CHAPTER_FORMATS: { id: ChapterFormat; label: string }[] = [
	{ id: "plain", label: "Plain text" },
	{ id: "html", label: "HTML" },
	{ id: "markdown", label: "Markdown" },
	{ id: "bbcode", label: "BBCode" },
];

export interface ExportOptionFieldsProps {
	prefs: ExportPreferences;
	onChange: (patch: Partial<ExportPreferences>) => void;
}

function Checkbox({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="nw-checkbox">
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
			/>
			{label}
		</label>
	);
}

/** Every choice of the Export dialog. */
export function ExportOptionFields({ prefs, onChange }: ExportOptionFieldsProps) {
	const single = prefs.output === "single";
	return (
		<div className="nw-export-fields">
			<label className="nw-export-field">
				<span>Output</span>
				<select
					className="dropdown"
					value={prefs.output}
					onChange={(event) =>
						onChange({ output: event.target.value as ExportPreferences["output"] })
					}
				>
					<option value="single">One file for the whole novel</option>
					<option value="per-chapter">One file per chapter</option>
				</select>
			</label>
			<label className="nw-export-field">
				<span>Format</span>
				{single ? (
					<select
						className="dropdown"
						value={prefs.compileFormat}
						onChange={(event) =>
							onChange({ compileFormat: event.target.value as CompileFormat })
						}
					>
						{COMPILE_FORMATS.map((format) => (
							<option key={format.id} value={format.id}>
								{format.label}
							</option>
						))}
					</select>
				) : (
					<select
						className="dropdown"
						value={prefs.chapterFormat}
						onChange={(event) =>
							onChange({ chapterFormat: event.target.value as ChapterFormat })
						}
					>
						{CHAPTER_FORMATS.map((format) => (
							<option key={format.id} value={format.id}>
								{format.label}
							</option>
						))}
					</select>
				)}
			</label>
			<HeadingFields prefs={prefs} onChange={onChange} />
			<label className="nw-export-field">
				<span>Scene break</span>
				<input
					type="text"
					value={prefs.sceneBreak}
					placeholder="* * *"
					onChange={(event) => onChange({ sceneBreak: event.target.value })}
				/>
			</label>
			<label className="nw-export-field">
				<span>Chapters</span>
				<select
					className="dropdown"
					value={prefs.minStatus ?? ""}
					onChange={(event) =>
						onChange({
							minStatus: (event.target.value || null) as ChapterStatus | null,
						})
					}
				>
					<option value="">Every chapter with text</option>
					{CHAPTER_STATUSES.slice(1).map((status) => (
						<option key={status.id} value={status.id}>
							{`${status.label} or later`}
						</option>
					))}
				</select>
			</label>
			{single ? (
				<>
					<Checkbox
						label="Title page"
						checked={prefs.titlePage}
						onChange={(titlePage) => onChange({ titlePage })}
					/>
					<Checkbox
						label="Act titles"
						checked={prefs.includeActTitles}
						onChange={(includeActTitles) => onChange({ includeActTitles })}
					/>
				</>
			) : (
				<Checkbox
					label="Start each file with the chapter heading"
					checked={prefs.includeChapterHeading}
					onChange={(includeChapterHeading) => onChange({ includeChapterHeading })}
				/>
			)}
		</div>
	);
}
