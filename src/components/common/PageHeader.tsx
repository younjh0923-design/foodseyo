import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { IconButton } from "@/components/common/Controls";

interface PageHeaderProps {
  title: string;
  description?: string;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  action?: ReactNode;
  compact?: boolean;
}

export function PageHeader({
  title,
  description,
  backHref,
  onBack,
  backLabel = "Go back",
  action,
  compact = false,
}: PageHeaderProps) {
  const backControl = backHref ? (
    <Link
      href={backHref}
      aria-label={backLabel}
      className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] transition-colors hover:bg-[var(--canvas)] active:bg-[var(--border)]"
    >
      <ArrowLeft className="size-5" aria-hidden="true" />
    </Link>
  ) : onBack ? (
    <IconButton label={backLabel} onClick={onBack}>
      <ArrowLeft className="size-5" aria-hidden="true" />
    </IconButton>
  ) : (
    <span className="size-11" aria-hidden="true" />
  );

  return (
    <header className="safe-top page-padding bg-[var(--surface)]">
      <div className="flex items-center justify-between gap-3">
        {backControl}
        {compact ? <h1 className="truncate text-base font-bold">{title}</h1> : <span />}
        {action ?? <span className="size-11" aria-hidden="true" />}
      </div>
      {!compact ? (
        <div className="pb-5 pt-5">
          <h1 className="text-[30px] font-bold leading-[1.08] tracking-[-0.04em]">{title}</h1>
          {description ? (
            <p className="mt-2 max-w-[34ch] text-sm leading-5 text-[var(--text-secondary)]">{description}</p>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}
