"use client";

import Link from "next/link";
import { useState } from "react";
import { Puck, type Data } from "@puckeditor/core";
import type { DemoComponents } from "../../../lib/puck-demo";
import { createDemoData, demoConfig } from "../../../lib/puck-demo";
import styles from "../puck.module.css";

export default function PuckEditorPage() {
  const [publishedData, setPublishedData] = useState<Data<DemoComponents>>(() =>
    createDemoData(),
  );

  return (
    <main className={styles.shell}>
      <section className={styles.masthead}>
        <div>
          <p className={styles.eyebrow}>Editor Validation</p>
          <h1 className={styles.title}>Puck editor surface for the Anvilkit component packages.</h1>
          <p className={styles.lede}>
            This route uses the real package exports from `@anvilkit/button` and `@anvilkit/input`,
            composed into a consumer-owned Puck `Config`.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/" className={styles.secondaryAction}>
            Back to demo hub
          </Link>
          <Link href="/puck/render" className={styles.primaryAction}>
            View shared render surface
          </Link>
        </div>
      </section>

      <section className={styles.panel}>
        <Puck
          config={demoConfig}
          data={publishedData}
          headerPath="/"
          headerTitle="Anvilkit Components"
          height="70vh"
          onPublish={setPublishedData}
        />
      </section>

      <section className={styles.snapshot}>
        <div className={styles.snapshotHeader}>
          <h2>Published data snapshot</h2>
          <p>The editor keeps its own draft state; this snapshot updates when you publish.</p>
        </div>
        <pre className={styles.codeBlock}>{JSON.stringify(publishedData, null, 2)}</pre>
      </section>
    </main>
  );
}
