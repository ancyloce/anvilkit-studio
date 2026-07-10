// NOTE: `getStrictContext` is deliberately NOT re-exported here. It is the
// only React-coupled helper, and a static re-export would pull `react` into
// the module graph of every plain-Node consumer of the main entry —
// conflicting with this package's foundation-layer role (restructure plan
// 0001, Phase 4). It stays published via the `./*` subpath:
// `import { getStrictContext } from "@anvilkit/utils/get-strict-context"`.
export { type DebouncedFunction, debounce } from "./debounce.js";
export { type DeepPartial, deepMerge } from "./deep-merge.js";
export { generateId } from "./generate-id.js";
export { invariant } from "./invariant.js";
