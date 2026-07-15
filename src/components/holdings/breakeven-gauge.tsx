import { cn } from '@/lib/utils';

type BreakevenGaugeProps = {
  avgCost: number;
  breakeven: number;
  currency: string;
  className?: string;
};

export function BreakevenGauge({
  avgCost,
  breakeven,
  currency,
  className,
}: BreakevenGaugeProps) {
  const min = Math.min(avgCost, breakeven);
  const max = Math.max(avgCost, breakeven);
  const range = max - min;
  const pad = range > 0 ? range * 0.25 : Math.max(1, max * 0.1);
  const rangeMin = min - pad;
  const span = max + pad - rangeMin || 1;

  const avgCostPos = ((avgCost - rangeMin) / span) * 100;
  const breakevenPos = ((breakeven - rangeMin) / span) * 100;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative h-2 rounded-sm bg-muted">
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-ink"
          style={{ left: `${avgCostPos}%` }}
          title={`Avg cost: ${avgCost.toFixed(4)} ${currency}`}
        />
        <div
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-gold"
          style={{ left: `${breakevenPos}%` }}
          title={`Breakeven: ${breakeven.toFixed(4)} ${currency}`}
        />
      </div>
      <div className="flex justify-between font-mono text-xs text-muted-foreground">
        <span>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-ink" />
          Avg cost {avgCost.toFixed(4)} {currency}
        </span>
        <span>
          <span className="mr-1 inline-block size-1.5 rounded-full bg-gold" />
          Breakeven {breakeven.toFixed(4)} {currency}
        </span>
      </div>
    </div>
  );
}
