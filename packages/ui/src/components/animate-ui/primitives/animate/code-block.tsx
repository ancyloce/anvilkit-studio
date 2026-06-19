"use client";

import * as React from "react";

import {
  useIsInView,
  type UseIsInViewOptions,
} from "@anvilkit/ui/hooks/use-is-in-view";

const DEFAULT_CODE_BLOCK_THEMES = {
  light: "github-light",
  dark: "github-dark",
};

type CodeBlockProps = React.ComponentProps<"div"> & {
  code: string;
  lang: string;
  theme?: "light" | "dark";
  themes?: { light: string; dark: string };
  writing?: boolean;
  duration?: number;
  delay?: number;
  onDone?: () => void;
  onWrite?: (info: { index: number; length: number; done: boolean }) => void;
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
} & UseIsInViewOptions;

function CodeBlock({
  ref,
  code,
  lang,
  theme = "light",
  themes = DEFAULT_CODE_BLOCK_THEMES,
  writing = false,
  duration = 5000,
  delay = 0,
  onDone,
  onWrite,
  scrollContainerRef,
  inView = false,
  inViewOnce = true,
  inViewMargin = "0px",
  ...props
}: CodeBlockProps) {
  const { ref: localRef, isInView } = useIsInView(
    ref as React.Ref<HTMLDivElement>,
    {
      inView,
      inViewOnce,
      inViewMargin,
    },
  );

  const [highlightedCode, setHighlightedCode] = React.useState("");
  const [isDone, setIsDone] = React.useState(false);
  const highlightRequestId = React.useRef(0);

  const highlightCode = React.useCallback(
    async (visibleCode: string) => {
      const requestId = highlightRequestId.current + 1;
      highlightRequestId.current = requestId;

      if (!visibleCode.length || !isInView) {
        setHighlightedCode("");
        return;
      }

      try {
        const { codeToHtml } = await import("shiki");

        const highlighted = await codeToHtml(visibleCode, {
          lang,
          themes,
          defaultColor: theme,
        });

        if (highlightRequestId.current === requestId) {
          setHighlightedCode(highlighted);
        }
      } catch (e) {
        console.error(`Language "${lang}" could not be loaded.`, e);
      }
    },
    [isInView, lang, theme, themes],
  );

  React.useEffect(() => {
    if (!writing) {
      void highlightCode(code);
      onDone?.();
      onWrite?.({ index: code.length, length: code.length, done: true });
      return;
    }

    if (!code.length || !isInView) return;

    const characters = Array.from(code);
    let index = 0;
    const totalDuration = duration;
    const interval = totalDuration / characters.length;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const timeout = setTimeout(() => {
      intervalId = setInterval(() => {
        if (index < characters.length) {
          const nextChar = characters.slice(0, index + 1).join("");
          void highlightCode(nextChar);
          onWrite?.({
            index: index + 1,
            length: characters.length,
            done: false,
          });
          index += 1;
          localRef.current?.scrollTo({
            top: localRef.current?.scrollHeight,
            behavior: "smooth",
          });
        } else {
          clearInterval(intervalId);
          setIsDone(true);
          onDone?.();
          onWrite?.({
            index: characters.length,
            length: characters.length,
            done: true,
          });
        }
      }, interval);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [
    code,
    duration,
    delay,
    highlightCode,
    isInView,
    writing,
    onDone,
    onWrite,
    localRef,
  ]);

  React.useEffect(() => {
    if (!writing || !isInView) return;
    const el =
      scrollContainerRef?.current ??
      (localRef.current?.parentElement as HTMLElement | null) ??
      (localRef.current as unknown as HTMLElement | null);

    if (!el) return;

    requestAnimationFrame(() => {
      el.scrollTo({
        top: el.scrollHeight,
        behavior: "smooth",
      });
    });
  }, [highlightedCode, writing, isInView, scrollContainerRef, localRef]);

  return (
    <div
      ref={localRef}
      data-slot="code-block"
      data-writing={writing}
      data-done={isDone}
      dangerouslySetInnerHTML={{ __html: highlightedCode }}
      {...props}
    />
  );
}

export { CodeBlock, type CodeBlockProps };
