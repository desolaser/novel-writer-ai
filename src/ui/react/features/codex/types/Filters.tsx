type Filters = {
    hasNotes: TriState;
    hasDescription: TriState;
    hasThumbnail: TriState;
    hasTags: TriState;
    isGlobal: TriState;
    isBeingTracked: TriState;
    isArchived: boolean;
    categoryFilters: Record<string, TriState>;
};
type TriState = null | true | false;

const EMPTY_FILTERS: Filters = {
    hasNotes: null, 
    hasDescription: null, 
    hasThumbnail: null,
    hasTags: null,
    isGlobal: null, 
    isBeingTracked: null, 
    isArchived: false, 
    categoryFilters: {},
};

export type {
    Filters,
    TriState,
}
export {
    EMPTY_FILTERS
}