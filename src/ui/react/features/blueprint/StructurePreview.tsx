import React from "react";
import { Icon } from "../../components/Icon";
import type { BlueprintOutlineController } from "./useBlueprintOutline";

/**
 * The structure as editable Markdown. It is what gets parsed on apply, so the
 * author always sees exactly what will become acts and chapters.
 */
export function StructurePreview({
	markdown,
	chapters,
	expectedChapters,
	edited,
	onChange,
	onRebuild,
	outline,
}: {
	markdown: string;
	chapters: number;
	expectedChapters: number;
	edited: boolean;
	onChange: (markdown: string) => void;
	onRebuild: () => void;
	outline: BlueprintOutlineController;
}) {
	// Hand edits are never replaced behind the author's back, so the structure can
	// legitimately stop matching the form until Rebuild is pressed.
	const stale = edited && chapters !== expectedChapters;
	return (
		<div className="nw-blueprint-structure">
			<div className="nw-blueprint-structure-head">
				<strong>Structure</strong>
				<span className="nw-muted">
					{chapters} {chapters === 1 ? "chapter" : "chapters"}
					{chapters !== expectedChapters && ` (form says ${expectedChapters})`}
				</span>
				<button
					className={stale ? "nw-btn nw-btn-small nw-btn-primary" : "nw-btn nw-btn-small"}
					onClick={onRebuild}
					disabled={outline.busy}
				>
					Rebuild
				</button>
				<button
					className="nw-btn nw-btn-small nw-btn-primary nw-blueprint-outline-btn"
					disabled={outline.busy || chapters === 0}
					title="Write the outline of every chapter that has none, one act per request"
					onClick={() => void outline.generate()}
				>
					<Icon.Paintbrush width={12} height={12} />
					{outline.missing > 0 ? `Outline ${outline.missing}` : "Outlines"}
				</button>
				{outline.busy && (
					<button className="nw-btn nw-btn-small nw-btn-danger" onClick={outline.cancel}>
						Stop
					</button>
				)}
			</div>
			{outline.status && (
				<div className={`nw-blueprint-progress${outline.busy ? " is-running" : ""}`}>
					{outline.status}
				</div>
			)}
			<textarea
				className="nw-textarea nw-blueprint-markdown"
				value={markdown}
				spellCheck={false}
				onChange={(event) => onChange(event.target.value)}
				placeholder={"## Act 1 - Setup\nWhat the act is for.\n\n### Chapter 1\nWhat happens in the chapter."}
			/>
			<p className="nw-muted nw-blueprint-hint">
				{stale
					? `The form asks for ${expectedChapters} chapters. Rebuild to lay them out again, replacing your hand edits.`
					: outline.missing === 0 && outline.total > 0
					? "Every chapter has an outline. Clear the text under a chapter and generate again to redo just that one."
					: edited
					? "Edited by hand. Rebuilding replaces it with the template layout."
					: "`##` starts an act, `###` starts a chapter, and the text under a chapter is its outline."}
			</p>
		</div>
	);
}
