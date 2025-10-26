import React, { useEffect, useRef, ReactNode } from "react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  closeOnEscape?: boolean;
  closeOnOverlayClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  size = "lg",
  closeOnEscape = true,
  closeOnOverlayClick = true,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<unknown>(null);

  // Focus trap implementation
  useEffect(() => {
    if (!isOpen) return;

    // Store the element that was focused before modal opened
    previousActiveElement.current = document.activeElement;

    // Focus the modal
    modalRef.current?.focus();

    // Handle Tab key for focus trapping
    const handleTabKey = (e: unknown) => {
      const event = e as React.KeyboardEvent;
      if (!modalRef.current) return;

      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.key === "Tab") {
        if (event.shiftKey && document.activeElement === firstElement) {
          event.preventDefault();
          if (lastElement && "focus" in lastElement) {
            (lastElement as { focus(): void }).focus();
          }
        } else if (!event.shiftKey && document.activeElement === lastElement) {
          event.preventDefault();
          if (firstElement && "focus" in firstElement) {
            (firstElement as { focus(): void }).focus();
          }
        }
      }
    };

    document.addEventListener("keydown", handleTabKey);

    // Restore focus when modal closes
    return () => {
      document.removeEventListener("keydown", handleTabKey);
      const prevElement = previousActiveElement.current;
      if (
        prevElement &&
        typeof (prevElement as { focus?: () => void }).focus === "function"
      ) {
        (prevElement as { focus(): void }).focus();
      }
    };
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: unknown) => {
      const event = e as React.KeyboardEvent;
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-2xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={closeOnOverlayClick ? onClose : undefined}
      style={{ animation: "fadeIn 200ms ease-out" }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        style={{ animation: "fadeIn 200ms ease-out" }}
      />

      {/* Modal Content */}
      <div
        ref={modalRef}
        tabIndex={-1}
        className={`relative ${sizeClasses[size]} w-full bg-neutral-900 border border-neutral-700/50 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] focus:outline-none`}
        onClick={(e) => e.stopPropagation()}
        style={{ animation: "slideUp 300ms cubic-bezier(0.4, 0, 0.2, 1)" }}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </div>
  );
};

// Modal Header Component
export const ModalHeader: React.FC<{
  title: string;
  subtitle?: string;
  onClose: () => void;
}> = ({ title, subtitle, onClose }) => (
  <div className="flex items-start justify-between px-6 py-4 border-b border-neutral-700/50">
    <div>
      <h2 className="text-xl font-bold text-white">{title}</h2>
      {subtitle && <p className="text-sm text-neutral-400 mt-1">{subtitle}</p>}
    </div>
    <button
      onClick={onClose}
      className="btn-icon-ghost w-8 h-8 flex-shrink-0"
      aria-label="Close modal"
    >
      <svg
        className="w-5 h-5"
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
);

// Modal Body Component
export const ModalBody: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="flex-1 overflow-y-auto px-6 py-4">{children}</div>
);

// Modal Footer Component
export const ModalFooter: React.FC<{ children: ReactNode }> = ({
  children,
}) => (
  <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-700/50 bg-neutral-800/30">
    {children}
  </div>
);
