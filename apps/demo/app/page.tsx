import Link from "next/link";
import styles from "./page.module.css";

export default function Home() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Anvilkit x Puck</p>
        <h1 className={styles.title}>
          Build publishable components that are ready for the editor and safe to render on the
          server.
        </h1>
        <p className={styles.lede}>
          This demo app validates the `packages/components` workspace against a real Puck setup. The
          current surface includes the retrofitted `@anvilkit/button` and `@anvilkit/input`
          packages plus the new Turbo Gen scaffolds for content, layout, and form blocks.
        </p>
        <div className={styles.actions}>
          <Link href="/puck/editor" className={styles.primary}>
            Open editor surface
          </Link>
          <Link href="/puck/render" className={styles.secondary}>
            Open render surface
          </Link>
        </div>
      </section>

      <section className={styles.grid}>
        <article className={styles.card}>
          <span className={styles.cardLabel}>Included blocks</span>
          <h2>Workspace packages</h2>
          <ul className={styles.list}>
            <li>`@anvilkit/button` with Puck metadata, serializable props, and edit-safe links.</li>
            <li>`@anvilkit/input` with editor-safe form behavior and shareable default props.</li>
            <li>Turbo Gen scaffolds for `content`, `layout`, and `form` component packages.</li>
          </ul>
        </article>

        <article className={styles.card}>
          <span className={styles.cardLabel}>Generator flow</span>
          <h2>Create a new block</h2>
          <code className={styles.command}>cd packages/components && pnpm gen:component</code>
          <p className={styles.cardBody}>Use named flags for scripting or CI-friendly scaffolding:</p>
          <code className={styles.command}>
            pnpm gen:component -- --name hero-banner --label "Hero Banner" --template content
            --category marketing
          </code>
        </article>

        <article className={styles.card}>
          <span className={styles.cardLabel}>Compatibility notes</span>
          <h2>Puck-first contract</h2>
          <ul className={styles.list}>
            <li>Each package exports `componentConfig`, `defaultProps`, `fields`, and `metadata`.</li>
            <li>All editable props stay serializable so they can live inside Puck data.</li>
            <li>Interactive behavior is disabled in edit mode so the editor stays stable.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
