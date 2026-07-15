"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode } from "react";

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  panelClassName?: string;
  contentClassName?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  panelClassName = "",
  contentClassName = "",
}: BottomSheetProps) {
  const titleId = useId();
  const descriptionId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");

      if (!focusable.length) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="presentation">
      <button
        type="button"
        aria-label="Close sheet backdrop"
        tabIndex={-1}
        className="absolute inset-0 w-full bg-black/40"
        onClick={onClose}
      />
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative z-10 flex max-h-[92dvh] w-full max-w-[430px] flex-col overflow-hidden rounded-t-[30px] border border-b-0 border-[var(--border)] bg-[var(--surface)] shadow-[0_-20px_70px_rgba(25,24,21,0.14)] ${panelClassName}`}
      >
        <div className="shrink-0 px-5 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--border-strong)]" aria-hidden="true" />
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] pb-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-[26px] font-bold leading-tight tracking-[-0.03em]">
                {title}
              </h2>
              {description ? (
                <p id={descriptionId} className="mt-1.5 text-sm leading-5 text-[var(--text-secondary)]">
                  {description}
                </p>
              ) : null}
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label={`Close ${title}`}
              onClick={onClose}
              className="flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--canvas)] active:bg-[var(--border)]"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto px-5 ${contentClassName}`}>{children}</div>
      </section>
    </div>
  );
}
