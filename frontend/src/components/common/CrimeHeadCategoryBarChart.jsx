import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { aggregateCrimeHeadCategories } from "../../utils/crimeHeadGroups.js";

const REPORTED_COLOR = "#D97706";
const WORKOUT_COLOR = "#8B5CF6";

function CategoryTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  const reported = payload.find((p) => p.dataKey === "reported")?.value ?? 0;
  const workout = payload.find((p) => p.dataKey === "workout")?.value ?? 0;
  const solvedPct = reported > 0 ? Math.round((workout / reported) * 100) : 0;

  return (
    <div className="rounded-[10px] border border-[#E5E7EB] bg-white px-3 py-2.5 text-[10px] font-bold shadow-[0_4px_6px_-1px_rgba(0,0,0,0.05)]">
      <div className="text-[#6B7280] mb-1.5">{label}</div>
      <div className="flex items-center justify-between gap-4 text-slate-600 py-0.5">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: REPORTED_COLOR }} />
          Reported
        </span>
        <span>{reported.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-slate-600 py-0.5">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: WORKOUT_COLOR }} />
          Workout
        </span>
        <span>{workout.toLocaleString()}</span>
      </div>
      <div className="flex items-center justify-between gap-4 text-[#0A1628] pt-1.5 mt-1.5 border-t border-slate-100">
        <span>Solved</span>
        <span>{solvedPct}%</span>
      </div>
    </div>
  );
}

export default function CrimeHeadCategoryBarChart({ localHeads = [], matrixRows = [] }) {
  const data = aggregateCrimeHeadCategories(localHeads, matrixRows);
  const hasData = data.some((d) => d.reported > 0 || d.workout > 0);

  if (!hasData) {
    return (
      <div className="flex h-[240px] flex-col items-center justify-center gap-3">
        <p className="text-meta font-medium text-[var(--text-main-theme)] opacity-70">No crime-head classified records in this period.</p>
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 4 }} barGap={2} barCategoryGap="20%">
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
          <XAxis dataKey="category" stroke="#A0AEC0" fontSize={10} tickLine={false} />
          <YAxis stroke="#A0AEC0" fontSize={10} tickLine={false} allowDecimals={false} />
          <Tooltip content={<CategoryTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.08)" }} />
          <Legend wrapperStyle={{ fontSize: "10px", color: "#718096" }} />
          <Bar dataKey="reported" name="Reported" fill={REPORTED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="workout" name="Workout" fill={WORKOUT_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
