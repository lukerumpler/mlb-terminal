/**
 * src/components/OverviewCharts.jsx
 *
 * Deferred-loading split (2026-08-12): every recharts-dependent visual that
 * OverviewPage.jsx renders, pulled into its own module. OverviewPage.jsx used
 * to import recharts directly, which meant its own lazy-loaded chunk had a
 * hard dependency on recharts-vendor (the single largest chunk in the app,
 * ~85KB gzip) — and since Overview is the default landing tab, that chunk was
 * on the critical path for the very first thing anyone sees, even the parts
 * of the page (rankings, stat strips, standings tables) that have nothing to
 * do with charts.
 *
 * OverviewPage.jsx now lazy-loads each component below individually (see the
 * `lazy(() => import('../components/OverviewCharts.jsx').then(...))` calls
 * there), each wrapped in its own <Suspense> with a skeleton matching the
 * chart's real dimensions. The page shell — including every non-chart panel —
 * can paint immediately; only these six chart areas wait on recharts-vendor,
 * and only once, since the browser's module cache dedupes the six dynamic
 * import() calls into a single fetch.
 *
 * Each component here is intentionally a thin, prop-only wrapper (no closures
 * over OverviewPage's local state) so this file has no dependency on anything
 * but its own props, `C` (fixed color tokens), and recharts.
 */
import React from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  LabelList,
} from "recharts";
import { C, WARM_TOOLTIP } from "../constants/colors.js";

const TT = { ...WARM_TOOLTIP, wrapperStyle: { zIndex: 9999 } };

export function OffenseRadar({ data, accent }) {
  return (
    <ResponsiveContainer width="100%" height={196}>
      <RadarChart
        data={data}
        margin={{ top: 12, right: 22, bottom: 12, left: 22 }}
      >
        <PolarGrid stroke={C.border} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{
            fontSize: 9.5,
            fill: C.text2,
            fontFamily: "'DM Mono',monospace",
          }}
          tickLine={false}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="val"
          stroke={accent}
          fill={accent}
          fillOpacity={0.18}
          strokeWidth={2}
          isAnimationActive={false}
        />
        <Tooltip {...TT} formatter={v => [v, "Score"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function StrengthRadar({ data, accent }) {
  return (
    <ResponsiveContainer width="100%" height={196}>
      <RadarChart
        data={data}
        margin={{ top: 12, right: 22, bottom: 12, left: 22 }}
      >
        <PolarGrid stroke={C.border} />
        <PolarAngleAxis
          dataKey="axis"
          tick={{
            fontSize: 9.5,
            fill: C.text2,
            fontFamily: "'DM Mono',monospace",
          }}
          tickLine={false}
        />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
        <Radar
          dataKey="val"
          stroke={accent}
          fill={accent}
          fillOpacity={0.15}
          strokeWidth={2}
          dot={{ r: 2.5, fill: accent }}
          isAnimationActive={false}
        />
        <Tooltip {...TT} formatter={v => [v, "Score"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function RunDiffChart({ data, accent }) {
  return (
    <ResponsiveContainer width="100%" height={144}>
      <ComposedChart
        data={data}
        margin={{ top: 4, right: 14, bottom: 0, left: 0 }}
      >
        <CartesianGrid stroke={C.borderLight} vertical={false} />
        <XAxis
          dataKey="game"
          tick={{ fontSize: 10, fill: C.text3 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="bars"
          tick={{ fontSize: 10, fill: C.text3 }}
          width={26}
          axisLine={false}
          tickLine={false}
          domain={[-6, 8]}
        />
        <YAxis yAxisId="line" orientation="right" hide domain={[0, 35]} />
        <Tooltip {...TT} />
        <Bar
          yAxisId="bars"
          dataKey="diff"
          fill={`color-mix(in srgb, ${accent} 22%, transparent)`}
          stroke={accent}
          strokeWidth={1}
          maxBarSize={16}
          isAnimationActive={false}
        />
        <Line
          yAxisId="line"
          dataKey="cum"
          stroke={accent}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <ReferenceLine yAxisId="bars" y={0} stroke={C.border} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export function ArsenalPie({ data }) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius="40%"
          outerRadius="68%"
          dataKey="pct"
          strokeWidth={1.5}
          stroke={C.surface}
          isAnimationActive={false}
        >
          {data.map((e, i) => (
            <Cell key={i} fill={e.color} />
          ))}
        </Pie>
        <Tooltip {...TT} formatter={(v, n, p) => [v + "%", p.payload.type]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function PositionOaaChart({ data }) {
  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid stroke={C.borderLight} vertical={false} />
        <XAxis
          dataKey="pos"
          tick={{ fontSize: 9, fill: C.text3 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 9, fill: C.text3 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip {...TT} formatter={v => [v, "OAA"]} />
        <ReferenceLine y={0} stroke={C.border} />
        <Bar
          dataKey="oaa"
          isAnimationActive={false}
          radius={[2, 2, 0, 0]}
          fill={C.teal}
          label={{
            position: "top",
            fontSize: 8,
            fill: C.text3,
            fontFamily: "'DM Mono',monospace",
            formatter: v => (v > 0 ? `+${v}` : v),
          }}
        >
          {data.map((e, i) => (
            <Cell
              key={i}
              fill={e.oaa >= 3 ? C.teal : e.oaa >= 0 ? C.amber : C.rust}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EvDistributionChart({ data, accent }) {
  return (
    <ResponsiveContainer width="100%" height={130}>
      <BarChart
        data={data}
        margin={{ top: 4, right: 8, bottom: 0, left: -20 }}
        barCategoryGap="8%"
      >
        <CartesianGrid stroke={C.borderLight} vertical={false} />
        <XAxis
          dataKey="mph"
          tick={{ fontSize: 8, fill: C.text4 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => (+v % 20 === 0 ? v : "")}
        />
        <YAxis
          tick={{ fontSize: 8, fill: C.text4 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          {...TT}
          formatter={v => [v.toFixed(1) + "%", "Freq"]}
          labelFormatter={v => `${v} mph`}
        />
        <Bar
          isAnimationActive={false}
          dataKey="pct"
          fill={accent}
          radius={[2, 2, 0, 0]}
          opacity={0.8}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LuxuryTaxTrendChart({ data = [], accent = C.amber }) {
  const hasData = data.some(
    row => row.taxPayroll != null || row.estimatedTaxBill != null
  );
  if (!hasData) {
    return (
      <div
        role="status"
        style={{
          height: 164,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 18px",
          color: C.text3,
          fontFamily: "'DM Mono',monospace",
          fontSize: 10,
          textAlign: "center",
        }}
      >
        Historical franchise tax data unavailable from the season-specific
        source feed.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={178}>
      <ComposedChart
        data={data}
        margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
      >
        <CartesianGrid stroke={C.borderLight} vertical={false} />
        <XAxis
          dataKey="season"
          tick={{ fontSize: 9.5, fill: C.text3 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="payroll"
          tick={{ fontSize: 9, fill: C.text3 }}
          width={42}
          axisLine={false}
          tickLine={false}
          tickFormatter={value =>
            value == null ? "—" : `$${Math.round(value / 1e6)}M`
          }
        />
        <YAxis
          yAxisId="tax"
          orientation="right"
          tick={{ fontSize: 9, fill: C.rust }}
          width={42}
          axisLine={false}
          tickLine={false}
          tickFormatter={value =>
            value == null ? "—" : `$${Math.round(value / 1e6)}M`
          }
        />
        <Tooltip
          {...TT}
          formatter={(value, name) => [
            value == null
              ? "Unavailable"
              : `$${(Number(value) / 1e6).toFixed(1)}M`,
            name === "taxPayroll" ? "CBT payroll" : "Estimated tax",
          ]}
        />
        <Line
          yAxisId="payroll"
          type="monotone"
          dataKey="taxPayroll"
          name="taxPayroll"
          stroke={accent}
          strokeWidth={2}
          dot={{ r: 3, fill: accent }}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          yAxisId="tax"
          type="monotone"
          dataKey="estimatedTaxBill"
          name="estimatedTaxBill"
          stroke={C.rust}
          strokeWidth={2}
          dot={{ r: 3, fill: C.rust }}
          connectNulls={false}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function formatWarValue(value) {
  return value == null || !Number.isFinite(Number(value))
    ? "Unavailable"
    : `${Number(value) >= 0 ? "+" : ""}${Number(value).toFixed(1)}`;
}

function DivisionalWarTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload || {};
  return (
    <div
      style={{
        ...TT.contentStyle,
        minWidth: 190,
        padding: "9px 10px",
        borderRadius: 7,
      }}
    >
      <div
        style={{
          marginBottom: 7,
          color: C.text,
          fontFamily: "'Plus Jakarta Sans',sans-serif",
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        {row.teamName || row.team}
      </div>
      <div
        style={{
          display: "grid",
          gap: 4,
          color: C.text2,
          fontFamily: "'DM Mono',monospace",
          fontSize: 9.5,
        }}
      >
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 14 }}
        >
          <span>Total WAR</span>
          <strong style={{ color: C.purple }}>
            {formatWarValue(row.totalWAR)}
          </strong>
        </div>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 14 }}
        >
          <span>Offensive WAR</span>
          <strong style={{ color: C.amber }}>
            {formatWarValue(row.offensiveWAR)}
          </strong>
        </div>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 14 }}
        >
          <span>Pitching WAR</span>
          <strong style={{ color: C.teal }}>
            {formatWarValue(row.pitchingWAR)}
          </strong>
        </div>
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 14 }}
        >
          <span>Defensive WAR</span>
          <strong
            style={{ color: row.defensiveWAR == null ? C.text4 : C.rust }}
          >
            {formatWarValue(row.defensiveWAR)}
          </strong>
        </div>
      </div>
      {row.defensiveWAR == null && (
        <div
          style={{
            marginTop: 7,
            color: C.text4,
            fontFamily: "'Plus Jakarta Sans',sans-serif",
            fontSize: 9,
            lineHeight: 1.35,
          }}
        >
          Separate defensive WAR was not returned by the verified FanGraphs
          aggregate feed.
        </div>
      )}
    </div>
  );
}

export function DivisionalWarChart({ data = [], selectedTeam = "" }) {
  if (!data.length) {
    return (
      <div
        role="status"
        style={{
          height: 178,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 18px",
          color: C.text3,
          fontFamily: "'DM Mono',monospace",
          fontSize: 10,
          textAlign: "center",
        }}
      >
        Verified divisional WAR rows are unavailable.
      </div>
    );
  }
  const warValues = data.map(row => Number(row.totalWAR)).filter(Number.isFinite);
  const minWar = Math.min(0, ...warValues);
  const maxWar = Math.max(0, ...warValues);
  const axisPadding = Math.max(1, (maxWar - minWar) * 0.08);
  return (
    <ResponsiveContainer width="100%" height={Math.max(178, data.length * 31 + 18)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 44, bottom: 0, left: 8 }}
        barCategoryGap="18%"
      >
        <CartesianGrid stroke={C.borderLight} horizontal={false} />
        <XAxis
          type="number"
          domain={[minWar - axisPadding, maxWar + axisPadding]}
          tick={{ fontSize: 8.5, fill: C.text3 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}`}
        />
        <YAxis
          type="category"
          dataKey="team"
          width={36}
          tick={{
            fontSize: 9,
            fill: C.text2,
            fontFamily: "'DM Mono',monospace",
          }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          content={<DivisionalWarTooltip />}
          cursor={{ fill: C.amberSoft, opacity: 0.55 }}
        />
        <Bar
          dataKey="totalWAR"
          name="Total WAR"
          fill={C.purple}
          radius={[0, 3, 3, 0]}
          maxBarSize={14}
          isAnimationActive={false}
        >
          {data.map(row => <Cell key={row.team} fill={row.team === selectedTeam ? C.teal : C.purple} />)}
          <LabelList dataKey="totalWAR" position="right" formatter={formatWarValue} fill={C.text2} style={{ fontFamily:"'DM Mono',monospace", fontSize:9, fontWeight:700 }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
