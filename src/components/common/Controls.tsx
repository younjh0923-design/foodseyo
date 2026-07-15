import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

function classes(...values: Array<string | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

const baseButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-bold transition-[background-color,border-color,color,transform] disabled:cursor-not-allowed disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]";

export const PrimaryButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function PrimaryButton({ className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={classes(
          baseButton,
          "bg-[var(--primary)] text-white hover:bg-[var(--primary-pressed)] active:bg-[var(--primary-pressed)]",
          className,
        )}
        {...props}
      />
    );
  },
);

export const SecondaryButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement>>(
  function SecondaryButton({ className, ...props }, ref) {
    return (
      <button
        ref={ref}
        className={classes(
          baseButton,
          "border border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--canvas)] active:bg-[var(--border)]",
          className,
        )}
        {...props}
      />
    );
  },
);

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function IconButton({ label, className, children, ...props }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={classes(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--canvas)] active:bg-[var(--border)] disabled:bg-[var(--disabled-bg)] disabled:text-[var(--disabled-text)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface ChoiceChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected: boolean;
}

export function ChoiceChip({ selected, className, children, ...props }: ChoiceChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={classes(
        "min-h-11 rounded-full border px-4 py-2 text-sm font-semibold transition-colors",
        selected
          ? "border-[var(--primary)] bg-[var(--soft-green)] text-[var(--primary)]"
          : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--canvas)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

interface ActionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  status?: string;
  href?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export function ActionCard({ icon, title, description, status, href, onClick, ariaLabel }: ActionCardProps) {
  const content = (
    <>
      <span className="flex size-11 items-center justify-center rounded-2xl bg-[var(--soft-green)] text-[var(--primary)]">
        {icon}
      </span>
      <span className="mt-5 block text-[15px] font-bold leading-5 text-[var(--text)]">{title}</span>
      <span className="mt-1 block text-xs leading-[18px] text-[var(--text-secondary)]">{description}</span>
      {status ? (
        <span className="mt-3 inline-flex min-h-6 max-w-full items-center rounded-2xl bg-[var(--canvas)] px-2.5 py-1 text-center text-[11px] font-bold leading-4 whitespace-normal break-words text-[var(--text-secondary)]">
          {status}
        </span>
      ) : null}
    </>
  );
  const cardClass =
    "h-full min-h-[172px] w-full overflow-hidden rounded-[24px] border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition-[background-color,border-color,transform] hover:border-[var(--border-strong)] hover:bg-[var(--canvas)] active:bg-[var(--canvas)]";

  return href ? (
    <Link href={href} aria-label={ariaLabel ?? title} className={cardClass}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={ariaLabel ?? title} className={cardClass}>
      {content}
    </button>
  );
}
