import { useState, useEffect, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { useNovelWriter } from '../../store/novelWriterStore';
import { Icon } from '../../components/Icon';
import { EMPTY_FILTERS } from './types/Filters';
import type { Filters, TriState } from './types/Filters';

const CodexFilters = ({ 
    filters,
    setFilters
}: {
    filters: Filters,
    setFilters: Dispatch<SetStateAction<Filters>>
}) => {        
    const { categorias } = useNovelWriter();
    const [open, setOpen] = useState(false);
    const [catOpen, setCatOpen] = useState(false);
    const [filterStyle, setFilterStyle] = useState<React.CSSProperties>({});
    const filterRef = useRef<HTMLDivElement | null>(null);
    
    const totalActiveFilters =
        (filters.hasNotes !== null ? 1 : 0) +
        (filters.hasDescription !== null ? 1 : 0) +
        (filters.hasThumbnail !== null ? 1 : 0) +
        (filters.hasTags !== null ? 1 : 0) +
        (filters.isGlobal !== null ? 1 : 0) +
        (filters.isBeingTracked !== null ? 1 : 0) +
        (filters.isArchived ? 1 : 0) +
        Object.values(filters.categoryFilters).filter((v) => v !== null).length;

	const clearFilters = () => setFilters(EMPTY_FILTERS);

    useEffect(() => {
        const onDocFilters = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setOpen(false); 
                setCatOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocFilters);
        return () => document.removeEventListener('mousedown', onDocFilters);
    }, []);

    useEffect(() => {
        if (!open) { setFilterStyle({}); return; }
        const compute = () => {
            const btn = filterRef.current?.querySelector('button') as HTMLElement | null;
            if (!btn) return;
            const r = btn.getBoundingClientRect();
            const menuW = 240;
            const spaceRight = window.innerWidth - r.right;
            const spaceLeft = r.left;
            const flip = spaceRight < menuW && spaceLeft > spaceRight;
            setFilterStyle(flip
                ? { right: 0, left: 'auto', top: '100%' }
                : { left: 0, right: 'auto', top: '100%' });
        };
        compute();
        window.addEventListener('resize', compute);
        return () => window.removeEventListener('resize', compute);
    }, [open]);    
    
    const cycle = (cur: TriState): TriState => cur === null ? true : cur === true ? false : null;

    const setFilter = (
        key: keyof Omit<Filters, 'categoryFilters' | 'isArchived'>,
        v?: TriState
    ) => {
        const newFilters = {
            ...filters,
            [key]: v !== undefined ? v : cycle(filters[key])
        }
        setFilters(newFilters);
    };

    const setCategoryFilter = (catId: string) => {
        setFilters((f: Filters) => {
            const cur = f.categoryFilters[catId] ?? null;
            const next = cycle(cur);
            const map = { ...f.categoryFilters };
            if (next === null) delete map[catId]; else map[catId] = next;
            return { ...f, categoryFilters: map };
        });
    };

    return (
        <div ref={filterRef} style={{ position: 'relative' }}>
            <button
                className={'nw-btn nw-btn-icon nw-filter-btn' + (totalActiveFilters > 0 ? ' is-active' : '')}
                onClick={() => setOpen(!open)}
                title="Filtros"
            >
                <Icon.Filter />
                {totalActiveFilters > 0 && <span className="nw-filter-badge">{totalActiveFilters}</span>}
            </button>
            {open && (
                <div className="nw-dropdown nw-popover nw-filter-menu" style={{ minWidth: 220, ...filterStyle }}>
                    <FilterItem label="Has notes" state={filters.hasNotes} onClick={() => setFilter('hasNotes')} />
                    <FilterItem label="Has descripcion" state={filters.hasDescription} onClick={() => setFilter('hasDescription')} />
                    <FilterItem label="Has thumbnail" state={filters.hasThumbnail} onClick={() => setFilter('hasThumbnail')} />
                    <FilterItem label="Has tags" state={filters.hasTags} onClick={() => setFilter('hasTags')} />
                    <FilterItem label="Is global" state={filters.isGlobal} onClick={() => setFilter('isGlobal')} hint="AI policy: Always" />
                    <FilterItem label="Is being tracked" state={filters.isBeingTracked} onClick={() => setFilter('isBeingTracked')} hint="Tracking por nombre/alias" />
                    <hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
                    <FilterItem
                        label="Is archived"
                        state={filters.isArchived ? true : null}
                        noNegative
                        onClick={() => setFilters((f) => ({ ...f, isArchived: !f.isArchived }))}
                    />
                    <hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
                    <div className="nw-popover-row" onClick={() => setCatOpen((v) => !v)}>
                        <span style={{ flex: 1 }}>Filter by Category</span>
                        <Icon.ChevronRight width={12} height={12} />
                    </div>
                    {catOpen && (
                        <div className="nw-filter-submenu">
                            {categorias.length === 0 ? (
                                <div className="nw-popover-item nw-muted" style={{ padding: '6px 10px' }}>Sin categorias</div>
                            ) : categorias.map((c) => {
                                const st = filters.categoryFilters[c.id_categoria] ?? null;
                                return (
                                    <FilterCategoryItem
                                        key={c.id_categoria}
                                        label={c.nombre}
                                        color={c.color}
                                        state={st}
                                        onClick={() => setCategoryFilter(c.id_categoria)}
                                    />
                                );
                            })}
                        </div>
                    )}
                    <hr style={{ margin: '4px 0', border: 0, borderTop: '1px solid var(--background-modifier-border)' }} />
                    <div className={'nw-popover-row' + (totalActiveFilters === 0 ? ' is-disabled' : '')} onClick={totalActiveFilters === 0 ? undefined : clearFilters}>
                        <span style={{ flex: 1 }}>Clear Filters</span>
                    </div>
                </div>
            )}
        </div>
    )
}

function FilterItem({ label, state, onClick, noNegative, hint }: { label: string; state: TriState; onClick: () => void; noNegative?: boolean; hint?: string }) {
	return (
		<div className="nw-popover-row" onClick={onClick} title={hint}>
			<span className="nw-filter-state-slot">
				{state === true && <Icon.Check width={12} height={12} />}
				{state === false && !noNegative && <Icon.Minus width={12} height={12} />}
			</span>
			<span style={{ flex: 1 }}>{label}</span>
		</div>
	);
}

function FilterCategoryItem({ label, color, state, onClick }: { label: string; color: string; state: TriState; onClick: () => void }) {
	return (
		<div className="nw-popover-row" onClick={onClick}>
			<span className="nw-filter-state-slot">
				{state === true && <Icon.Check width={12} height={12} />}
				{state === false && <Icon.Minus width={12} height={12} />}
			</span>
			<span className="nw-color-dot" style={{ background: color }} />
			<span style={{ flex: 1 }}>{label}</span>
		</div>
	);
}

export default CodexFilters