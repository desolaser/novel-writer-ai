import { useState } from "react";
import { useNovelWriter } from "../../store/novelWriterStore";
import type NovelWriterPlugin from "../../../../../main";

export function NovelSwitcher({ plugin, inline = false }: {
	plugin: NovelWriterPlugin;
	inline?: boolean;
}) {
	const { 
		novels, 
		activeNovelId, 
		setActiveNovel, 
		refreshNovels 
	} = useNovelWriter();
	const [open, setOpen] = useState(false);
	const active = novels.find((n) => n.novela.id_novela === activeNovelId);

	const handleSelectNovel = (idNovela: string) => {
		setActiveNovel(idNovela);
		setOpen(false);
	};

	const handleNewNovel = async () => {
		setOpen(false);
		await (plugin.app as any).commands.executeCommandById("novel-writer-ai:create-novel");
		await refreshNovels();
	}

	return (
		<div className={inline ? "nw-switcher nw-switcher-inline" : "nw-switcher"}
		>
			{inline && <h3>Novelas</h3>}
			<button className="nw-switcher-btn" onClick={() => setOpen(!open)}>
				<span className="nw-switcher-name">
					{active?.novela.nombre ?? "Elegir novela"}
				</span>
				{active?.novela.autor && (
					<span className="nw-switcher-author">
						{active.novela.autor}
					</span>
				)}
				<span className="nw-switcher-caret">?</span>
			</button>
			{open && (
				<div className="nw-switcher-menu">
					{novels.map((n) => (
						<button
							key={n.novela.id_novela}
							className={`nw-switcher-item ${
								n.novela.id_novela === activeNovelId
									? "active"
									: ""
							}`}
							onClick={() => handleSelectNovel(n.novela.id_novela)}
						>
							<span className="nw-switcher-item-name">
								{n.novela.nombre}
							</span>
							{n.novela.autor && (
								<span className="nw-switcher-item-author">
									{n.novela.autor}
								</span>
							)}
						</button>
					))}
					<hr />
					<button
						className="nw-switcher-item"
						onClick={() => handleNewNovel()}
					>
						+ Crear nueva novela
					</button>
				</div>
			)}
		</div>
	);
}
