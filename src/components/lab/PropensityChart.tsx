import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type SweepPoint = {
  bucket: string;
  emergenceRate: number;
  worlds: number;
};

export function PropensityChart({ data, knobLabel }: { data: SweepPoint[]; knobLabel: string }) {
  if (!data.length) {
    return (
      <div className="flex h-56 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted-foreground">
        Run a few configurations to build the sweep.
      </div>
    );
  }
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
          <CartesianGrid stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="bucket"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            label={{
              value: knobLabel,
              position: "insideBottom",
              offset: -2,
              fill: "var(--muted-foreground)",
              fontSize: 10,
            }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "var(--muted-foreground)", fontSize: 11, fontFamily: "var(--font-mono)" }}
            axisLine={{ stroke: "var(--border)" }}
            tickLine={false}
            unit="%"
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.4 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "var(--popover-foreground)",
            }}
            formatter={(v: number, _n, item) => [
              `${v}% of ${(item?.payload as SweepPoint)?.worlds ?? 0} worlds`,
              "coordination emerged",
            ]}
          />
          <Bar dataKey="emergenceRate" radius={[3, 3, 0, 0]}>
            {data.map((d) => (
              <Cell key={d.bucket} fill="var(--primary)" />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
