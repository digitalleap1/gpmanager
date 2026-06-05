interface BarSeries {
  name: string;
  /** Any valid CSS color (e.g. a hex or `hsl(var(--primary))`). */
  color: string;
  values: number[];
}

interface BarChartProps {
  labels: string[];
  series: BarSeries[];
}

/**
 * Dependency-free grouped bar chart built with flex/divs + Tailwind.
 * Renders one group per label, with one bar per series in each group.
 * Bar heights are scaled to the max value across all series.
 */
export function BarChart({ labels, series }: BarChartProps) {
  const max = Math.max(
    1,
    ...series.flatMap((s) => s.values.map((v) => (Number.isFinite(v) ? v : 0))),
  );

  return (
    <div>
      {/* Legend */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {series.map((s) => (
          <div key={s.name} className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ backgroundColor: s.color }}
              aria-hidden="true"
            />
            <span className="text-xs text-muted-foreground">{s.name}</span>
          </div>
        ))}
      </div>

      {/* Plot area */}
      <div className="flex h-48 items-end gap-1 sm:gap-2">
        {labels.map((label, i) => (
          <div
            key={`${label}-${i}`}
            className="flex h-full flex-1 flex-col items-center justify-end gap-1"
          >
            <div className="flex h-full w-full items-end justify-center gap-0.5">
              {series.map((s) => {
                const value = s.values[i] ?? 0;
                const heightPct = Math.max(0, (value / max) * 100);
                return (
                  <div
                    key={s.name}
                    className="group relative flex w-1/2 max-w-[14px] items-end"
                    style={{ height: "100%" }}
                  >
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${heightPct}%`,
                        backgroundColor: s.color,
                        minHeight: value > 0 ? "2px" : "0px",
                      }}
                      title={`${s.name}: ${value}`}
                    />
                  </div>
                );
              })}
            </div>
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default BarChart;
