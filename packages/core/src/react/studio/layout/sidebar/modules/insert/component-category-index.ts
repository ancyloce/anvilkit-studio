/**
 * @file Reverse index from Puck component name → declared category.
 *
 * Puck's `Config.categories` is a `Record<categoryName, { components: name[] }>`
 * map declared by the host. Default insert-section predicates classify
 * components via this `category` field, so we flatten the map once per
 * Config render and look each component up in O(1).
 *
 * The Drawer.Item children Puck supplies to the `drawer` override
 * carry only the component name in their `name` prop — there is no
 * direct route to the source component's metadata. The Config's
 * categories block is the canonical source of truth that Puck's own
 * default drawer uses to group items, so we mirror its grouping.
 */

import type { Config as PuckConfig } from "@puckeditor/core";

/**
 * Build a `componentName → categoryName` map from a Puck `Config`.
 *
 * Components that appear in multiple categories (Puck allows this)
 * resolve to the **first** declaring category, matching Puck's own
 * iteration order so the sidebar stays consistent with what Puck
 * surfaces by default. Components that are not listed under any
 * category yield `undefined` from {@link getComponentCategory}.
 */
export function buildComponentCategoryIndex(
  config: PuckConfig | undefined,
): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  const categories = config?.categories;
  if (categories === undefined) {
    return index;
  }
  for (const [categoryName, category] of Object.entries(categories)) {
    const components = category?.components;
    if (components === undefined) continue;
    for (const componentName of components) {
      if (!index.has(componentName)) {
        index.set(componentName, categoryName);
      }
    }
  }
  return index;
}

/**
 * Look up a component's declared category. Returns `undefined` for
 * components that are not assigned to any category in the Config.
 */
export function getComponentCategory(
  index: ReadonlyMap<string, string>,
  componentName: string,
): string | undefined {
  return index.get(componentName);
}
