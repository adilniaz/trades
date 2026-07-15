import { cn } from '@/lib/utils';

type PurityBarProps = {
  /** 0-100, share of the position that's kept (compliant). */
  compliantPct: number;
  /** 0-100, share that needs to be purified. Supplied independently of
   * compliantPct (not always 100-compliantPct) to avoid rounding drift
   * when aggregating many small holdings. */
  purifyPct: number;
  size?: 'sm' | 'hero';
  showLabel?: boolean;
  className?: string;
};

export function PurityBar({
  compliantPct,
  purifyPct,
  size = 'sm',
  showLabel = size === 'hero',
  className,
}: PurityBarProps) {
  const compliant = Math.max(0, Math.min(100, compliantPct));
  const purify = Math.max(0, Math.min(100, purifyPct));
  const title = `${purify.toFixed(1)}% to purify`;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div
        className={cn(
          'flex w-full overflow-hidden rounded-sm bg-muted',
          size === 'hero' ? 'h-3' : 'h-1.5',
        )}
        title={size === 'sm' ? title : undefined}
        role="img"
        aria-label={title}
      >
        <div className="bg-ink" style={{ width: `${compliant}%` }} />
        <div className="bg-gold" style={{ width: `${purify}%` }} />
      </div>
      {showLabel && (
        <span className="font-mono text-xs text-muted-foreground">{title}</span>
      )}
    </div>
  );
}
