import CodexEntryRow from "./CodexEntryRow";
import { Icon } from '../../components/Icon';

function CodexCategoryGroup({
	catId,
	catName,
	catColor,
	open,
	onToggle,
	entries,
	tags,
	onEdit,
	onAddInCategory,
	deleteMode,
	selectedForDeletion,
	onToggleDeletion,
}: {
	catId: string;
	catName: string;
	catColor: string;
	open: boolean;
	onToggle: () => void;
	entries: any[];
	tags: any[];
	onEdit: (id: string) => void;
	onAddInCategory: () => void;
	deleteMode: boolean;
	selectedForDeletion: Set<string>;
	onToggleDeletion: (id: string) => void;
}) {
	if (entries.length === 0) return null;
	return (
		<div className="nw-cat-group" data-cat-id={catId}>
			<div
				className="nw-cat-header"
				style={{ borderLeftColor: catColor }}
			>
				<button className="nw-cat-header-toggle" onClick={onToggle}>
					<span className="nw-cat-toggle-main">
						<span className="nw-cat-caret">
							{open ? (
								<Icon.ChevronDown />
							) : (
								<Icon.ChevronRight />
							)}
						</span>
						<span className="nw-cat-name">{catName}</span>
					</span>
					<span className="nw-cat-count">
						{entries.length > 1
							? `Entries ${entries.length}`
							: `Entry ${entries.length}`}
					</span>
				</button>
				<button
					className="nw-btn nw-btn-icon nw-btn-transparent nw-cat-add"
					onClick={onAddInCategory}
					title={"Create entry in " + catName}
				>
					<Icon.Plus width={12} height={12} />
				</button>
			</div>
			{open && (
				<div className="nw-cat-entries">
					{entries.map((e) => (
						<CodexEntryRow
							key={e.id_entrada_codex}
							entry={e}
							tags={tags}
							onClick={() => onEdit(e.id_entrada_codex)}
							deleteMode={deleteMode}
							selected={selectedForDeletion.has(
								e.id_entrada_codex
							)}
							onToggleDeletion={() =>
								onToggleDeletion(e.id_entrada_codex)
							}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default CodexCategoryGroup;
