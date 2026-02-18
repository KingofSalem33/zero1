import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";

interface ShareSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** The text to share (verse + reference) */
  text: string;
  /** Optional pre-generated image blob for image sharing */
  imageBlob?: Blob | null;
  /** Optional reference string for file naming */
  reference?: string;
}

type ShareTarget = "x" | "facebook" | "whatsapp" | "copy" | "download";

export function ShareSheet({
  isOpen,
  onClose,
  text,
  imageBlob,
  reference,
}: ShareSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  // Mount → animate in, animate out → unmount
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      setCopied(false);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true));
      });
    } else {
      setVisible(false);
      const timer = setTimeout(() => setMounted(false), 250);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setTimeout(onClose, 250);
  }, [onClose]);

  useEffect(() => {
    if (!mounted) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    document.addEventListener("keydown", handleKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [mounted, handleClose]);

  if (!mounted) return null;

  const encodedText = encodeURIComponent(text);

  const handleShare = (target: ShareTarget) => {
    switch (target) {
      case "x":
        window.open(
          `https://x.com/intent/tweet?text=${encodedText}`,
          "_blank",
          "noopener,width=550,height=420",
        );
        break;
      case "facebook":
        window.open(
          `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent("https://biblelot.com")}&quote=${encodedText}`,
          "_blank",
          "noopener,width=550,height=420",
        );
        break;
      case "whatsapp":
        window.open(`https://wa.me/?text=${encodedText}`, "_blank", "noopener");
        break;
      case "copy":
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        });
        return; // Don't close
      case "download":
        if (imageBlob) {
          const fileName = reference
            ? `biblelot-${reference.replace(/\s+/g, "-").replace(/:/g, "-")}.png`
            : "biblelot-verse.png";
          const url = URL.createObjectURL(imageBlob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
        }
        break;
    }
    handleClose();
  };

  const socials: { id: ShareTarget; label: string; icon: React.ReactNode }[] = [
    {
      id: "x",
      label: "X",
      icon: (
        <svg
          className="w-4 h-4 text-white"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      ),
    },
    {
      id: "facebook",
      label: "Facebook",
      icon: (
        <svg
          className="w-4 h-4 text-[#1877F2]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      ),
    },
    {
      id: "whatsapp",
      label: "WhatsApp",
      icon: (
        <svg
          className="w-4 h-4 text-[#25D366]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      ),
    },
    {
      id: "copy",
      label: copied ? "Copied" : "Copy",
      icon: copied ? (
        <svg
          className="w-4 h-4 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      ),
    },
  ];

  return createPortal(
    <div
      className={`fixed inset-0 z-[90] flex items-end sm:items-center justify-center transition-opacity duration-250 ease-out ${visible ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      onClick={handleClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share"
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full max-w-[340px] mx-4 mb-6 sm:mb-0 bg-neutral-900/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl transition-all duration-250 ease-out ${
          visible ? "translate-y-0 scale-100" : "translate-y-6 scale-[0.97]"
        }`}
      >
        {/* Handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-8 h-0.5 rounded-full bg-neutral-700" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-3 sm:pt-5 pb-2">
          <h3 className="text-[13px] font-semibold text-white tracking-wide">
            Share
          </h3>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="p-1.5 -mr-1 rounded-lg text-neutral-500 hover:text-white hover:bg-white/10 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Preview */}
        <div className="mx-5 mb-5 px-3.5 py-3 bg-white/[0.04] border border-white/[0.06] rounded-xl">
          <p className="text-[11px] text-neutral-400 line-clamp-2 leading-relaxed italic">
            {text}
          </p>
        </div>

        {/* Social grid */}
        <div className="px-5 pb-5 grid grid-cols-4 gap-2">
          {socials.map((s) => (
            <button
              key={s.id}
              onClick={() => handleShare(s.id)}
              className="flex flex-col items-center gap-2 py-3 rounded-xl hover:bg-white/[0.06] active:scale-95 transition-all"
            >
              <div
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  s.id === "copy" && copied
                    ? "bg-green-500/15 ring-1 ring-green-500/20"
                    : "bg-white/[0.07]"
                }`}
              >
                {s.icon}
              </div>
              <span
                className={`text-[10px] font-medium transition-colors ${
                  s.id === "copy" && copied
                    ? "text-green-400"
                    : "text-neutral-500"
                }`}
              >
                {s.label}
              </span>
            </button>
          ))}
        </div>

        {/* Download image */}
        {imageBlob && (
          <div className="px-5 pb-5">
            <button
              onClick={() => handleShare("download")}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] rounded-xl text-[13px] text-neutral-400 hover:text-white transition-all active:scale-[0.98]"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download Image
            </button>
          </div>
        )}

        {!imageBlob && <div className="pb-1" />}
      </div>
    </div>,
    document.body,
  );
}
