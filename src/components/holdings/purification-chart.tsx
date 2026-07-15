'use client';

import { Bar, BarChart, XAxis, YAxis, CartesianGrid } from 'recharts';
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { HoldingRow } from '@/components/holdings/holdings-table';

type Props = {
  rows: HoldingRow[];
};

const chartConfig = {
  amount: {
    label: 'Amount',
    color: 'var(--chart-1)',
  },
} satisfies ChartConfig;

export function PurificationChart({ rows }: Props) {
  // Top 10 companies by total purification amount (gains + dividends)
  const data = rows
    .map((row) => ({
      name: row.ticker,
      fullName: row.name,
      value: row.gainsToPurify + row.dividendsToPurify,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  if (data.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top companies by purification needed</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer
          config={chartConfig}
          className="min-h-[200px] w-full"
          initialDimension={{ width: 600, height: 300 }}
        >
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tickFormatter={(v: number) => v.toFixed(0)} />
            <YAxis
              type="category"
              dataKey="name"
              width={60}
              tick={{ fontSize: 12 }}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => [
                    typeof value === 'number'
                      ? value.toFixed(2)
                      : String(value),
                    'Amount',
                  ]}
                  labelFormatter={(label, payload) => {
                    const item = payload?.[0] as
                      { payload?: { fullName?: string } } | undefined;
                    return item?.payload?.fullName ?? String(label);
                  }}
                />
              }
            />
            <Bar
              dataKey="value"
              fill="var(--color-amount, var(--chart-1))"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
