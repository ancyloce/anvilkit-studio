"use client";

import { type Data, Puck } from "@puckeditor/core";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  createDemoData,
  createDemoModeHref,
  demoConfig,
  demoDataSearchParam,
  getDemoDataFromSearchParam,
  type DemoComponents,
} from "../../../lib/puck-demo";
import styles from "../puck.module.css";

export default function PuckEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const incomingData = searchParams.get(demoDataSearchParam);
  const [publishedData, setPublishedData] = useState<Data<DemoComponents>>(() =>
    createDemoData(),
  );
  const renderHref = createDemoModeHref("/puck/render", publishedData);

  useEffect(() => {
    setPublishedData(getDemoDataFromSearchParam(incomingData));
  }, [incomingData]);

  function handlePublish(nextPublishedData: Data<DemoComponents>) {
    setPublishedData(nextPublishedData);
    router.push(createDemoModeHref("/puck/render", nextPublishedData));
  }

  return (
    <main className={styles.shell}>
      <section className={styles.masthead}>
        <div>
          <p className={styles.eyebrow}>Editor Validation</p>
          <h1 className={styles.title}>
            Puck editor mode for the shared navbar and hero demo.
          </h1>
          <p className={styles.lede}>
            This route uses the real package exports from `@anvilkit/navbar` and
            `@anvilkit/hero`, composed into the same consumer-owned Puck
            `Config` used by render mode.
          </p>
        </div>
        <div className={styles.actions}>
          <Link href="/" className={styles.secondaryAction}>
            Back to demo hub
          </Link>
          <Link href={renderHref} className={styles.primaryAction}>
            Open render mode
          </Link>
        </div>
      </section>

      <section className={styles.panel}>
        <Puck
          config={demoConfig}
          data={publishedData}
          headerPath="/"
          headerTitle="Anvilkit Components"
          height="100vh"
          onPublish={handlePublish}
        />
      </section>

      <section className={styles.snapshot}>
        <div className={styles.snapshotHeader}>
          <h2>Published data snapshot</h2>
          <p>
            The editor keeps its own draft state; this snapshot updates when you
            publish.
          </p>
        </div>
        <pre className={styles.codeBlock}>
          {JSON.stringify(publishedData, null, 2)}
        </pre>
      </section>
    </main>
  );
}
