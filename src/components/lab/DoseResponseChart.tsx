import {
  CartesianGrid,
  ErrorBar,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DosePoint = {
  persistence: number;
  coordination_rate: number;
  empty_submission_rate: number;
  /** 95% Wilson interval as [below, above] offsets from the rate. */
  coordination_err?: [number, number];
};

export function DoseResponseChart({ data }: { data: DosePoint[] }) {
  if (!data.length) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        No sweep points recorded yet.
      </div>
    );
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 8 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="persistence"
            type="number"
            domain={[0, 1]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            label={{
              value: "persistence",
              position: "insideBottom",
              offset: -4,
              fill: "var(--muted-foreground)",
              fontSize: 10,
            }}
          />
          <YAxis
            domain={[0, 1]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            formatter={(v: number, n) => [v.toFixed(2), String(n)]}
          />
          <Legend wrapperStyle={{ fontSize: 11, fontFamily: "var(--font-mono)" }} />
          <Line
            type="monotone"
            dataKey="coordination_rate"
            name="coordination rate"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3 }}
          >
            <ErrorBar dataKey="coordination_err" width={6} strokeWidth={1.5} stroke="var(--primary)" />
          </Line>
          <Line
            type="monotone"
            dataKey="empty_submission_rate"
            name="empty submissions"
            stroke="var(--destructive)"
            strokeWidth={2}
            strokeDasharray="4 3"
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
