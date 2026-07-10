"use client";

import * as React from "react";
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";

import {
  useIsInView,
  type UseIsInViewOptions,
} from "@anvilkit/ui/hooks/use-is-in-view";

const graphemeSegmenter =
  typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, {
        granularity: "grapheme",
      })
    : null;

function segmentGraphemes(text: string): string[] {
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(text), (s) => s.segment);
  }
  return Array.from(text);
}

type MorphingTextProps = Omit<HTMLMotionProps<"span">, "children"> & {
  delay?: number;
  loop?: boolean;
  holdDelay?: number;
  text: string | string[];
} & UseIsInViewOptions;

function MorphingText({
  ref,
  text,
  initial = { opacity: 0, scale: 0.8, filter: "blur(10px)" },
  animate = { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit = { opacity: 0, scale: 0.8, filter: "blur(10px)" },
  variants,
  transition = { type: "spring", stiffness: 125, damping: 25, mass: 0.4 },
  delay = 0,
  inView = false,
  inViewMargin = "0px",
  inViewOnce = true,
  loop = false,
  holdDelay = 2500,
  ...props
}: MorphingTextProps) {
  const { ref: localRef, isInView } = useIsInView(
    ref as React.Ref<HTMLElement>,
    {
      inView,
      inViewOnce,
      inViewMargin,
    },
  );

  const uniqueId = React.useId();

  const [currentIndex, setCurrentIndex] = React.useState(0);

  const currentText = React.useMemo(() => {
    if (Array.isArray(text)) {
      return text[currentIndex] ?? "";
    }
    return text;
  }, [text, currentIndex]);

  const chars = React.useMemo(() => {
    const graphemes = segmentGraphemes(currentText);
    const counts = new Map<string, number>();
    return graphemes.map((raw) => {
      const key = raw.normalize("NFC");
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return {
        layoutId: `${uniqueId}-${key}-${n}`,
        label: key === " " ? "\u00A0" : key,
      };
    });
  }, [currentText, uniqueId]);

  React.useEffect(() => {
    if (!isInView || !Array.isArray(text)) return;

    let currentIndex = 0;
    let interval: ReturnType<typeof setInterval> | undefined;

    const timeoutId = setTimeout(() => {
      interval = setInterval(() => {
        currentIndex++;
        if (currentIndex >= text.length) {
          if (!loop) {
            clearInterval(interval);
            return;
          } else {
            currentIndex = 0;
          }
        }
        setCurrentIndex(currentIndex);
      }, holdDelay);
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isInView, delay, loop, text, holdDelay]);

  return (
    <motion.span ref={localRef} aria-label={currentText} {...props}>
      <AnimatePresence mode="popLayout" initial={false}>
        {chars.map((char) => (
          <motion.span
            key={char.layoutId}
            layoutId={char.layoutId}
            style={{ display: "inline-block" }}
            aria-hidden="true"
            initial={initial}
            animate={animate}
            exit={exit}
            variants={variants}
            transition={transition}
          >
            {char.label}
          </motion.span>
        ))}
      </AnimatePresence>
    </motion.span>
  );
}

export { MorphingText, type MorphingTextProps };
