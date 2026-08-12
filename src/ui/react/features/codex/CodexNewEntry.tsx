import { useState, useEffect, useRef } from "react";
import { useNovelWriter } from '../../store/novelWriterStore';
import { Icon } from '../../components/Icon';

const CodexNewEntry = ({ createAndEdit } : { createAndEdit: (idCat: string) => Promise<void> }) => {
    const { categorias } = useNovelWriter();
    const [ open, setOpen ] = useState(false);
	const addRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        const onDocNewEntry = (e: MouseEvent) => {
            if (addRef.current && !addRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocNewEntry);
        return () => document.removeEventListener('mousedown', onDocNewEntry);
    }, []);
    
    const handleCreateAndEdit = async (idCat: string) => {
        setOpen(false);
        createAndEdit(idCat);
    };

	return (
		<div ref={addRef} style={{ position: "relative" }}>
			<button
				className="nw-btn nw-btn-primary nw-btn-add-entry"
				onClick={() => setOpen(!open)}
				title="Nueva entrada"
			>
				<Icon.Plus width={12} height={12} />
				<span>New Entry</span>
			</button>
			{open && (
				<div
					className="nw-dropdown nw-popover"
					style={{ minWidth: 200, right: 0, left: "auto" }}
				>
					<div
						className="nw-popover-item"
						onClick={() => handleCreateAndEdit("")}
					>
						<span
							style={{
								width: 14,
								display: "inline-flex",
								justifyContent: "center",
							}}
						>
							<span
								className="nw-color-dot"
								style={{
									background: "transparent",
									boxShadow:
										"inset 0 0 0 1px var(--background-modifier-border)",
								}}
							/>
						</span>
						<span style={{ flex: 1 }}>Entrada Global (Otros)</span>
					</div>
					{categorias.map((c) => (
						<div
							key={c.id_categoria}
							className="nw-popover-item"
							onClick={() => handleCreateAndEdit(c.id_categoria)}
						>
							<span
								style={{
									width: 14,
									display: "inline-flex",
									justifyContent: "center",
								}}
							>
								<span
									className="nw-color-dot"
									style={{ background: c.color }}
								/>
							</span>
							<span style={{ flex: 1 }}>{c.nombre}</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
};

export default CodexNewEntry;
