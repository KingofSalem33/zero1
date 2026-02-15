interface ErrorStateProps {
  title: string;
  detail?: string;
  onRetry?: () => void;
}

export function ErrorState({ title, detail, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-1">
      <svg
        className="w-12 h-12 mb-3 text-neutral-500"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <p className="text-neutral-400 text-sm">{title}</p>
      {detail && <p className="text-neutral-500 text-xs">{detail}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-sm rounded-lg transition-colors border border-neutral-700/50"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
