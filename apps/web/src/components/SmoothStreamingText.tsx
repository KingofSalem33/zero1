import { useState, useEffect, useRef } from "react";
import { MessageStream } from "./golden-thread/MessageStream";

interface SmoothStreamingTextProps {
  content: string;
  onVerseClick?: (reference: string) => void;
  onTrace?: (reference: string) => void;
}

/**
 * Wraps MessageStream with smooth line-by-line text delivery.
 * Content flows out one line at a time, fast but visible.
 */
export function SmoothStreamingText({
  content,
  onVerseClick,
  onTrace,
}: SmoothStreamingTextProps) {
  const [displayedContent, setDisplayedContent] = useState("");
  const contentRef = useRef(content);
  const displayedIndexRef = useRef(0);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);

  // Update content ref
  contentRef.current = content;

  // Time between lines in ms - fast but perceptible
  const LINE_DELAY_MS = 35;

  useEffect(() => {
    // Reset if new message (content shorter than displayed)
    if (content.length < displayedIndexRef.current) {
      displayedIndexRef.current = 0;
      lastTimeRef.current = 0;
      setDisplayedContent("");
    }

    const animate = (timestamp: number) => {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastTimeRef.current;
      const targetContent = contentRef.current;
      const currentIndex = displayedIndexRef.current;

      if (currentIndex < targetContent.length) {
        // Find next line break or end of content
        if (elapsed >= LINE_DELAY_MS) {
          let nextIndex = targetContent.indexOf("\n", currentIndex);

          // If no newline found, take next chunk of ~80 chars or to end
          if (nextIndex === -1 || nextIndex > currentIndex + 120) {
            // Find a good break point (space, period, etc)
            const searchEnd = Math.min(currentIndex + 80, targetContent.length);
            let breakPoint = searchEnd;

            // Look for natural break points
            for (let i = searchEnd; i > currentIndex; i--) {
              const char = targetContent[i];
              if (
                char === " " ||
                char === "." ||
                char === "," ||
                char === "\n"
              ) {
                breakPoint = i + 1;
                break;
              }
            }
            nextIndex = breakPoint;
          } else {
            nextIndex = nextIndex + 1; // Include the newline
          }

          displayedIndexRef.current = nextIndex;
          setDisplayedContent(targetContent.slice(0, nextIndex));
          lastTimeRef.current = timestamp;
        }

        rafRef.current = window.requestAnimationFrame(animate);
      }
    };

    rafRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [content]);

  return (
    <MessageStream
      content={displayedContent}
      onVerseClick={onVerseClick}
      onTrace={onTrace}
    />
  );
}
