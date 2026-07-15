"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

interface SafeImageProps {
  src: string | null;
  alt: string;
  className?: string;
  imagePosition?: string;
}

export function SafeImage({ src, alt, className = "", imagePosition }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={`${alt} placeholder`}
        className={`flex items-center justify-center bg-[#EFE9DF] text-[var(--muted)] ${className}`}
      >
        <ImageIcon aria-hidden="true" size={24} />
      </div>
    );
  }

  return (
    // Local demo assets do not require Next.js image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      style={{ objectPosition: imagePosition }}
      onError={() => setFailed(true)}
    />
  );
}
