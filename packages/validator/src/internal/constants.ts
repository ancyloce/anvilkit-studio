// Per-tree depth budget shared by validateAiOutput's node walk and the
// Zod schema builder. Bumping this is a contract change — the README
// documents 16 as the published invariant.
export const MAX_DEPTH = 16;
