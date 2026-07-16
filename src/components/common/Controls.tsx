import { forwardRef, type ButtonHTMLAttributes } from "react";

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
