import { AiContextPolicy } from '../../../../domain';
import { Icon } from '../../components/Icon';

function truncate(s: string | null | undefined, n: number): string {
    if (!s) return '';
    if (s.length <= n) return s;
    return s.slice(0, n).trimEnd() + '...';
}

const TRUNC = 100;

function CodexEntryRow({
	entry,
	tags,
	onClick,
	deleteMode,
	selected,
	onToggleDeletion,
}: {
	entry: any;
	tags: any[];
	onClick: () => void;
	deleteMode: boolean;
	selected: boolean;
	onToggleDeletion: () => void;
}) {
	const entryTags = (entry.tags ?? [])
		.map((id: string) => tags.find((t: any) => t.id_tag === id))
		.filter(Boolean);

	const desc = truncate(entry.descripcion, TRUNC);
	return (
		<button
			className={
				"nw-entry nw-entry-row " +
				(entry.ai_context_policy === AiContextPolicy.Never
					? "never"
					: "")
			}
			onClick={deleteMode ? onToggleDeletion : onClick}
		>
			{deleteMode && (
				<input
					className="nw-codex-delete-checkbox"
					type="checkbox"
					checked={selected}
					onChange={onToggleDeletion}
					onClick={(event) => event.stopPropagation()}
					aria-label={`Select ${entry.nombre}`}
				/>
			)}
			<div className="nw-entry-row-thumb">
				{entry.thumbnail ? (
					<img
						src={entry.thumbnail}
						alt=""
						className="nw-entry-thumb-img"
					/>
				) : (
					<div className="nw-entry-thumb-empty">
						<Icon.Plus width={16} height={16} />
					</div>
				)}
			</div>
			<div className="nw-entry-row-content">
				<div
					className="nw-entry-name"
					style={entry.color ? { color: entry.color } : undefined}
				>
					{entry.nombre !== "" ? entry.nombre : "Unnamed"}
				</div>
				{entryTags.length > 0 && (
					<div className="nw-entry-tags-inline">
						{entryTags.map((t: any) => (
							<span
								key={t.id_tag}
								className="nw-tag-chip"
								style={t.color ? { background: t.color } : {}}
							>
								{t.nombre}
							</span>
						))}
					</div>
				)}
				{desc && <div className="nw-entry-desc">{desc}</div>}
			</div>
		</button>
	);
}

export default CodexEntryRow;
