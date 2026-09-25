export default function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = "text-slate-400",
  trend,
  trendDirection = "up",
  subtext,
  className = "",
}) {
  return (
    <div
      className={`rounded-card border border-slate-200 bg-white p-4 flex items-center justify-between gap-3 ${className}`}
    >
      <div className="min-w-0">
        <div className="text-label font-semibold text-slate-400">
          {label}
        </div>
        <div className="text-value font-bold text-slate-800 mt-0.5">
          {value}
        </div>
        {trend && (
          <div
            className={`text-meta font-semibold mt-0.5 ${
              trendDirection === "down"
                ? "text-red-600"
                : trendDirection === "neutral"
                ? "text-slate-400"
                : "text-emerald-600"
            }`}
          >
            {trend}
          </div>
        )}
        {subtext && (
          <div className="text-meta text-slate-500 mt-0.5">{subtext}</div>
        )}
      </div>
      {Icon && <Icon size={18} className={`shrink-0 ${iconColor}`} />}
    </div>
  );
}
