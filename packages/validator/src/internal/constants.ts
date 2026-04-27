// Node-tree depth budget for `validateAiOutput`'s `walkNode`. The
// README documents 16 as the published invariant; the schema-build
// recursion in `makeZodSchemaForField` reuses the same cap because
// AiFieldSchema nesting (array → array → array …) is bounded by the
// node tree it ultimately validates.
export const MAX_NODE_DEPTH = 16;

// Prop-value depth budget for `findNonSerializablePath`. A pure-data
// prop (theme dictionary, nested config) can legitimately be deeper
// than the node tree itself, so the limit is loosened here without
// touching the published node-tree contract.
export const MAX_PROP_DEPTH = 64;
