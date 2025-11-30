import { useState, useEffect, useRef } from 'react';

interface TextHighlightTooltipProps {
  onGoDeeper: (text: string) => void;
  userId?: string;
}

interface Position {
  top: number;
  left: number;
}

const API_URL = import.meta.env?.VITE_API_URL || "http://localhost:3001";

export function TextHighlightTooltip({ onGoDeeper, userId = "anonymous" }: TextHighlightTooltipProps) {
  const [selectedText, setSelectedText] = useState('');
  const [position, setPosition] = useState<Position | null>(null);
  const [description, setDescription] = useState('');
  const [isLoadingDescription, setIsLoadingDescription] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);
  const [bookmarkSuccess, setBookmarkSuccess] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line no-undef
  const abortControllerRef = useRef<AbortController | null>(null);
  const isStreamingRef = useRef(false);

  useEffect(() => {
    const handleMouseUp = async () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();

      if (text && text.length > 0) {
        const range = selection?.getRangeAt(0);
        const rect = range?.getBoundingClientRect();

        if (rect) {
          // Cancel any ongoing streaming
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
          }
          isStreamingRef.current = false;

          // Reset all state for new selection
          setSelectedText(text);
          setDescription('');
          setIsLoadingDescription(true);
          setIsVisible(false);

          // Position tooltip directly below the highlighted text
          const spacing = 12;
          const tooltipEstimatedWidth = 384; // max-w-sm = 24rem = 384px

          // Position below selection
          const top = rect.bottom + window.scrollY + spacing;

          // Center horizontally on the selection
          let left = rect.left + window.scrollX + rect.width / 2;

          // Keep tooltip within viewport horizontally
          const rightEdge = left + tooltipEstimatedWidth / 2;
          const leftEdge = left - tooltipEstimatedWidth / 2;

          if (rightEdge > window.innerWidth - 16) {
            left = window.innerWidth - tooltipEstimatedWidth / 2 - 16;
          } else if (leftEdge < 16) {
            left = tooltipEstimatedWidth / 2 + 16;
          }

          setPosition({
            top,
            left,
          });
          setBookmarkSuccess(false); // Reset bookmark state for new selection

          setTimeout(() => setIsVisible(true), 10);
          await generateAISynopsis(text);
        }
      } else {
        // Only close if not clicking inside the tooltip
        const clickedElement = document.activeElement;
        const isClickInsideTooltip = tooltipRef.current && clickedElement && tooltipRef.current.contains(clickedElement);

        if (!isClickInsideTooltip && position) {
          closeTooltip();
        }
      }
    };

    // eslint-disable-next-line no-undef
    const handleMouseDown = (e: MouseEvent) => {
      // Close tooltip if clicking outside
      // eslint-disable-next-line no-undef
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        closeTooltip();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      isStreamingRef.current = false;
    };
  }, []); // Empty dependency array - listeners set up once

  const closeTooltip = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    isStreamingRef.current = false;
    setIsVisible(false);
    setTimeout(() => {
      setPosition(null);
      setSelectedText('');
      setDescription('');
      setIsLoadingDescription(false);
      setBookmarkSuccess(false);
    }, 150);
  };

  const handleBookmark = async () => {
    if (!selectedText || isBookmarking || bookmarkSuccess) return;

    try {
      setIsBookmarking(true);

      const response = await fetch(`${API_URL}/api/bookmarks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: selectedText,
          userId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.error?.code === 'duplicate_bookmark') {
          // Already bookmarked - show success state anyway
          setBookmarkSuccess(true);
        } else {
          throw new Error('Failed to bookmark');
        }
      } else {
        setBookmarkSuccess(true);
      }
    } catch (error) {
      console.error('Error bookmarking text:', error);
    } finally {
      setIsBookmarking(false);
    }
  };

  const generateAISynopsis = async (text: string) => {
    try {
      // Create new abort controller for this request
      // eslint-disable-next-line no-undef
      abortControllerRef.current = new AbortController();
      isStreamingRef.current = true;

      const response = await fetch(`${API_URL}/api/synopsis`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: text,
          maxWords: 34,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Synopsis API error:', response.status, errorText);
        throw new Error(`Failed to generate synopsis: ${response.status}`);
      }

      const data = await response.json();
      const fullSynopsis = data.synopsis || 'Unable to generate synopsis.';

      // Check if we were cancelled before starting to stream
      if (!isStreamingRef.current) {
        return;
      }

      // Stream the text word by word
      setIsLoadingDescription(false);
      setDescription('');

      const words = fullSynopsis.split(' ');
      let currentText = '';

      for (let i = 0; i < words.length; i++) {
        if (!isStreamingRef.current) {
          // Streaming was cancelled
          return;
        }

        currentText += (i > 0 ? ' ' : '') + words[i];
        setDescription(currentText);

        // Wait between words for streaming effect
        await new Promise(resolve => setTimeout(resolve, 30));
      }

      isStreamingRef.current = false;
      abortControllerRef.current = null;
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was intentionally cancelled - this is normal
        console.log('Synopsis request cancelled');
        return;
      }
      console.error('Error generating synopsis:', error);
      setDescription('Click "Go Deeper" to explore this text further.');
      setIsLoadingDescription(false);
      isStreamingRef.current = false;
      abortControllerRef.current = null;
    }
  };

  const handleGoDeeper = () => {
    if (selectedText) {
      onGoDeeper(selectedText);
      closeTooltip();
      window.getSelection()?.removeAllRanges();
    }
  };

  if (!position || !selectedText) {
    return null;
  }

  return (
    <div
      ref={tooltipRef}
      className={`fixed z-[70] transform -translate-x-1/2 transition-all duration-150 ease-out ${
        isVisible ? 'opacity-100' : 'opacity-0 -translate-y-2'
      }`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Compact, dynamic card */}
      <div className="relative bg-white/[0.08] backdrop-blur-2xl border border-white/10 rounded-lg shadow-xl overflow-hidden max-w-sm">
        {/* Close button */}
        <button
          onClick={closeTooltip}
          className="absolute top-2 right-2 p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/10 transition-all duration-150 z-10"
          aria-label="Close"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Content */}
        <div className="p-3 pr-8">
          {/* Synopsis - compact single area */}
          {isLoadingDescription ? (
            <div className="flex items-center gap-2 py-1.5">
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:150ms]" />
              <div className="w-1 h-1 rounded-full bg-blue-400 animate-pulse [animation-delay:300ms]" />
              <span className="text-xs text-neutral-400 ml-1 font-medium">
                Analyzing
              </span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-[13px] leading-relaxed text-neutral-200 font-normal">
                {description}
                {description && isStreamingRef.current && <span className="inline-block w-1 h-3 ml-0.5 bg-blue-400 animate-pulse" />}
              </p>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleGoDeeper}
                  className="group px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 hover:text-blue-300 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5"
                >
                  <span>Go Deeper</span>
                  <svg
                    className="w-3 h-3 transition-transform group-hover:translate-x-0.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>

                <button
                  onClick={handleBookmark}
                  disabled={isBookmarking || bookmarkSuccess}
                  className={`group px-2.5 py-1.5 text-xs font-medium rounded-md transition-all duration-200 flex items-center gap-1.5 ${
                    bookmarkSuccess
                      ? 'bg-green-500/20 text-green-400 cursor-default'
                      : isBookmarking
                      ? 'bg-white/5 text-neutral-400 cursor-wait'
                      : 'bg-white/5 hover:bg-white/10 text-neutral-400 hover:text-neutral-200'
                  }`}
                  title={bookmarkSuccess ? 'Saved to bookmarks' : 'Save to bookmarks'}
                >
                  {bookmarkSuccess ? (
                    <>
                      <svg className="w-3.5 h-3.5 transition-transform scale-110" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
                      </svg>
                      <svg className="w-2.5 h-2.5 absolute ml-0.5 mt-0.5" fill="none" stroke="white" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </>
                  ) : isBookmarking ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5 transition-all group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Arrow pointer - pointing up to highlighted text */}
      <div className="absolute left-1/2 transform -translate-x-1/2" style={{ top: '0', transform: 'translate(-50%, -100%)' }}>
        {/* Arrow shadow */}
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-1">
          <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-black/20 blur-sm" />
        </div>
        {/* Main arrow */}
        <div className="w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-b-[8px] border-b-white/[0.08]" />
        {/* Arrow border */}
        <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2">
          <div className="w-0 h-0 border-l-[9px] border-l-transparent border-r-[9px] border-r-transparent border-b-[9px] border-b-white/10" />
        </div>
      </div>
    </div>
  );
}
