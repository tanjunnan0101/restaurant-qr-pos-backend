'use client';

import { ImageOff } from 'lucide-react';
import { useState } from 'react';

export function ProductImage({
  src,
  alt,
  compact = false,
}: {
  src: string | null;
  alt: string;
  compact?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className={`image-placeholder ${compact ? 'compact' : ''}`}>
        <ImageOff
          size={compact ? 18 : 26}
          strokeWidth={1.6}
          aria-hidden="true"
        />
        {!compact && <span>Freshly prepared</span>}
      </div>
    );
  }

  return (
    <img
      className={`product-image ${compact ? 'compact' : ''}`}
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
