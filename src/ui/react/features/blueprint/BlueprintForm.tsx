import React from "react";
import type { BlueprintField, NovelBlueprint } from "../../../../domain";
import {
	AUDIENCES,
	COMMON_LANGUAGES,
	NARRATIVE_TENSES,
	NARRATIVE_TIMES,
	STRUCTURE_TEMPLATES,
	getStructureTemplate,
} from "../../../../constants/structures";
import type { BlueprintController } from "./useBlueprint";
import type { BlueprintAiController } from "./useBlueprintAi";
import { BlueprintProposalBox, DeducedBadge } from "./BlueprintProposalBox";

/**
 * Chapter count. Committed on blur or Enter instead of on every keystroke,
 * because each commit re-lays out the structure.
 */
function ChapterCountField({
	value,
	min,
	onCommit,
}: {
	value: number;
	min: number;
	onCommit: (count: number) => void;
}) {
	const [draft, setDraft] = React.useState(String(value));
	React.useEffect(() => setDraft(String(value)), [value]);
	return (
		<input
			className="nw-input"
			type="number"
			min={min}
			max={300}
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => onCommit(Number(draft))}
			onKeyDown={(event) => {
				if (event.key === "Enter") event.currentTarget.blur();
			}}
		/>
	);
}

/** Label of a field the AI may fill in, with its deduced badge. */
function FieldLabel({
	text,
	field,
	inferred,
}: {
	text: string;
	field: BlueprintField;
	inferred: BlueprintField[];
}) {
	return (
		<span className="nw-blueprint-label">
			{text}
			<DeducedBadge show={inferred.includes(field)} />
		</span>
	);
}

/** Premise and settings of the novel. The structure preview lives in its own component. */
export function BlueprintForm({
	blueprint,
	controller,
	ai,
}: {
	blueprint: NovelBlueprint;
	controller: BlueprintController;
	ai: BlueprintAiController;
}) {
	const { setField, setStructure, setChapterCount, useSuggestedLength, suggestion, minChapters } =
		controller;
	const template = getStructureTemplate(blueprint.structure) ?? STRUCTURE_TEMPLATES[0];
	const range = blueprint.wordsPerChapter;
	const inferred = blueprint.inferred;
	const suggestionDiffers =
		suggestion.range.min !== range.min || suggestion.range.max !== range.max;
	const suggestionSource =
		suggestion.source === "audience"
			? "platform"
			: suggestion.source === "genre"
			? "genre"
			: "the general default";

	const setWords = (key: "min" | "max", value: number) =>
		setField("wordsPerChapter", { ...range, [key]: Math.max(100, Math.round(value) || 0) });

	return (
		<div className="nw-blueprint-form">
			<label>
				<FieldLabel text="Title" field="title" inferred={inferred} />
				<input
					className="nw-input"
					value={blueprint.title}
					placeholder="Working title"
					onChange={(event) => setField("title", event.target.value)}
				/>
			</label>
			<BlueprintProposalBox field="title" ai={ai} />

			<label>
				Description
				<textarea
					className="nw-textarea"
					rows={5}
					value={blueprint.description}
					placeholder="Premise and broad strokes of the plot."
					onChange={(event) => setField("description", event.target.value)}
				/>
			</label>

			<label>
				Setting
				<textarea
					className="nw-textarea"
					rows={3}
					value={blueprint.setting}
					placeholder="Where it happens, in what world, what that world is like."
					onChange={(event) => setField("setting", event.target.value)}
				/>
			</label>

			<div className="nw-blueprint-row">
				<label>
					<FieldLabel text="Genre" field="genre" inferred={inferred} />
					<input
						className="nw-input"
						value={blueprint.genre}
						placeholder="High fantasy, thriller, magical realism..."
						onChange={(event) => setField("genre", event.target.value)}
					/>
				</label>
				<label>
					<FieldLabel text="Style" field="style" inferred={inferred} />
					<input
						className="nw-input"
						value={blueprint.style}
						placeholder="Reference author, or dense prose, fast pacing..."
						onChange={(event) => setField("style", event.target.value)}
					/>
				</label>
			</div>
			<BlueprintProposalBox field="genre" ai={ai} />
			<BlueprintProposalBox field="style" ai={ai} />

			<div className="nw-blueprint-row">
				<label>
					Verb tense
					<select
						className="nw-select"
						value={blueprint.tense}
						onChange={(event) => setField("tense", event.target.value as NovelBlueprint["tense"])}
					>
						{NARRATIVE_TENSES.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
				<label>
					<FieldLabel text="Narrative time" field="narrativeTime" inferred={inferred} />
					<select
						className="nw-select"
						value={blueprint.narrativeTime}
						onChange={(event) =>
							setField("narrativeTime", event.target.value as NovelBlueprint["narrativeTime"])
						}
					>
						{NARRATIVE_TIMES.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<BlueprintProposalBox field="narrativeTime" ai={ai} />

			<div className="nw-blueprint-row">
				<label>
					Language
					<input
						className="nw-input"
						list="nw-blueprint-languages"
						value={blueprint.language}
						placeholder="Same as the description"
						onChange={(event) => setField("language", event.target.value)}
					/>
					{/* Free text, not a closed list: the story can be in any language. */}
					<datalist id="nw-blueprint-languages">
						{COMMON_LANGUAGES.map((language) => (
							<option key={language} value={language} />
						))}
					</datalist>
				</label>
				<label>
					Platform / audience
					<select
						className="nw-select"
						value={blueprint.audience}
						onChange={(event) =>
							setField("audience", event.target.value as NovelBlueprint["audience"])
						}
					>
						{AUDIENCES.map((item) => (
							<option key={item.id} value={item.id}>
								{item.label}
							</option>
						))}
					</select>
				</label>
			</div>
			<p className="nw-muted nw-blueprint-hint">
				{blueprint.language.trim()
					? `Titles, outlines and drafts are written in ${blueprint.language.trim()}.`
					: "Leave it empty and the AI writes in the same language as the description."}
			</p>

			<div className="nw-blueprint-row">
				<label>
					<FieldLabel
						text="Words per chapter (min)"
						field="wordsPerChapter"
						inferred={inferred}
					/>
					<input
						className="nw-input"
						type="number"
						min={100}
						step={100}
						value={range.min}
						onChange={(event) => setWords("min", Number(event.target.value))}
					/>
				</label>
				<label>
					Words per chapter (max)
					<input
						className="nw-input"
						type="number"
						min={100}
						step={100}
						value={range.max}
						onChange={(event) => setWords("max", Number(event.target.value))}
					/>
				</label>
			</div>
			<p className="nw-muted nw-blueprint-hint">
				Suggested by {suggestionSource}: {suggestion.range.min}–{suggestion.range.max} words.
				{suggestionDiffers && (
					<button className="nw-btn nw-btn-small" onClick={useSuggestedLength}>
						Use
					</button>
				)}
			</p>
			<BlueprintProposalBox field="wordsPerChapter" ai={ai} />

			<div className="nw-blueprint-row">
				<label>
					Structure
					<select
						className="nw-select"
						value={blueprint.structure}
						onChange={(event) => setStructure(event.target.value)}
					>
						{STRUCTURE_TEMPLATES.map((item) => (
							<option key={item.id} value={item.id}>
								{item.nombre}
							</option>
						))}
					</select>
				</label>
				<label>
					Chapters
					<ChapterCountField
						value={blueprint.chapterCount}
						min={minChapters}
						onCommit={setChapterCount}
					/>
				</label>
			</div>
			<p className="nw-muted nw-blueprint-hint">{template.description}</p>
		</div>
	);
}
