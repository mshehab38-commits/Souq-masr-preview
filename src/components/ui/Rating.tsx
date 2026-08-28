interface RatingProps {
  value: number;
  count?: number;
  size?: number;
}

function Star({ fill, size }: { fill: number; size: number }) {
  const gradientId = `star-fill-${Math.round(fill * 100)}`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId}>
          <stop offset={`${fill * 100}%`} stopColor="#E8940A" />
          <stop offset={`${fill * 100}%`} stopColor="#E5E7EB" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${gradientId})`}
        d="M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.1 1.3-6.6-4.9-4.6 6.6-.7z"
      />
    </svg>
  );
}

export function Rating({ value, count, size = 16 }: RatingProps) {
  const clamped = Math.max(0, Math.min(5, value));
  const stars = Array.from({ length: 5 }, (_, i) => Math.max(0, Math.min(1, clamped - i)));

  return (
    <div className="inline-flex items-center gap-1" role="img" aria-label={`تقييم ${clamped} من 5`}>
      <div className="flex">
        {stars.map((fill, i) => (
          <Star key={i} fill={fill} size={size} />
        ))}
      </div>
      <span className="text-sm font-medium text-neutral-700">{clamped.toFixed(1)}</span>
      {typeof count === "number" && (
        <span className="text-sm text-neutral-500">({count})</span>
      )}
    </div>
  );
}
