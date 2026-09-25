import React from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import SafeResponsiveContainer from "./SafeResponsiveContainer.jsx";

// Case-status distribution bar chart — shared by the PS dashboard and the SHO
// Analytics Console (same data shape from GET /analytics/case-status-breakdown).
export default function CaseStatusBarChart({ data = [] }) {
  return (
    <div className="h-[230px] w-full min-w-0">
      <SafeResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 55 }}>
          <defs>
            <linearGradient id="casesBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8B5CF6" stopOpacity={0.9}/>
              <stop offset="100%" stopColor="#C4B5FD" stopOpacity={0.25}/>
            </linearGradient>
            <linearGradient id="casesBarGradHover" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6C4FE0" stopOpacity={1}/>
              <stop offset="100%" stopColor="#8B5CF6" stopOpacity={0.6}/>
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#E2E8F0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            stroke="#A0AEC0"
            fontSize={9}
            tickLine={false}
            axisLine={false}
            interval={0}
            angle={-40}
            textAnchor="end"
            height={70}
            tickFormatter={(v) => (v && v.length > 16 ? `${v.slice(0, 16)}…` : v)}
          />
          <YAxis
            stroke="#A0AEC0"
            fontSize={10}
            tickLine={false}
            axisLine={false}
            dx={-5}
            allowDecimals={false}
            tickFormatter={(v) => v.toLocaleString()}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #E5E7EB",
              borderRadius: "10px",
              fontSize: "10px",
              fontWeight: "bold",
              boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            }}
            cursor={{ fill: "rgba(108, 79, 224, 0.06)", radius: [6, 6, 0, 0] }}
            formatter={(value) => [value.toLocaleString(), "Cases"]}
            labelFormatter={(label) => label}
            labelStyle={{ color: "#6B7280" }}
          />
          <Bar
            dataKey="count"
            fill="url(#casesBarGrad)"
            radius={[6, 6, 0, 0]}
            maxBarSize={20}
            activeBar={{ fill: "url(#casesBarGradHover)", stroke: "#6C4FE0", strokeWidth: 1 }}
            animationDuration={1200}
          />
        </BarChart>
      </SafeResponsiveContainer>
    </div>
  );
}
