/**
 * Vitest setup file that registers `@testing-library/jest-dom` matchers
 * (toBeInTheDocument, toHaveTextContent, etc.) on Vitest's `expect`.
 *
 * The `react-library` preset references this file via its `setupFiles`
 * entry; consumers do not import it directly.
 *
 * @see https://github.com/testing-library/jest-dom#with-vitest
 */
import "@testing-library/jest-dom/vitest";
