export interface ActSummaryProps {
	value: string;
	busy: boolean;
	onChange: (value: string) => void;
	onGenerate: () => void;
}

/**
 * Editor del resumen del acto. Es el contexto que representa a los capítulos ya
 * lejanos, así que el autor puede escribirlo a mano o pedirlo a la IA.
 */
export function ActSummary({ value, busy, onChange, onGenerate }: ActSummaryProps) {
	return (
		<div className="nw-outline-act-summary">
			<div className="nw-outline-act-summary-head">
				<span>Act summary</span>
				<button
					className="nw-btn nw-btn-small"
					disabled={busy}
					title="Summarize this act from its chapter outlines"
					onClick={onGenerate}
				>
					Generate with AI
				</button>
			</div>
			<textarea
				className="nw-outline-inline-editor"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder="Summary of the whole act, used as context once its chapters fall out of the recent window..."
				rows={4}
			/>
		</div>
	);
}
