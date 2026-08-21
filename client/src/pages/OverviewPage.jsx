import React, { useState, useMemo, useEffect, useRef, useCallback, memo, lazy, Suspense } from 'react';
import { C, px, sans } from '../constants/colors.js';
import { TEAMS, SEASON as CURRENT_SEASON, PROSPECT_BATTERS, PROSPECT_PITCHERS, MLB_PIPELINE_FARM_SYSTEM_RANKINGS, sortTeamsByLeagueDivisionName } from '../constants/data.js';
import { computeFV, fvBaselines } from '../engine/skip.js';
import { getTodaysGames, getStandings, getAllTeamStats, getTeamPlayerStats, getTeamRecentPlayerStats, getTeamExitVelocity, getTeamBattedBalls, getTeamBattedBallsAgainst, getPlayerContactPoints, getPitcherPitches, fetchTeamFinancials, getTeamModelSources, getSecondaryPlayoffOdds, getTeamAffiliates, getMinorLeagueTeamOverview, getMinorLeagueTeamStandings, getMinorLeagueTeamSchedule, getTeamScheduleSplits, getTeamSavantMetrics, getTeamSavantOaa, getTeamAggregateWar, getTeamCalculatedIntelligence, getGameFeedMetadata, getTeamVenueMetadata } from '../api/mlb.js';
import { Panel, StatStrip, KVRow, SkeletonBlock } from '../components/atoms.jsx';
import { RosterInsightsTableSkeleton, TeamOverviewSkeleton } from '../components/PageSkeletons.jsx';
import TeamLogo from '../components/TeamLogo.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import MetricInfo from '../components/MetricInfo.jsx';
import { openPlayerProfile, openTab } from '../lib/navigation.js';
import { getTeamAccent } from '../lib/teamVisuals.js';
import { recordRecentView } from '../lib/recentHistory.js';
import { percentile } from '../lib/percentile.js';
import PlayerPhoto from '../components/PlayerPhoto.jsx';
import { buildCbtHistorySeasons, readCbtHistoryRange, saveCbtHistoryRange, CBT_HISTORY_OPTIONS } from '../lib/cbtHistory.js';
import { captureVerifiedSnapshot, deriveVerifiedTrends, formatTrendDelta, readVerifiedSnapshot } from '../lib/trendSnapshots.js';
import { fmtScorebookRate, fmtWinPct } from '../lib/formatting.js';
import { DAILY_CACHE_TTL_MS, shouldRefreshDailyCache, readTeamAggregateCache, saveTeamAggregateCache, readTeamPlayersCache, saveTeamPlayersCache, readTeamSavantCache, saveTeamSavantCache, readTeamSavantSummaryCache, saveTeamSavantSummaryCache, readTeamSavantAgainstCache, saveTeamSavantAgainstCache } from '../lib/teamDataCache.js';
import { buildTeamDataQualityPayload, downloadTeamDataQualityExport } from '../lib/dataQuality.js';
import { shouldStartRosterInsightsRequest } from '../lib/rosterInsightsRequest.js';
import { shouldResetRosterInsightsState } from '../lib/rosterInsightsState.js';
import { buildRosterSavantKey } from '../lib/rosterSavantKey.js';
import { apiUrl } from '../lib/apiOrigin.js';
import { getCacheHealth } from '../lib/cacheHealthClient.js';
import RequestDiagnosticsPanel from '../components/RequestDiagnosticsPanel.jsx';
import TeamNewsPanel from '../components/TeamNewsPanel.jsx';
import DefensiveOaaFieldMap from '../components/DefensiveOaaFieldMap.jsx';

// Deferred-loading split (2026-08-12): these six charts are the only things
// on this page that need recharts (~85KB gzip, the largest chunk in the
// app). Overview is the default landing tab, so if this page imported
// recharts directly, that chunk would sit on the critical path for the very
// first paint — blocking rankings tables, stat strips, and every other
// non-chart panel from appearing, not just the charts themselves. Each is
// lazy-loaded from the same shared chunk (src/components/OverviewCharts.jsx)
// — six `import()` calls below, but the browser's module cache dedupes them
// to a single network fetch, not six. See that file's header comment for
// the full reasoning.
const OffenseRadar = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.OffenseRadar })));
const StrengthRadar = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.StrengthRadar })));
const RunDiffChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.RunDiffChart })));
const ArsenalPie = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.ArsenalPie })));
const DivisionalWarChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.DivisionalWarChart })));

const PositionOaaChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.PositionOaaChart })));
const EvDistributionChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.EvDistributionChart })));
const LuxuryTaxTrendChart = lazy(() => import('../components/OverviewCharts.jsx').then(m => ({ default: m.LuxuryTaxTrendChart })));

export const OVERVIEW_ACCENTS = Object.freeze({
  offense: C.amber,
  pitching: C.teal,
  defense: C.slate,
  context: C.purple,
});

export const DEFAULT_OVERVIEW_TEAM_KEY = 'sd';

const OVERVIEW_VIEW_OPTIONS = [
  { id: 'briefing', label: 'Briefing', detail: 'Core signals' },
  { id: 'performance', label: 'Performance', detail: 'Models & field play' },
  { id: 'roster', label: 'Roster', detail: 'Players & affiliates' },
  { id: 'news', label: 'Team News', detail: 'Club headlines' },
  { id: 'operations', label: 'Operations', detail: 'Context & schedule' },
];

// Matches the ResponsiveContainer height of the chart it stands in for, so
// there's no layout shift when the real chart pops in.
export function OverviewEmptyState({ message, detail, status = 'Unavailable' }) {
  const detailIsLong = typeof detail === 'string' && detail.length > 62;
  return <div className="skip-overview-empty-state" role="status">
    <span className="skip-overview-empty-mark" aria-hidden="true">—</span>
    <div className="skip-overview-empty-copy">
      <div className="skip-overview-empty-heading">
        <span className="skip-overview-empty-status">{status}</span>
        <span className="skip-overview-empty-separator" aria-hidden="true">·</span>
        <span className="skip-overview-empty-message">{message}</span>
      </div>
      {detail && (detailIsLong ? <details className="skip-overview-empty-note"><summary>More detail</summary><span className="skip-overview-empty-detail">{detail}</span></details> : <span className="skip-overview-empty-detail">{detail}</span>)}
    </div>
  </div>;
}

function OverviewSourceBadge({ status, provider, title }) {
  const badge = <StatusBadge status={status} compact />;
  if (!provider) return badge;
  return <span className="skip-overview-source-badge" title={title || `${provider} source health`} style={{display:'inline-flex',alignItems:'center',gap:10,marginInlineStart:6,whiteSpace:'nowrap'}}>
    <span className="skip-overview-source-name">{provider}</span>
    <span className="skip-overview-source-status" style={{display:'inline-flex',alignItems:'center',paddingInlineStart:10,borderInlineStart:`1px solid ${C.borderLight}`,whiteSpace:'nowrap'}}>{badge}</span>
  </span>;
}

function ChartFallback({ height }) {
  return (
    <div style={{ height, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 8px' }}>
      <SkeletonBlock width="100%" height={Math.max(28, height - 24)} radius={6}/>
    </div>
  );
}

function pctToGrade(p) {
  if (!Number.isFinite(Number(p))) return '—';
  if (p >= 90) return 'A+'; if (p >= 80) return 'A'; if (p >= 70) return 'A-';
  if (p >= 60) return 'B+'; if (p >= 50) return 'B'; if (p >= 40) return 'B-';
  if (p >= 30) return 'C+'; return 'C';
}

export const FRONT_OFFICE_GRADE_POINTS = Object.freeze({
  'A+': 4.3, A: 4.0, 'A-': 3.7, 'B+': 3.3, B: 3.0, 'B-': 2.7,
  'C+': 2.3, C: 2.0, 'C-': 1.7, 'D+': 1.3, D: 1.0, 'D-': 0.7, F: 0,
});
export const FRONT_OFFICE_CORE_WEIGHTS = Object.freeze({
  offense: 0.45, pitching: 0.40, defense: 0.10, baserunning: 0.05,
});
export const FRONT_OFFICE_OUTLOOK_NUDGE = 0.15;
const FRONT_OFFICE_GRADE_BANDS = Object.freeze([
  [4.15, 'A+'], [3.85, 'A'], [3.5, 'A-'], [3.15, 'B+'], [2.85, 'B'], [2.5, 'B-'],
  [2.15, 'C+'], [1.85, 'C'], [1.5, 'C-'], [1.15, 'D+'], [0.85, 'D'], [0.5, 'D-'], [-Infinity, 'F'],
]);

function frontOfficePointsToGrade(points) {
  return FRONT_OFFICE_GRADE_BANDS.find(([minimum]) => points >= minimum)?.[1] || '—';
}

export function buildFrontOfficeGradeSummary(grades = []) {
  const byFacet = new Map(grades.map(row => [String(row?.label || '').toLowerCase(), row?.grade]));
  const availableCore = Object.entries(FRONT_OFFICE_CORE_WEIGHTS)
    .map(([facet, weight]) => ({ facet, weight, points: FRONT_OFFICE_GRADE_POINTS[byFacet.get(facet)] }))
    .filter(row => Number.isFinite(row.points));
  const availableOutlook = ['depth', 'future value']
    .map(facet => ({ facet, points: FRONT_OFFICE_GRADE_POINTS[byFacet.get(facet)] }))
    .filter(row => Number.isFinite(row.points));

  if (!availableCore.length) return {
    grade: '—',
    averagePoints: null,
    componentCount: 0,
    corePoints: null,
    outlookPoints: null,
    detail: 'Unavailable: no verified current-performance grades are available. Missing facets are never assigned a neutral score.',
  };

  const totalCoreWeight = availableCore.reduce((sum, row) => sum + row.weight, 0);
  const corePoints = availableCore.reduce((sum, row) => sum + row.weight * row.points, 0) / totalCoreWeight;
  const outlookPoints = availableOutlook.length
    ? availableOutlook.reduce((sum, row) => sum + row.points, 0) / availableOutlook.length
    : null;
  const overallPoints = outlookPoints == null
    ? corePoints
    : corePoints + FRONT_OFFICE_OUTLOOK_NUDGE * (outlookPoints - corePoints);
  const facetNames = availableCore.map(row => row.facet).join(', ');
  const outlookNames = availableOutlook.map(row => row.facet).join(' and ');
  return {
    grade: frontOfficePointsToGrade(overallPoints),
    averagePoints: Number(overallPoints.toFixed(2)),
    points: Number(overallPoints.toFixed(2)),
    corePoints: Number(corePoints.toFixed(2)),
    outlookPoints: outlookPoints == null ? null : Number(outlookPoints.toFixed(2)),
    componentCount: availableCore.length + availableOutlook.length,
    coreComponentCount: availableCore.length,
    outlookComponentCount: availableOutlook.length,
    detail: outlookPoints == null
      ? `Weighted current-performance score from ${facetNames}; available core facets are reweighted to 100%. Outlook facets are unavailable and do not affect this internal grade.`
      : `Weighted core score from ${facetNames}; ${outlookNames} moves it 15% toward the organization outlook average. Missing facets are excluded and remaining core weights are rebalanced.`,
  };
}

export function getEvaluationPresentation(search = typeof window === 'undefined' ? '' : window.location.search) {
  return new URLSearchParams(search || '').get('evaluationView') === 'score-ring' ? 'score-ring' : 'baseline';
}

export function buildFrontOfficeEvaluationViewModel({ teamName = 'Team', grades = [], overall = buildFrontOfficeGradeSummary(grades) } = {}) {
  const hasGradePoints = grade => Number.isFinite(FRONT_OFFICE_GRADE_POINTS[grade]);
  const missingDrivers = grades.filter(driver => !hasGradePoints(driver?.grade));
  const ratingScaleMax = FRONT_OFFICE_GRADE_POINTS['A+'];
  const overallRating = Number(overall?.points);
  const hasDefensibleOverall = overall?.grade && overall.grade !== '—'
    && Number.isFinite(overallRating)
    && overallRating >= 0
    && overallRating <= ratingScaleMax;
  const status = !hasDefensibleOverall ? 'unavailable' : missingDrivers.length ? 'partial' : 'available';
  const missingLabels = missingDrivers.map(driver => driver?.label).filter(Boolean);
  return {
    teamName,
    overallGrade: hasDefensibleOverall ? overall.grade : '—',
    overallRating: hasDefensibleOverall ? overallRating : null,
    ratingScaleMax,
    normalizedScore: hasDefensibleOverall ? Math.max(0, Math.min(100, Math.round(overallRating / ratingScaleMax * 100))) : null,
    status,
    statusLabel: status === 'available'
      ? 'Available grade inputs'
      : status === 'partial'
        ? `Partial coverage — ${missingLabels.join(', ') || 'some category inputs are unavailable'}`
        : 'Evaluation unavailable — no defensible overall grade',
    sourceLabel: 'SKIP evaluation · verified team, roster, Savant, and prospect inputs where available',
  };
}

const SCORE_RING_RADIUS = 48;
const SCORE_RING_CIRCUMFERENCE = 2 * Math.PI * SCORE_RING_RADIUS;

export function EvaluationScoreRing({ model, decorative = false }) {
  const score = model?.status === 'available' || model?.status === 'partial' ? model.normalizedScore : null;
  const visibleScore = Number.isFinite(Number(score)) ? Math.max(0, Math.min(100, Number(score))) : null;
  const dashOffset = visibleScore == null ? SCORE_RING_CIRCUMFERENCE : SCORE_RING_CIRCUMFERENCE * (1 - visibleScore / 100);
  const accessibleLabel = visibleScore == null
    ? `${model?.teamName || 'Team'}: team evaluation unavailable. ${model?.statusLabel || 'Required inputs are missing.'} ${model?.sourceLabel || ''}`
    : `${model?.teamName || 'Team'}: overall team evaluation ${model?.overallGrade || 'unavailable'}, ${visibleScore} out of 100 normalized from ${model?.overallRating?.toFixed?.(2) || model?.overallRating} out of ${model?.ratingScaleMax}. ${model?.statusLabel || ''} ${model?.sourceLabel || ''}`;
  const progressColor = model?.status === 'partial' ? C.amber : model?.status === 'unavailable' ? C.text4 : C.purple;
  return (
    <div className="skip-evaluation-score-ring" data-status={model?.status || 'unavailable'} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : accessibleLabel}>
      <svg className="skip-evaluation-score-ring-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="skip-evaluation-score-ring-track" cx="60" cy="60" r={SCORE_RING_RADIUS} fill="none" />
        <circle className="skip-evaluation-score-ring-progress" cx="60" cy="60" r={SCORE_RING_RADIUS} fill="none" stroke={progressColor} strokeLinecap="round" strokeDasharray={SCORE_RING_CIRCUMFERENCE} strokeDashoffset={dashOffset} />
      </svg>
      <div className="skip-evaluation-score-ring-value" aria-hidden="true">
        <strong>{visibleScore == null ? '—' : visibleScore}</strong>
        <span>{visibleScore == null ? 'unavailable' : 'normalized'}</span>
      </div>
    </div>
  );
}

const OVERALL_SCORE_TOOLTIP = 'Overall score: Offense 45%, Pitching 40%, Defense 10%, Baserunning 5%. Available core facets are reweighted. Available Depth and Future Value move the core score only 15% toward organization outlook.';

function useOverallScoreDelta(teamKey, points) {
  const [delta, setDelta] = useState(null);
  const numericPoints = Number(points);
  useEffect(() => {
    setDelta(null);
    if (!teamKey || !Number.isFinite(numericPoints) || typeof window === 'undefined') return;
    const storageKey = `skip-front-office-overall-score:${CURRENT_SEASON}:${teamKey}`;
    try {
      const prior = JSON.parse(window.localStorage.getItem(storageKey) || 'null');
      if (Number.isFinite(Number(prior?.points))) {
        const nextDelta = Number((numericPoints - Number(prior.points)).toFixed(2));
        if (Math.abs(nextDelta) >= 0.01) setDelta(nextDelta);
      }
      window.localStorage.setItem(storageKey, JSON.stringify({ points:numericPoints, savedAt:Date.now() }));
    } catch {
      // Local history is optional; never hide a verified current score if storage is unavailable.
    }
  }, [teamKey, numericPoints]);
  return delta;
}

export function FrontOfficeGradeCards({ grades = [], overall = buildFrontOfficeGradeSummary(grades), teamKey = '', includeOverall = true, extraDetails = [], activeLabel: controlledActiveLabel, onActiveLabelChange }) {
  const [internalActiveLabel, setInternalActiveLabel] = useState(null);
  const buttonRefs = useRef(new Map());
  const isControlled = typeof onActiveLabelChange === 'function';
  const activeLabel = isControlled ? controlledActiveLabel : internalActiveLabel;
  const setActiveLabel = useCallback((next) => {
    if (isControlled) onActiveLabelChange(next);
    else setInternalActiveLabel(next);
  }, [isControlled, onActiveLabelChange]);
  useEffect(() => {
    if (!isControlled) setInternalActiveLabel(null);
  }, [teamKey, isControlled]);
  const overallCard = useMemo(() => ({ label: 'Overall', grade: overall.grade, color: C.navy, detail: overall.detail }), [overall]);
  const cards = useMemo(() => [
    ...(includeOverall ? [overallCard] : []),
    ...grades,
  ], [grades, includeOverall, overallCard]);
  const activeCard = [...cards, ...extraDetails].find(card => card.label === activeLabel) || null;
  const overallDelta = useOverallScoreDelta(teamKey, overall?.points);
  const closeActiveCard = useCallback(() => {
    if (!activeLabel) return;
    const previousLabel = activeLabel;
    setActiveLabel(null);
    buttonRefs.current.get(previousLabel)?.focus();
  }, [activeLabel, setActiveLabel]);
  return <div aria-label="Front Office grade details" onKeyDown={event => {
    if (event.key === 'Escape' && activeLabel) {
      event.preventDefault();
      closeActiveCard();
    }
  }}>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(64px,1fr))',gap:4}}>
      {cards.map(card => {
        const isActive = activeLabel === card.label;
        const id = `front-office-grade-${card.label.replace(/\s+/g, '-').toLowerCase()}`;
        const numericScore = card.label === 'Overall' && Number.isFinite(overall?.points) ? overall.points.toFixed(2) : null;
        const trendLabel = card.label === 'Overall' && overallDelta != null ? ` Overall score ${overallDelta > 0 ? 'increased' : 'decreased'} by ${Math.abs(overallDelta).toFixed(2)} from the prior comparable score.` : '';
        const isOverall = card.label === 'Overall';
        return <button key={card.label} ref={node => { if (node) buttonRefs.current.set(card.label, node); else buttonRefs.current.delete(card.label); }} type="button" aria-expanded={isActive} aria-controls={id} aria-label={numericScore ? `Show ${card.label} calculation details: ${card.grade}, ${numericScore} out of 4.30.${trendLabel}` : `Show ${card.label} calculation details`} onClick={() => setActiveLabel(activeLabel === card.label ? null : card.label)} title={`Show ${card.label} calculation details`}
          style={{minHeight:isOverall ? 62 : 46,textAlign:'center',background:isOverall ? C.surface3 : C.surface2,border:`1px solid ${isActive ? card.color : isOverall ? C.navy : C.borderLight}`,borderRadius:6,padding:isOverall ? '6px 3px 5px' : '5px 3px',cursor:'pointer',color:C.text,boxShadow:isOverall ? `inset 0 2px 0 ${C.navy}` : 'none'}}>
          <div style={{display:'flex',justifyContent:'center',alignItems:'baseline',gap:isOverall ? 5 : 4}} aria-label={numericScore ? `${card.label} grade ${card.grade}, weighted score ${numericScore} out of 4.30` : `${card.label} grade ${card.grade}`}><span style={px({fontSize:isOverall ? 29 : 17,fontWeight:800,color:card.color,lineHeight:isOverall ? .88 : 1,letterSpacing:isOverall ? '-.06em' : 0})}>{card.grade}</span>{numericScore && <span title={OVERALL_SCORE_TOOLTIP} aria-label={`Weighted Overall score ${numericScore} out of 4.30. ${OVERALL_SCORE_TOOLTIP}`} style={{...px({fontSize:isOverall ? 8 : 8.5,fontWeight:700,color:C.text3,lineHeight:1}),cursor:'help',textDecoration:'underline dotted',textUnderlineOffset:2}}>{numericScore}<span style={{color:C.text4}}>/4.30</span></span>}{isOverall && overallDelta != null && <span aria-hidden="true" title={`Prior comparable score: ${overallDelta > 0 ? '+' : ''}${overallDelta.toFixed(2)}`} style={px({fontSize:10,fontWeight:800,color:overallDelta > 0 ? C.teal : C.rust,lineHeight:1})}>{overallDelta > 0 ? '↑' : '↓'}</span>}</div>
          <div style={sans({fontSize:8.5,color:C.text3,marginTop:2,lineHeight:1.15})}>{card.label}</div>
          <span aria-hidden="true" style={sans({display:'block',fontSize:8,color:card.color,marginTop:1})}>details</span>
        </button>;
      })}
    </div>
    {activeCard
      ? <div id={`front-office-grade-${activeCard.label.replace(/\s+/g, '-').toLowerCase()}`} role="tooltip" style={sans({fontSize:8.5,color:C.text3,lineHeight:1.35,marginTop:6,padding:'5px 7px',background:C.surface3,borderRadius:5})}>{activeCard.detail}</div>
      : <div style={sans({fontSize:8.5,color:C.text4,lineHeight:1.3,marginTop:6})}>Select a grade for its calculation, data source, and limitations.</div>}
  </div>;
}

export function FrontOfficeScoreRingPreview({ teamName, grades = [], overall = buildFrontOfficeGradeSummary(grades), teamKey = '', activeLabel, onActiveLabelChange }) {
  const model = useMemo(() => buildFrontOfficeEvaluationViewModel({ teamName, grades, overall }), [teamName, grades, overall]);
  const scoreButtonRef = useRef(null);
  const overallId = 'front-office-grade-overall';
  const overallExpanded = activeLabel === 'Overall';
  const toggleOverallDetails = useCallback(() => {
    onActiveLabelChange?.(overallExpanded ? null : 'Overall');
  }, [onActiveLabelChange, overallExpanded]);
  return (
    <div className="skip-front-office-score-ring-layout" data-status={model.status}>
      <button ref={scoreButtonRef} type="button" className="skip-front-office-score-ring-summary" aria-expanded={overallExpanded} aria-controls={overallId} aria-label={`Show Overall calculation details: ${model.overallGrade}, ${model.overallRating == null ? 'unavailable' : `${model.overallRating.toFixed(2)} out of ${model.ratingScaleMax.toFixed(2)}`}. ${model.statusLabel}.`} onClick={toggleOverallDetails} onKeyDown={event => {
        if (event.key === 'Escape' && overallExpanded) {
          event.preventDefault();
          onActiveLabelChange?.(null);
          scoreButtonRef.current?.focus();
        }
      }}>
        <EvaluationScoreRing model={model} decorative />
        <div className="skip-front-office-score-ring-copy">
          <div className="skip-front-office-score-ring-grade">{model.overallGrade}</div>
          <div className="skip-front-office-score-ring-scale">{model.overallRating == null ? '—' : model.overallRating.toFixed(2)} <span>/ {model.ratingScaleMax.toFixed(2)}</span></div>
          <div className="skip-front-office-score-ring-status">{model.statusLabel}</div>
          <div className="skip-front-office-score-ring-source">{model.sourceLabel}</div>
          <span className="skip-front-office-score-ring-details" aria-hidden="true">details</span>
        </div>
      </button>
      <FrontOfficeGradeCards grades={grades} overall={overall} teamKey={teamKey} includeOverall={false} extraDetails={[{ label: 'Overall', grade: overall.grade, color: C.navy, detail: overall.detail }]} activeLabel={activeLabel} onActiveLabelChange={onActiveLabelChange} />
    </div>
  );
}

export function resolveMetricProviderStatus(value, providerStatus) {
  return value == null ? (providerStatus === 'loading' ? 'loading' : 'coverage-gap') : providerStatus;
}
export function resolveVerifiedPlayoffOdds(value) {
  if (value == null || value === '') return null;
  const odds = Number(value);
  return Number.isFinite(odds) && odds >= 0 && odds <= 100 ? odds : null;
}
function ord(n) {
  if (n == null || n === '' || !Number.isFinite(Number(n))) return '—';
  const value = Number(n);
  const s=['th','st','nd','rd'], v=value%100;
  return value+(s[(v-20)%10]||s[v]||s[0]);
}
function percentileLabel(value) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  const n = Math.round(Number(value));
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1:'st', 2:'nd', 3:'rd' }[n % 10] || 'th');
  return `${n}${suffix}`;
}
function formatTeamMetric(value, digits = 0) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
  return Number(value).toFixed(digits);
}

export function buildLiveRunDiffData(team, season = CURRENT_SEASON) {
  if (team?.diff == null || team?.diff === '') return [];
  const diff = Number(team.diff);
  if (!Number.isFinite(diff)) return [];
  return [{ game: String(season), diff, cum: diff }];
}
function freshnessLabel(value) {
  if (!value) return 'not retrieved';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'timestamp unavailable';
  return `retrieved ${date.toLocaleTimeString([], { hour:'numeric', minute:'2-digit' })}`;
}

export function formatDataAge(timestamp, now = Date.now()) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return null;
  const age = Math.max(0, Number(now) - value);
  if (age < 60_000) return 'just now';
  if (age < 3_600_000) return `${Math.max(1, Math.floor(age / 60_000))}m ago`;
  if (age < 86_400_000) return `${Math.max(1, Math.floor(age / 3_600_000))}h ago`;
  return `${Math.max(1, Math.floor(age / 86_400_000))}d ago`;
}

export function formatVerifiedTimestamp(value) {
  if (!value) return 'timestamp unavailable';
  const timestamp = Number.isFinite(Number(value)) ? Number(value) : Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'timestamp unavailable';
  return new Date(timestamp).toLocaleString([], { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
}

export function buildPostseasonStandingsContext(liveTeamData, team) {
  const formatRank = value => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return '—';
    const rounded = Math.round(numeric);
    const mod100 = rounded % 100;
    const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : ({ 1:'st', 2:'nd', 3:'rd' }[rounded % 10] || 'th');
    return `${rounded}${suffix}`;
  };
  const rows = Object.values(liveTeamData?.byAbbr || {})
    .map(record => record?.standings)
    .filter(Boolean);
  const selected = rows.find(row => Number(row.id) === Number(team?.id) || row.abbr === team?.abbr);
  if (!selected) return null;
  const divisionRows = rows
    .filter(row => row.divisionName && row.divisionName === selected.divisionName)
    .sort((left, right) => Number(right.pct || 0) - Number(left.pct || 0));
  const divisionLeader = divisionRows[0] || null;
  return {
    record: selected.w != null && selected.l != null ? `${selected.w}–${selected.l}` : '—',
    divisionName: selected.divisionName || team?.div || 'Division',
    divisionRank: formatRank(selected.divRank),
    gamesBack: selected.gb == null || selected.gb === '' ? '—' : selected.gb,
    wildCardRank: formatRank(selected.wildRank),
    lastTen: selected.l10 || '—',
    streak: selected.streak || '—',
    divisionLeader: divisionLeader?.abbr || divisionLeader?.name || '—',
    divisionLeaderRecord: divisionLeader?.w != null && divisionLeader?.l != null ? `${divisionLeader.w}–${divisionLeader.l}` : '—',
  };
}

function MetricValue({ value, loading, width = 42 }) {
  return loading ? <SkeletonBlock width={width} height={18} radius={4} style={{ margin:'0 auto' }} /> : value;
}

export function savantFreshnessLabel(data) {
  if (!data?.retrievedAt) return 'not retrieved';
  const retrievedTimestamp = Number.isFinite(Number(data.retrievedAt)) ? Number(data.retrievedAt) : Date.parse(data.retrievedAt);
  const age = formatDataAge(retrievedTimestamp);
  if (!age) return 'timestamp unavailable';
  return data.status === 'cached' || data.freshness === 'cached' || data.freshness === 'stale-cached'
    ? `cached ${age}`
    : `retrieved ${age}`;
}

export function SavantFreshnessText({ data }) {
  return <span>{savantFreshnessLabel(data)}</span>;
}

export function humanizeAffiliateOverviewState(status) {
  if (status === 'identity-ready' || status === 'loading') return 'stats loading';
  if (status === 'error') return 'live overview unavailable';
  if (status === 'ready') return 'stats available';
  return 'status unavailable';
}

function humanizeFeedStatus(status, fallback = 'Unavailable') {
  const labels = {
    'live': 'Live',
    'ready': 'Verified',
    'cached': 'Cached verified data',
    'loading': 'Loading',
    'source-gap': 'Provider unavailable',
    'upstream-unavailable': 'Provider unavailable',
    'request-failed': 'Request failed',
    'unparsed': 'Provider returned unreadable data',
    'calculated': 'Calculated from MLB data',
  };
  return labels[status] || (status ? String(status).replaceAll('-', ' ') : fallback);
}

function sumPlayerStat(rows = [], keys = []) {
  const values = rows.map(row => {
    for (const key of keys) {
      const value = Number(row?.stat?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }).filter(value => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

export function deriveTeamPlayerRollups(players = { hitting:[], pitching:[] }) {
  const hitters = Array.isArray(players.hitting) ? players.hitting : [];
  const pitchers = Array.isArray(players.pitching) ? players.pitching : [];
  const stolenBases = sumPlayerStat(hitters, ['stolenBases', 'sb']);
  const caughtStealing = sumPlayerStat(hitters, ['caughtStealing', 'cs']);
  const hits = sumPlayerStat(hitters, ['hits', 'h']);
  const extraBaseHits = [
    sumPlayerStat(hitters, ['doubles', '2B']),
    sumPlayerStat(hitters, ['triples', '3B']),
    sumPlayerStat(hitters, ['homeRuns', 'hr']),
  ].every(value => value != null)
    ? [sumPlayerStat(hitters, ['doubles', '2B']), sumPlayerStat(hitters, ['triples', '3B']), sumPlayerStat(hitters, ['homeRuns', 'hr'])].reduce((sum, value) => sum + value, 0)
    : null;
  const byPosition = new Map();
  [...hitters, ...pitchers].forEach(row => {
    const position = row?.position || '—';
    const current = byPosition.get(position) || { position, players:0, pa:0, ip:0 };
    current.players += 1;
    current.pa += Number(row?.stat?.plateAppearances || row?.stat?.pa) || 0;
    current.ip += Number(row?.stat?.inningsPitched || row?.stat?.ip) || 0;
    byPosition.set(position, current);
  });
  return {
    stolenBases,
    caughtStealing,
    stolenBaseAttempts: stolenBases != null && caughtStealing != null ? stolenBases + caughtStealing : null,
    plateAppearances: sumPlayerStat(hitters, ['plateAppearances', 'pa']),
    extraBaseHits,
    extraBaseRate: extraBaseHits != null && hits ? extraBaseHits / hits : null,
    activePlayers: hitters.length || pitchers.length ? hitters.length + pitchers.length : null,
    positions: [...byPosition.values()].sort((a, b) => b.players - a.players || a.position.localeCompare(b.position)),
  };
}

export function deriveBaserunningGrade({ stolenBases, caughtStealing, plateAppearances, comparisonRows = [], minimumAttempts = 8 } = {}) {
  const sb = Number(stolenBases);
  const cs = Number(caughtStealing);
  const pa = Number(plateAppearances);
  if (!Number.isFinite(sb) || !Number.isFinite(cs) || sb < 0 || cs < 0 || sb + cs < minimumAttempts) {
    return { percentile:null, volumePercentile:null, efficiencyPercentile:null, attempts:Number.isFinite(sb) && Number.isFinite(cs) ? sb + cs : null, successRate:null, minimumAttempts, status:'insufficient-sample', opportunityMetric:null };
  }
  const attempts = sb + cs;
  const leagueRows = comparisonRows.map(row => {
    const rowSb = Number(row?.stolenBases ?? row?.sb);
    const rowCs = Number(row?.caughtStealing ?? row?.cs);
    const rowPa = Number(row?.plateAppearances ?? row?.pa);
    const rowAttempts = rowSb + rowCs;
    return Number.isFinite(rowSb) && Number.isFinite(rowCs) && rowSb >= 0 && rowCs >= 0 && rowAttempts >= minimumAttempts
      ? { stolenBases:rowSb, attempts:rowAttempts, successRate:rowSb / rowAttempts, plateAppearances:Number.isFinite(rowPa) && rowPa > 0 ? rowPa : null }
      : null;
  }).filter(Boolean);
  if (!leagueRows.length) return { percentile:null, volumePercentile:null, efficiencyPercentile:null, attempts, successRate:sb / attempts, minimumAttempts, status:'comparison-unavailable', opportunityMetric:null };
  const hasRatePopulation = Number.isFinite(pa) && pa > 0 && leagueRows.every(row => row.plateAppearances != null);
  const opportunityMetric = hasRatePopulation ? 'stolen bases per 600 PA' : 'stolen-base volume';
  const teamOpportunity = hasRatePopulation ? sb / pa * 600 : sb;
  const volumePercentile = percentile(teamOpportunity, leagueRows.map(row => hasRatePopulation ? row.stolenBases / row.plateAppearances * 600 : row.stolenBases), true);
  const efficiencyPercentile = percentile(sb / attempts, leagueRows.map(row => row.successRate), true);
  if (volumePercentile == null || efficiencyPercentile == null) return { percentile:null, volumePercentile, efficiencyPercentile, attempts, successRate:sb / attempts, minimumAttempts, status:'comparison-unavailable', opportunityMetric };
  return {
    percentile: Math.round(volumePercentile * 0.45 + efficiencyPercentile * 0.55),
    volumePercentile,
    efficiencyPercentile,
    attempts,
    successRate:sb / attempts,
    minimumAttempts,
    status:hasRatePopulation ? 'verified-rate' : 'volume-fallback',
    opportunityMetric,
  };
}

export function deriveOrganizationFutureValue(teamAbbr = '') {
  const hitterBaselines = fvBaselines(PROSPECT_BATTERS, false);
  const pitcherBaselines = fvBaselines(PROSPECT_PITCHERS, true);
  const byTeam = new Map();
  [
    ...PROSPECT_BATTERS.map(prospect => ({ prospect, isPitcher:false })),
    ...PROSPECT_PITCHERS.map(prospect => ({ prospect, isPitcher:true })),
  ].forEach(({ prospect, isPitcher }) => {
    const futureValue = computeFV(prospect, isPitcher ? pitcherBaselines : hitterBaselines, isPitcher);
    const key = String(prospect?.team || '').toUpperCase();
    if (!key || futureValue == null) return;
    const current = byTeam.get(key) || [];
    current.push(futureValue);
    byTeam.set(key, current);
  });
  const organizationScores = [...byTeam.entries()].map(([team, values]) => {
    const ranked = [...values].sort((a, b) => b - a);
    const average = limit => ranked.slice(0, limit).reduce((sum, value, index, rows) => sum + value / rows.length, 0);
    return { team, prospectCount:ranked.length, topThreeAverage:average(Math.min(3, ranked.length)), topFiveAverage:average(Math.min(5, ranked.length)) };
  }).filter(row => row.prospectCount >= 2);
  const target = organizationScores.find(row => row.team === String(teamAbbr).toUpperCase());
  if (!target) return { futureValuePct:null, prospectCount:0, topThreeAverage:null, topFiveAverage:null, topThreePercentile:null, topFivePercentile:null, organizationCount:organizationScores.length, status:'insufficient-snapshot' };
  const topThreePercentile = percentile(target.topThreeAverage, organizationScores.map(row => row.topThreeAverage), true);
  const topFivePercentile = percentile(target.topFiveAverage, organizationScores.map(row => row.topFiveAverage), true);
  return {
    futureValuePct: topThreePercentile == null || topFivePercentile == null ? null : Math.round(topThreePercentile * 0.65 + topFivePercentile * 0.35),
    prospectCount:target.prospectCount,
    topThreeAverage:Number(target.topThreeAverage.toFixed(1)),
    topFiveAverage:Number(target.topFiveAverage.toFixed(1)),
    topThreePercentile,
    topFivePercentile,
    organizationCount:organizationScores.length,
    status:target.prospectCount >= 5 ? 'snapshot-complete' : 'snapshot-partial',
  };
}

export function deriveFrontOfficeCoverageGrades({ players = { hitting:[], pitching:[] }, liveDataMode = 'unavailable', teamAbbr = '', oaaPercentile = null, oaaPopulationCount = 0 } = {}) {
  const rollups = deriveTeamPlayerRollups(players);
  const verifiedRoster = (liveDataMode === 'live' || liveDataMode === 'cached') && rollups.activePlayers != null;
  const positions = rollups.positions || [];
  const fieldingRows = positions.filter(row => !['P','SP','RP','DH','TWP'].includes(String(row.position || '').toUpperCase()));
  const fieldingPositions = [...new Set(fieldingRows.map(row => String(row.position || '').toUpperCase()).filter(Boolean))];
  const fieldingPlayerCount = fieldingRows.reduce((sum, row) => sum + Number(row.players || 0), 0);
  const pitcherCount = positions.filter(row => ['P','SP','RP','TWP'].includes(String(row.position || '').toUpperCase())).reduce((sum, row) => sum + Number(row.players || 0), 0);
  const coveragePct = Math.min(100, Math.round(fieldingPositions.length / 8 * 100));
  const workloadCoveragePct = fieldingPositions.length
    ? Math.min(100, Math.round(fieldingRows.filter(row => Number(row.pa || 0) >= 20).length / 8 * 100))
    : null;
  const redundancyPct = fieldingPositions.length
    ? Math.min(100, Math.round(fieldingRows.filter(row => Number(row.players || 0) >= 2).length / Math.min(6, fieldingPositions.length) * 100))
    : null;
  const defenseCoveragePct = verifiedRoster && fieldingPositions.length && redundancyPct != null && workloadCoveragePct != null
    ? Math.round(coveragePct * 0.45 + workloadCoveragePct * 0.35 + redundancyPct * 0.2)
    : null;
  const validOaaPercentile = oaaPercentile != null && Number.isFinite(Number(oaaPercentile)) ? Number(oaaPercentile) : null;
  const hasComparableOaa = validOaaPercentile != null && Number(oaaPopulationCount) >= 20;
  const defensePct = hasComparableOaa
    ? defenseCoveragePct == null ? Math.round(validOaaPercentile) : Math.round(validOaaPercentile * 0.8 + defenseCoveragePct * 0.2)
    : null;
  const rosterDepthPct = verifiedRoster && positions.length
    ? Math.min(100, Math.round(((Math.min(rollups.activePlayers, 26) / 26) * 0.5 + (coveragePct / 100) * 0.25 + (Math.min(pitcherCount, 13) / 13) * 0.25) * 100))
    : null;
  const farmSystemRank = Number(MLB_PIPELINE_FARM_SYSTEM_RANKINGS.ranks[String(teamAbbr).toUpperCase()]);
  const farmSystemPct = Number.isFinite(farmSystemRank) && farmSystemRank >= 1 && farmSystemRank <= 30
    ? Math.round(((31 - farmSystemRank) / 30) * 100)
    : null;
  const depthPct = farmSystemPct == null
    ? null
    : rosterDepthPct == null
      ? farmSystemPct
      : Math.round(rosterDepthPct * 0.35 + farmSystemPct * 0.65);
  const futureValue = deriveOrganizationFutureValue(teamAbbr);
  return {
    defensePct,
    defenseCoveragePct,
    defenseStatus:hasComparableOaa ? (defenseCoveragePct == null ? 'statcast-only' : 'verified') : defenseCoveragePct == null ? 'unavailable' : 'awaiting-statcast',
    oaaPercentile:Number.isFinite(validOaaPercentile) ? validOaaPercentile : null,
    oaaPopulationCount:Number(oaaPopulationCount) || 0,
    depthPct,
    depthStatus:farmSystemPct == null ? 'unavailable' : rosterDepthPct == null ? 'farm-only' : 'verified',
    rosterDepthPct,
    farmSystemRank:Number.isFinite(farmSystemRank) ? farmSystemRank : null,
    farmSystemPct,
    futureValuePct:futureValue.futureValuePct,
    fieldingPositions:fieldingPositions.length,
    fieldingPlayerCount,
    pitcherCount,
    coveragePct,
    workloadCoveragePct,
    redundancyPct,
    activePlayers:rollups.activePlayers,
    prospectCount:futureValue.prospectCount,
    prospectTopThreeAverage:futureValue.topThreeAverage,
    prospectTopFiveAverage:futureValue.topFiveAverage,
    prospectTopThreePercentile:futureValue.topThreePercentile,
    prospectTopFivePercentile:futureValue.topFivePercentile,
    prospectOrganizationCount:futureValue.organizationCount,
  };
}

export function buildOrganizationProspectDepthChart(teamAbbr = '') {
  const hitterBaselines = fvBaselines(PROSPECT_BATTERS, false);
  const pitcherBaselines = fvBaselines(PROSPECT_PITCHERS, true);
  const prospects = [
    ...PROSPECT_BATTERS.filter(prospect => String(prospect.team).toUpperCase() === String(teamAbbr).toUpperCase()).map(prospect => ({ ...prospect, isPitcher:false })),
    ...PROSPECT_PITCHERS.filter(prospect => String(prospect.team).toUpperCase() === String(teamAbbr).toUpperCase()).map(prospect => ({ ...prospect, isPitcher:true })),
  ].map(prospect => ({
    ...prospect,
    futureValue: computeFV(prospect, prospect.isPitcher ? pitcherBaselines : hitterBaselines, prospect.isPitcher),
  })).filter(prospect => prospect.futureValue != null);
  const byPosition = new Map();
  prospects.forEach(prospect => {
    const position = String(prospect.pos || (prospect.isPitcher ? 'P' : '—'));
    const group = byPosition.get(position) || [];
    group.push(prospect);
    byPosition.set(position, group);
  });
  const rows = [...byPosition.entries()].map(([position, playerRows]) => ({
    position,
    prospects: playerRows.sort((a, b) => b.futureValue - a.futureValue || a.rank - b.rank),
    topFutureValue: Math.max(...playerRows.map(prospect => prospect.futureValue)),
  })).sort((a, b) => b.topFutureValue - a.topFutureValue || a.position.localeCompare(b.position));
  return { prospects, rows };
}
function rankAmong(teams, key, asc=false) {
  const vals=Object.values(teams).map(t=>t[key]).sort((a,b)=>asc?a-b:b-a);
  return v=>vals.indexOf(v)+1;
}
function getSplits() {
  // MLB Stats API does not expose home/away, handedness, day/night, and
  // recent-form team splits through the aggregate endpoint used here. Do not
  // turn aggregate season totals into invented split values.
  return [];
}

function formatLeaderValue(value, digits = 0, scorebookRate = false) {
  if (value == null || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  return scorebookRate ? fmtScorebookRate(number, digits) : number.toFixed(digits);
}

function formatPanelMetric(value, suffix = '') {
  return value == null || value === '' ? '—' : `${value}${suffix}`;
}

export function isHittingLeaderRow(row) {
  const plateAppearances = Number(row?.stat?.plateAppearances ?? row?.stat?.pa);
  const inningsPitched = Number(row?.stat?.inningsPitched ?? row?.stat?.ip);
  return Number.isFinite(plateAppearances) && plateAppearances > 0 && !(Number.isFinite(inningsPitched) && inningsPitched > 0);
}

export function isPitchingLeaderRow(row) {
  const inningsPitched = Number(row?.stat?.inningsPitched ?? row?.stat?.ip);
  const plateAppearances = Number(row?.stat?.plateAppearances ?? row?.stat?.pa);
  return Number.isFinite(inningsPitched) && inningsPitched > 0 && !(Number.isFinite(plateAppearances) && plateAppearances > 0);
}

export const TEAM_LEADER_ELIGIBILITY = Object.freeze({
  season: Object.freeze({ hitterRatePa: 50, pitcherRateIp: 10 }),
  hotStreak: Object.freeze({
    7: Object.freeze({ hitterRatePa: 10, pitcherRateIp: 3 }),
    15: Object.freeze({ hitterRatePa: 20, pitcherRateIp: 5 }),
    30: Object.freeze({ hitterRatePa: 40, pitcherRateIp: 10 }),
  }),
});

export const TEAM_LEADER_EVERYDAY_PA_PER_GAME = 3.5;
export const TEAM_LEADER_EVERYDAY_PA_SHARE = 0.33;

export function getTeamLeaderHitterPaMinimum(team = {}) {
  const wins = Number(team?.w);
  const losses = Number(team?.l);
  const gamesPlayed = wins + losses;
  if (!Number.isFinite(gamesPlayed) || gamesPlayed <= 0) return null;
  return Math.ceil(gamesPlayed * TEAM_LEADER_EVERYDAY_PA_PER_GAME * TEAM_LEADER_EVERYDAY_PA_SHARE);
}

export const HOT_STREAK_RANGE_OPTIONS = Object.freeze([
  Object.freeze({ days: 7, label: '7 days' }),
  Object.freeze({ days: 15, label: '15 days' }),
  Object.freeze({ days: 30, label: '30 days' }),
]);

function buildLeaderGroups(hittingRows = [], pitchingRows = [], { hitterRatePa, pitcherRateIp, hotStreak = false }) {
  const top = (rows, key, direction = 'desc', rowFilter = () => true) => [...rows]
    .filter(row => rowFilter(row) && Number.isFinite(Number(row.stat?.[key])))
    .sort((a, b) => direction === 'asc'
      ? Number(a.stat[key]) - Number(b.stat[key])
      : Number(b.stat[key]) - Number(a.stat[key]))[0] || null;
  const rateEligibleHitter = row => isHittingLeaderRow(row) && Number(row?.stat?.plateAppearances ?? row?.stat?.pa) >= hitterRatePa;
  const rateEligiblePitcher = row => isPitchingLeaderRow(row) && Number(row?.stat?.inningsPitched ?? row?.stat?.ip) >= pitcherRateIp;
  const hit = (cat, key, digits = 0, direction = 'desc', scorebookRate = false, isRate = false) => {
    const row = top(hittingRows, key, direction, isRate ? rateEligibleHitter : isHittingLeaderRow);
    return {
      cat,
      eligibility: isRate ? `${hitterRatePa} PA+` : null,
      player: row?.name || '—',
      playerId: row?.id ?? null,
      val: row ? formatLeaderValue(row.stat[key], digits, scorebookRate) : '—',
    };
  };
  const pit = (cat, key, digits = 0, direction = 'desc', isRate = false) => {
    const row = top(pitchingRows, key, direction, isRate ? rateEligiblePitcher : isPitchingLeaderRow);
    return {
      cat,
      eligibility: isRate ? `${pitcherRateIp} IP+` : null,
      player: row?.name || '—',
      playerId: row?.id ?? null,
      val: row ? formatLeaderValue(row.stat[key], digits) : '—',
    };
  };
  return {
    batting: hotStreak
      ? [hit('OPS', 'ops', 3, 'desc', true, true), hit('HR', 'homeRuns')]
      : [hit('HR', 'homeRuns'), hit('AVG', 'avg', 3, 'desc', true, true), hit('OPS', 'ops', 3, 'desc', true, true), hit('RBI', 'rbi'), hit('SB', 'stolenBases')],
    pitching: hotStreak
      ? [pit('ERA', 'era', 2, 'asc', true), pit('K', 'strikeOuts')]
      : [pit('ERA', 'era', 2, 'asc', true), pit('K', 'strikeOuts'), pit('WHIP', 'whip', 2, 'asc', true), pit('W', 'wins'), pit('SV', 'saves')],
  };
}

export function getLeaders(hittingRows = [], pitchingRows = [], eligibility = TEAM_LEADER_ELIGIBILITY.season) {
  return buildLeaderGroups(hittingRows, pitchingRows, eligibility);
}

export function getHotStreakLeaders(hittingRows = [], pitchingRows = [], days = 15) {
  const selectedDays = HOT_STREAK_RANGE_OPTIONS.some(option => option.days === Number(days)) ? Number(days) : 15;
  const groups = buildLeaderGroups(hittingRows, pitchingRows, { ...TEAM_LEADER_ELIGIBILITY.hotStreak[selectedDays], hotStreak: true });
  return {
    ...groups,
    days: selectedDays,
    available: [...groups.batting, ...groups.pitching].some(row => row.playerId != null),
  };
}

function TeamLeaderProfileLink({ row, color, group }) {
  const content = <>
    <PlayerPhoto id={row.playerId} name={row.player} alt="" size={22} variant="avatar" />
    <span style={sans({fontSize:11,color:C.text2})}>{row.player}</span>
  </>;
  if (row.playerId == null) return <span style={{display:'flex',gap:7,alignItems:'center'}}>{content}</span>;
  return <button type="button" className="skip-team-leader-profile-link" onClick={() => openPlayerProfile(row.playerId, row.player)} aria-label={`Open ${row.player} player profile from ${group} leaders`}>
    {content}
  </button>;
}

function ExecutivePercentileMarker({ label, percentile: value, population, compact = false }) {
  const percentileValue = Number(value);
  if (!Number.isFinite(percentileValue)) return null;
  const clamped = Math.max(0, Math.min(100, percentileValue));
  const rank = percentileLabel(clamped);
  if (compact) return <span className="skip-executive-percentile is-compact" aria-label={`${label}: ${rank} percentile among ${population}`}><span>League</span><strong>P{rank}</strong></span>;
  return <div className="skip-executive-percentile" aria-label={`${label}: ${rank} percentile among ${population}`}>
    <span className="skip-executive-percentile-label">League percentile</span>
    <span className="skip-executive-percentile-track" aria-hidden="true"><i style={{ left:`${clamped}%` }} /></span>
    <strong>{rank}</strong>
  </div>;
}

export function CompactExecutiveBriefing({ rd, ops, era, executivePercentiles, activeView, onOpenPerformance, onOpenProspects }) {
  const signals = [
    { label:'Posture', value:rd == null ? 'Pending' : rd > 0 ? 'Contending' : 'Run support', detail:rd == null ? 'Run diff pending' : `${rd > 0 ? '+' : ''}${rd} RD`, marker:executivePercentiles?.posture, color:rd == null ? C.text3 : rd > 0 ? C.teal : C.rust, action:onOpenPerformance, destination:'Performance' },
    { label:'Signal', value:ops == null ? 'Pending' : ops >= .750 ? 'Offense' : era != null && era <= 3.50 ? 'Prevention' : 'Balanced', detail:ops == null ? 'Aggregates loading' : `OPS ${fmtScorebookRate(ops)} · ERA ${formatTeamMetric(era,2)}`, marker:executivePercentiles?.best, color:ops >= .750 ? C.amber : C.navy, action:onOpenPerformance, destination:'Performance' },
    { label:'Next', value:'Prospect depth', detail:'Review future value', color:C.purple, action:onOpenProspects, destination:'Prospects' },
  ];
  return <section id="team-overview-briefing" role="region" className="skip-compact-executive-briefing" aria-labelledby="team-overview-briefing-title" data-active-view={activeView}>
    <div className="skip-compact-executive-title"><span>Executive</span><strong id="team-overview-briefing-title">Front Office Read</strong></div>
    <div className="skip-compact-executive-signals">
      {signals.map(signal => <button key={signal.label} type="button" onClick={signal.action} className="skip-compact-executive-signal" aria-label={`Open ${signal.destination}: ${signal.label}`}>
        <span>{signal.label}</span><strong style={{color:signal.color}}>{signal.value}</strong><small>{signal.detail}</small>{signal.marker && <ExecutivePercentileMarker {...signal.marker} compact />}
      </button>)}
    </div>
  </section>;
}

function getBattedBall() { return null; }
function getPitchArsenal() { return null; }

export function buildBattedBallProfile(rows = []) {
  const speeds = rows.map(row => Number(row?.launch_speed)).filter(Number.isFinite);
  const angles = rows.map(row => Number(row?.launch_angle)).filter(Number.isFinite);
  if (!speeds.length) return null;
  const count = speeds.length;
  const pct = value => Number((value / count * 100).toFixed(1));
  const bbTypes = rows.map(row => String(row?.bb_type || '').toLowerCase()).filter(value => value && value !== 'null' && value !== 'undefined');
  const classifiedBarrels = rows.filter(row => {
    const raw = row?.launch_speed_angle;
    return raw !== null && raw !== undefined && raw !== '' && Number.isFinite(Number(raw));
  });
  const barrels = classifiedBarrels.filter(row => Number(row.launch_speed_angle) === 6).length;
  return {
    barrelPct: classifiedBarrels.length ? pct(barrels) : null,
    hardHitPct: pct(speeds.filter(value => value >= 95).length),
    sweetSpot: pct(angles.filter(value => value >= 8 && value <= 32).length),
    avgEV: (speeds.reduce((sum, value) => sum + value, 0) / count).toFixed(1),
    maxEV: Math.max(...speeds).toFixed(1),
    launchAngle: angles.length ? (angles.reduce((sum, value) => sum + value, 0) / angles.length).toFixed(1) : null,
    pullPct: null,
    centerPct: null,
    oppoPct: null,
    gbPct: bbTypes.length ? pct(bbTypes.filter(value => value === 'ground_ball').length) : null,
    fbPct: bbTypes.length ? pct(bbTypes.filter(value => value === 'fly_ball' || value === 'popup').length) : null,
    ldPct: bbTypes.length ? pct(bbTypes.filter(value => value === 'line_drive').length) : null,
    sampleSize: count,
  };
}

const ARSENAL_COLORS = [C.amber, C.teal, C.rust, C.purple, C.slate, C.navy];
export function buildPitchArsenalRows(rows = []) {
  const typed = rows.filter(row => row?.pitch_type);
  if (!typed.length) return null;
  const groups = new Map();
  typed.forEach(row => {
    const type = String(row.pitch_type);
    const group = groups.get(type) || { type, count: 0, speeds: [] };
    group.count += 1;
    const speed = Number(row.release_speed);
    if (Number.isFinite(speed)) group.speeds.push(speed);
    groups.set(type, group);
  });
  const total = typed.length;
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 8).map((group, index) => ({
    type: group.type,
    pct: Number((group.count / total * 100).toFixed(1)),
    stuffPlus: null,
    avgVelocity: group.speeds.length ? Number((group.speeds.reduce((sum, value) => sum + value, 0) / group.speeds.length).toFixed(1)) : null,
    color: ARSENAL_COLORS[index % ARSENAL_COLORS.length],
    count: group.count,
  }));
}

export async function resolveTeamSavantSnapshot({
  teamAbbr,
  season,
  cached,
  hitters = [],
  pitchers = [],
  now = Date.now(),
  cacheTtlMs = DAILY_CACHE_TTL_MS,
  getTeamExitVelocityFn = getTeamExitVelocity,
  getTeamBattedBallsFn = null,
  getPlayerContactPointsFn = getPlayerContactPoints,
  getPitcherPitchesFn = getPitcherPitches,
  saveCacheFn = () => {},
} = {}) {
  if (cached && now - Number(cached.updatedAt || 0) < cacheTtlMs) {
    return { snapshot: cached.data, source: 'Baseball Savant Statcast Search · cached verified roster rollup', cacheHit: true };
  }
  const [directRows, directBattedRows] = await Promise.all([
    getTeamExitVelocityFn(teamAbbr, season).catch(() => null),
    typeof getTeamBattedBallsFn === 'function' ? getTeamBattedBallsFn(teamAbbr, season).catch(() => null) : Promise.resolve(null),
  ]);
  const hasDirectBattedRows = Array.isArray(directBattedRows) && directBattedRows.length > 0;
  const contactRows = Array.isArray(directRows) && directRows.length
    ? directRows
    : hasDirectBattedRows
      ? directBattedRows
    : (await Promise.all(hitters.filter(row => row?.id).map(row => getPlayerContactPointsFn(row.id, season).catch(() => null)))).flatMap(result => Array.isArray(result) ? result : []);
  const pitchRows = (await Promise.all(pitchers.filter(row => row?.id).map(row => getPitcherPitchesFn(row.id, season).catch(() => null)))).flatMap(result => Array.isArray(result) ? result : []);
  const source = hasDirectBattedRows
    ? 'Baseball Savant Statcast Search · verified team batted-ball query'
    : Array.isArray(directRows) && directRows.length
      ? 'Baseball Savant Statcast Search · team query'
      : (contactRows.length || pitchRows.length ? 'Baseball Savant Statcast Search · verified roster rollup' : '');
  const snapshot = { exitVelocityRows: contactRows, battedBallRows: hasDirectBattedRows ? directBattedRows : contactRows, pitchRows };
  const hasVerifiedRows = contactRows.length > 0 || hasDirectBattedRows || pitchRows.length > 0;
  if (hasVerifiedRows) saveCacheFn(teamAbbr, season, snapshot);
  return { snapshot, source, cacheHit: false };
}

export function buildExitVelocityBins(rows = []) {
  const speeds = rows
    .map(row => row?.launch_speed)
    .filter(value => value != null && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  if (!speeds.length) return [];
  const buckets = new Map();
  speeds.forEach(speed => {
    const mph = Math.max(50, Math.min(115, Math.floor(speed / 5) * 5));
    buckets.set(mph, (buckets.get(mph) || 0) + 1);
  });
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([mph, count]) => ({ mph, pct: Number((count / speeds.length * 100).toFixed(1)), count }));
}

// Front office evaluation (seeded per team)
export function buildTeamStrengthData({ offense, power, speed, contact, pitching, command } = {}) {
  return [
    { axis:'Offense', val:offense },
    { axis:'Power', val:power },
    { axis:'Speed', val:speed },
    { axis:'Contact', val:contact },
    { axis:'Pitching', val:pitching },
    { axis:'Command', val:command },
  ].filter(row => row.val != null && Number.isFinite(Number(row.val)))
    .map(row => ({ ...row, val:Number(row.val) }));
}

export const MLB_LEAGUE_COMPARISON_TEAM_COUNT = 30;

function averageFinite(values = []) {
  const numeric = values
    .filter(value => value != null && value !== '')
    .map(Number)
    .filter(Number.isFinite);
  return numeric.length ? numeric.reduce((sum, value) => sum + value, 0) / numeric.length : null;
}

function firstFiniteMetric(row, keys = []) {
  const value = keys
    .map(key => row?.[key])
    .find(candidate => candidate != null && candidate !== '' && Number.isFinite(Number(candidate)));
  return value == null || value === '' ? null : Number(value);
}

export function buildLiveRadarData({ team = {}, liveTeamData, runDiff = null } = {}) {
  const records = Object.values(liveTeamData?.byAbbr || {});
  const hittingRecords = records.map(row => row?.hitting).filter(Boolean);
  const pitchingRecords = records.map(row => row?.pitching).filter(Boolean);
  const standingsRecords = records.map(row => row?.standings).filter(Boolean);
  const rankValue = (value, rows, keys, higher = true) => {
    if (value == null || value === '') return null;
    const current = Number(value);
    if (!Number.isFinite(current)) return null;
    const values = rows.map(row => firstFiniteMetric(row, keys)).filter(Number.isFinite);
    return values.length ? percentile(current, values, higher) : null;
  };
  const offense = rankValue(team.ops, hittingRecords, ['ops']);
  const power = rankValue(team.hr, hittingRecords, ['homeRuns']);
  const speed = rankValue(team.sb, hittingRecords, ['stolenBases']);
  const contact = rankValue(team.avg, hittingRecords, ['avg']);
  const pitching = rankValue(team.era, pitchingRecords, ['era'], false);
  const command = rankValue(team.whip, pitchingRecords, ['whip'], false);
  const completeLeaguePopulation = records.length === MLB_LEAGUE_COMPARISON_TEAM_COUNT;
  const leagueAveragePercentile = (rows, keys, higher = true) => {
    if (!completeLeaguePopulation) return null;
    const values = rows.map(row => firstFiniteMetric(row, keys)).filter(Number.isFinite);
    if (values.length !== MLB_LEAGUE_COMPARISON_TEAM_COUNT) return null;
    const average = averageFinite(values);
    return average == null ? null : percentile(average, values, higher);
  };
  const strengthBenchmark = {
    offense:leagueAveragePercentile(hittingRecords, ['ops']),
    power:leagueAveragePercentile(hittingRecords, ['homeRuns']),
    speed:leagueAveragePercentile(hittingRecords, ['stolenBases']),
    contact:leagueAveragePercentile(hittingRecords, ['avg']),
    pitching:leagueAveragePercentile(pitchingRecords, ['era'], false),
    command:leagueAveragePercentile(pitchingRecords, ['whip'], false),
  };
  const strengthData = buildTeamStrengthData({ offense, power, speed, contact, pitching, command }).map(row => ({
    ...row,
    leagueAverage:strengthBenchmark[row.axis.toLowerCase()] ?? null,
  }));
  const hasLeagueBenchmark = strengthData.length === 6 && strengthData.every(row => row.leagueAverage != null && Number.isFinite(Number(row.leagueAverage)));
  const offenseData = [
    { axis:'OPS', val:offense },
    { axis:'SLG', val:rankValue(team.slg, hittingRecords, ['slg']) },
    { axis:'OBP', val:rankValue(team.obp, hittingRecords, ['obp']) },
    { axis:'HR', val:power },
    { axis:'SB', val:speed },
    { axis:'Run Diff', val:rankValue(runDiff, standingsRecords, ['diff']) },
  ].filter(row => row.val != null);
  return {
    offenseData,
    strengthData,
    hasLeagueBenchmark,
    leagueTeamCount:completeLeaguePopulation ? MLB_LEAGUE_COMPARISON_TEAM_COUNT : records.length,
    source: offenseData.length || records.length ? 'MLB Stats API team aggregates' : 'MLB Stats API unavailable',
  };
}

export function getStrengthRadarBenchmarkCaption({
  hasLeagueBenchmark = false,
  leagueTeamCount = 0,
  radarSource = 'MLB Stats API unavailable',
} = {}) {
  if (hasLeagueBenchmark && leagueTeamCount === MLB_LEAGUE_COMPARISON_TEAM_COUNT) {
    return `Solid: selected team percentile · dashed: MLB average benchmark · current documented ${leagueTeamCount}-team aggregate pool.`;
  }
  return `Source: ${radarSource}. League-average benchmark unavailable until a complete documented current ${MLB_LEAGUE_COMPARISON_TEAM_COUNT}-team aggregate pool is returned.`;
}

function getFrontOffice(t) {
  const has = key => t[key] != null && Number.isFinite(Number(t[key]));
  const strengths = [
    ['Positive run differential', has('rs') && has('ra') && t.rs > t.ra],
    ['Above-average offense', has('ops') && t.ops >= .750],
    ['Strong run prevention', has('era') && t.era <= 3.50],
    ['High strikeout volume', has('k') && t.k >= 600],
    ['Home-run power', has('hr') && t.hr >= 100],
    ['Stolen-base volume', has('sb') && t.sb >= 70],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  const weaknesses = [
    ['Negative run differential', has('rs') && has('ra') && t.rs < t.ra],
    ['Below-average offense', has('ops') && t.ops < .720],
    ['Run-prevention risk', has('era') && t.era > 4.00],
    ['Low strikeout volume', has('k') && t.k < 520],
    ['Limited home-run power', has('hr') && t.hr < 75],
    ['Limited stolen-base volume', has('sb') && t.sb < 40],
  ].filter(([, ok]) => ok).map(([s]) => s).slice(0, 4);
  return { strengths, weaknesses };
}

function buildRosterInsights(team, players) {
  const hitters = (players?.hitting || []).filter(row => row?.stat);
  const pitchers = (players?.pitching || []).filter(row => row?.stat);
  const numeric = (value) => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const topHitter = [...hitters].sort((a, b) => (numeric(b.stat?.ops) ?? -Infinity) - (numeric(a.stat?.ops) ?? -Infinity))[0];
  const topPitcher = [...pitchers].sort((a, b) => (numeric(a.stat?.era) ?? Infinity) - (numeric(b.stat?.era) ?? Infinity))[0];
  const strengths = [];
  const weaknesses = [];
  const add = (list, title, detail, evidence) => list.push({ title, detail, evidence });

  if (numeric(team.ops) != null && team.ops >= .750) add(strengths, 'Lineup creates leverage', `${topHitter?.name || 'The lineup'} leads the roster by OPS`, `Team OPS ${fmtScorebookRate(team.ops)}`);
  if (numeric(team.hr) != null && team.hr >= 100) add(strengths, 'Power is a carrying tool', 'Home-run production gives the roster a reliable extra-base path', `${formatTeamMetric(team.hr)} HR`);
  if (numeric(team.era) != null && team.era <= 3.70) add(strengths, 'Run prevention is stable', `${topPitcher?.name || 'The staff'} anchors the current pitching group`, `Team ERA ${formatTeamMetric(team.era, 2)}`);
  if (numeric(team.k) != null && team.k >= 700) add(strengths, 'Strikeout volume travels', 'The staff can miss bats and limit balls in play', `${formatTeamMetric(team.k)} strikeouts`);
  if (numeric(rdForInsights(team)) != null && rdForInsights(team) > 0) add(strengths, 'Results support the profile', 'The roster is converting its run-creation and run-prevention balance into wins', `${rdForInsights(team) > 0 ? '+' : ''}${rdForInsights(team)} run differential`);

  if (numeric(team.ops) != null && team.ops < .720) add(weaknesses, 'Offensive margin is thin', 'The lineup may need more on-base traffic or impact contact', `Team OPS ${fmtScorebookRate(team.ops)}`);
  if (numeric(team.era) != null && team.era > 4.00) add(weaknesses, 'Run prevention needs support', 'The staff is allowing too much damage for a stable team baseline', `Team ERA ${formatTeamMetric(team.era, 2)}`);
  if (numeric(team.whip) != null && team.whip > 1.30) add(weaknesses, 'Traffic is accumulating', 'Base runners allowed per inning are creating avoidable leverage swings', `WHIP ${formatTeamMetric(team.whip, 3)}`);
  if (numeric(rdForInsights(team)) != null && rdForInsights(team) < 0) add(weaknesses, 'Results lag the roster signals', 'The negative run differential points to a current execution gap', `${rdForInsights(team)} run differential`);

  return {
    strengths: strengths.slice(0, 3),
    weaknesses: weaknesses.slice(0, 3),
    source: hitters.length || pitchers.length ? 'Current roster leaders + live team aggregates' : 'Current team aggregates; roster leaders are still loading',
  };
}

function rdForInsights(team) {
  const rs = Number(team?.rs), ra = Number(team?.ra);
  return Number.isFinite(rs) && Number.isFinite(ra) ? rs - ra : null;
}

export const ROSTER_PRESETS = [
  { id:'qualified-hitters', label:'Qualified hitters', positions:[], sort:'ops', minBattingPa:150, minPitchingIp:0 },
  { id:'rotation-candidates', label:'Rotation candidates', positions:['SP'], sort:'era', minBattingPa:0, minPitchingIp:30 },
  { id:'high-leverage-arms', label:'High-leverage arms', positions:['RP'], sort:'era', minBattingPa:0, minPitchingIp:10 },
];

const ROSTER_SORT_OPTIONS = [
  { key:'name', label:'Player name', group:'all', digits:0, direction:'asc' },
  { key:'position', label:'Position', group:'all', digits:0, direction:'asc' },
  { key:'ops', label:'OPS', group:'hitting', digits:3, direction:'desc' },
  { key:'recentOps', label:'Recent OPS', group:'hitting', digits:3, direction:'desc' },
  { key:'homeRuns', label:'Home Runs', group:'hitting', digits:0, direction:'desc' },
  { key:'avg', label:'AVG', group:'hitting', digits:3, direction:'desc' },
  { key:'rbi', label:'RBI', group:'hitting', digits:0, direction:'desc' },
  { key:'fantasyPoints', label:'Fantasy Points', group:'hitting', digits:0, direction:'desc' },
  { key:'stolenBases', label:'Stolen Bases', group:'hitting', digits:0, direction:'desc' },
  { key:'pa', label:'Plate Appearances', group:'hitting', digits:0, direction:'desc' },
  { key:'era', label:'ERA', group:'pitching', digits:2, direction:'asc' },
  { key:'whip', label:'WHIP', group:'pitching', digits:3, direction:'asc' },
  { key:'strikeOuts', label:'Strikeouts', group:'pitching', digits:0, direction:'desc' },
  { key:'ip', label:'Innings Pitched', group:'pitching', digits:1, direction:'desc' },
];

export function hitterFantasyPoints(row) {
  const stat = row?.stat || {};
  const values = ['hits','doubles','triples','homeRuns','rbi','runs','baseOnBalls','stolenBases','caughtStealing'].map(key => Number(stat[key]));
  if (values.some(value => !Number.isFinite(value))) return null;
  const [hits, doubles, triples, homeRuns, rbi, runs, walks, stolenBases, caughtStealing] = values;
  const singles = hits - doubles - triples - homeRuns;
  if (singles < 0) return null;
  return singles + doubles * 2 + triples * 3 + homeRuns * 4 + rbi + runs + walks + stolenBases * 2 - caughtStealing;
}

export function rosterStatValue(row, key) {
  if (key === 'name') return String(row?.name || '');
  if (key === 'position') return String(row?.position || '');
  const stat = row?.stat || {};
  if (key === 'fantasyPoints') return hitterFantasyPoints(row);
  const aliases = { recentOps:['recentOps','last10Ops','lastTenGamesOps','last30Ops'], avg:['avg','battingAverage'], homeRuns:['homeRuns','hr'], rbi:['rbi','runsBattedIn'], stolenBases:['stolenBases','sb'], strikeOuts:['strikeOuts','strikeouts','so'], pa:['plateAppearances','pa'], ip:['inningsPitched','ip'] };
  for (const candidate of (aliases[key] || [key])) {
    const value = Number(stat[candidate]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function formatRosterStat(row, option) {
  const value = rosterStatValue(row, option.key);
  if (value == null) return option.key === 'fantasyPoints' ? 'Unavailable' : '—';
  if (option.key === 'name' || option.key === 'position') return String(value || '—');
  return value.toFixed(option.digits);
}

export const ROSTER_QUICK_FILTERS = [
  { id:'all', label:'All players', positions:[], sort:'ops', minBattingPa:0, minPitchingIp:0 },
  { id:'hitters', label:'Hitters', positions:[], sort:'fantasyPoints', minBattingPa:0, minPitchingIp:0 },
  { id:'pitchers', label:'Pitchers', positions:[], sort:'era', minBattingPa:0, minPitchingIp:0 },
  { id:'recent', label:'Recent performance', positions:[], sort:'recentOps', minBattingPa:0, minPitchingIp:0 },
  { id:'top-ops', label:'Current offense', positions:[], sort:'ops', minBattingPa:50, minPitchingIp:0 },
  { id:'top-fantasy', label:'Fantasy leaders', positions:[], sort:'fantasyPoints', minBattingPa:50, minPitchingIp:0 },
];

export function formatRosterSampleLabel(group, minimum) {
  const unit = group === 'hitting' ? 'PA' : 'IP';
  return minimum > 0 ? `${minimum} ${unit}+` : `Any ${unit}`;
}

export function buildRosterRows(players, positions, sortKey, minBattingPa = 0, minPitchingIp = 0, sortDirection = null, playerQuery = '') {
  const option = ROSTER_SORT_OPTIONS.find(item => item.key === sortKey) || ROSTER_SORT_OPTIONS[0];
  const selectedPositions = positions === 'all' || !Array.isArray(positions) ? (positions === 'all' ? [] : [positions]) : positions;
  const normalizedQuery = String(playerQuery || '').trim().toLowerCase();
  const direction = sortDirection === 'asc' || sortDirection === 'desc' ? sortDirection : option.direction;
  return [
    ...(players?.hitting || []).map(row => ({ ...row, group:'hitting' })),
    ...(players?.pitching || []).map(row => ({ ...row, group:'pitching' })),
  ].filter(row => {
    if (!row?.stat || (option.group !== 'all' && row.group !== option.group)) return false;
    if (selectedPositions.length && !selectedPositions.includes(row.position)) return false;
    if (normalizedQuery && !`${row.name || ''} ${row.position || ''}`.toLowerCase().includes(normalizedQuery)) return false;
    const sample = rosterStatValue(row, row.group === 'hitting' ? 'pa' : 'ip');
    const minimum = row.group === 'hitting' ? Number(minBattingPa) : Number(minPitchingIp);
    return minimum === 0 || (sample != null && sample >= minimum);
  })
    .sort((a, b) => {
      const av = rosterStatValue(a, option.key), bv = rosterStatValue(b, option.key);
      if (av == null && bv == null) return a.name.localeCompare(b.name);
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' || typeof bv === 'string') {
        const comparison = String(av).localeCompare(String(bv), undefined, { sensitivity:'base' });
        return direction === 'asc' ? comparison : -comparison;
      }
      return direction === 'asc' ? av - bv : bv - av;
    });
}

export function buildHistoricalTaxTrendRows(results, seasons = [2024, 2025, 2026]) {
  const numericOrNull = value => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  return seasons.map((season, index) => {
    const record = Array.isArray(results) ? results[index] : null;
    return {
      season,
      taxPayroll: numericOrNull(record?.tax?.taxPayroll),
      estimatedTaxBill: numericOrNull(record?.tax?.estimatedTaxBill),
      taxThreshold: numericOrNull(record?.tax?.taxThreshold),
      sourceUrl: record?.sourceUrls?.tax || record?.tax?.sourceUrl || null,
    };
  });
}

export function normalizeMinorLeagueAffiliates(rows, parentTeamId) {
  const unique = new Map();
  for (const affiliate of Array.isArray(rows) ? rows : []) {
    const id = Number(affiliate?.id);
    const levelId = Number(affiliate?.levelId);
    const level = String(affiliate?.level || '');
    if (!Number.isFinite(id) || id === Number(parentTeamId) || levelId === 1 || /major league baseball/i.test(level)) continue;
    if (!unique.has(id)) unique.set(id, affiliate);
  }
  return [...unique.values()].sort((left, right) => {
    const levelOrder = Number(left.levelId || 999) - Number(right.levelId || 999);
    return levelOrder || String(left.name || '').localeCompare(String(right.name || ''));
  });
}

function OverviewPage({ rosterDefaults = { battingPa:0, pitchingIp:0 } }) {
  const [selTeam,setSelTeam]=useState(DEFAULT_OVERVIEW_TEAM_KEY);
  const [overviewView, setOverviewView] = useState('briefing');
  const [evaluationActiveLabel, setEvaluationActiveLabel] = useState('Overall');
  const evaluationPresentation = useMemo(() => getEvaluationPresentation(), []);
  const [affiliateLevel, setAffiliateLevel] = useState('11');
  const [affiliateId, setAffiliateId] = useState('');
  const [affiliates, setAffiliates] = useState([]);
  const [affiliatesState, setAffiliatesState] = useState('idle');
  const [affiliateControlsOpen, setAffiliateControlsOpen] = useState(false);
  const [affiliateLevelFilter, setAffiliateLevelFilter] = useState('all');
  const [affiliateOverview, setAffiliateOverview] = useState(null);
  const [affiliateOverviewState, setAffiliateOverviewState] = useState('idle');
  const [affiliateTab, setAffiliateTab] = useState('overview');
  const [affiliateStandings, setAffiliateStandings] = useState(null);
  const [affiliateStandingsSort, setAffiliateStandingsSort] = useState({ key:'pct', direction:'desc' });
  const [affiliateSchedule, setAffiliateSchedule] = useState(null);
  const [affiliateSavant, setAffiliateSavant] = useState(null);
  const [teamSavantData, setTeamSavantData] = useState(null);
  const [teamOaaData, setTeamOaaData] = useState(null);
  const [futureValueModalOpen, setFutureValueModalOpen] = useState(false);
  const [pendingAffiliate, setPendingAffiliate] = useState(null);
  const overviewRef = useRef(null);
  const [pdfExportState, setPdfExportState] = useState('idle');
  const [splitTab,setSplitTab]=useState('home');
  const [teamSplitRows, setTeamSplitRows] = useState([]);
  const [teamSplitsState, setTeamSplitsState] = useState('idle');
  const [arsenalTab,setArsenalTab]=useState('usage');
  const [todayGames,setTodayGames]=useState([]);
  const [todayGamesState, setTodayGamesState] = useState('loading');
  const [todayGameMetadata, setTodayGameMetadata] = useState({});
  const [liveTeamData,setLiveTeamData]=useState(() => readTeamAggregateCache(CURRENT_SEASON)?.data || null);
  const [liveTeamDataUpdatedAt,setLiveTeamDataUpdatedAt]=useState(() => readTeamAggregateCache(CURRENT_SEASON)?.updatedAt || null);
  const [liveTeamDataMode,setLiveTeamDataMode]=useState(() => readTeamAggregateCache(CURRENT_SEASON) ? 'cached' : 'loading');
  const [liveTeamPlayers,setLiveTeamPlayers]=useState(() => readTeamPlayersCache(TEAMS[DEFAULT_OVERVIEW_TEAM_KEY]?.id, CURRENT_SEASON)?.data || { hitting:[], pitching:[], recentByDays:{} });
  const [teamPlayersUpdatedAt,setTeamPlayersUpdatedAt]=useState(() => readTeamPlayersCache(TEAMS[DEFAULT_OVERVIEW_TEAM_KEY]?.id, CURRENT_SEASON)?.updatedAt || null);
  const [teamPlayersDataMode,setTeamPlayersDataMode]=useState(() => readTeamPlayersCache(TEAMS[DEFAULT_OVERVIEW_TEAM_KEY]?.id, CURRENT_SEASON) ? 'cached' : 'loading');
  const [hotStreakDays, setHotStreakDays] = useState(15);
  const [hotStreakRows, setHotStreakRows] = useState(() => {
    const cached = readTeamPlayersCache(TEAMS[DEFAULT_OVERVIEW_TEAM_KEY]?.id, CURRENT_SEASON)?.data;
    return cached?.recentByDays?.[15] || { hitting:[], pitching:[] };
  });
  const [hotStreakState, setHotStreakState] = useState(() => readTeamPlayersCache(TEAMS[DEFAULT_OVERVIEW_TEAM_KEY]?.id, CURRENT_SEASON)?.data?.recentByDays?.[15] ? 'cached' : 'loading');
  const [teamExitVelocityRows, setTeamExitVelocityRows] = useState([]);
  const [teamExitVelocitySource, setTeamExitVelocitySource] = useState('');
  const [teamExitVelocityState, setTeamExitVelocityState] = useState('idle');
  const [teamBattedBallData, setTeamBattedBallData] = useState(null);
  const [teamBattedBallRows, setTeamBattedBallRows] = useState([]);
  const [teamBattedBallAgainstRows, setTeamBattedBallAgainstRows] = useState([]);
  const [teamPitchArsenalData, setTeamPitchArsenalData] = useState(null);
  const [teamSavantSource, setTeamSavantSource] = useState('');
  const [teamSavantState, setTeamSavantState] = useState('idle');
  const [teamVenueMetadata, setTeamVenueMetadata] = useState(null);
  const [teamVenueState, setTeamVenueState] = useState('idle');
  const [liveTeamError,setLiveTeamError]=useState(false);
  const [mlbRetryToken, setMlbRetryToken] = useState(0);
  const [fangraphsRetryToken, setFangraphsRetryToken] = useState(0);
  const [savantRetryToken, setSavantRetryToken] = useState(0);
  const [rosterInsightsRetryToken, setRosterInsightsRetryToken] = useState(0);
  const [cacheHealth, setCacheHealth] = useState(null);
  useEffect(() => {
    const onProviderRetry = event => {
      const provider = event.detail?.provider;
      if (provider === 'mlb') setMlbRetryToken(token => token + 1);
      if (provider === 'fangraphs') setFangraphsRetryToken(token => token + 1);
      if (provider === 'savant') setSavantRetryToken(token => token + 1);
      if (provider === 'roster-insights') setRosterInsightsRetryToken(token => token + 1);
    };
    window.addEventListener('skip-provider-retry', onProviderRetry);
    return () => window.removeEventListener('skip-provider-retry', onProviderRetry);
  }, []);
  useEffect(() => {
    let alive = true;
    getCacheHealth()
      .then(data => { if (alive) setCacheHealth(data); })
      .catch(() => { if (alive) setCacheHealth(null); });
    return () => { alive = false; };
  }, []);
  const [teamModelData, setTeamModelData] = useState(null);
  const [teamModelState, setTeamModelState] = useState('idle');
  const [secondaryPlayoffOddsData, setSecondaryPlayoffOddsData] = useState(null);
  const [secondaryPlayoffOddsState, setSecondaryPlayoffOddsState] = useState('idle');
  const [calculatedIntelligence, setCalculatedIntelligence] = useState(null);
  const [calculatedIntelligenceState, setCalculatedIntelligenceState] = useState('idle');
  const [teamPlayersLoading, setTeamPlayersLoading] = useState(true);
  const [teamPlayersError, setTeamPlayersError] = useState(false);
  const [selectedRosterPositions, setSelectedRosterPositions] = useState([]);
  const [rosterSort, setRosterSort] = useState('ops');
  const [rosterSortDirection, setRosterSortDirection] = useState('desc');
  const [rosterPlayerQuery, setRosterPlayerQuery] = useState('');
  const [minBattingPa, setMinBattingPa] = useState(() => Number(rosterDefaults.battingPa) || 0);
  const [minPitchingIp, setMinPitchingIp] = useState(() => Number(rosterDefaults.pitchingIp) || 0);
  const [activeRosterPreset, setActiveRosterPreset] = useState(null);
  const [rosterQuickFilter, setRosterQuickFilter] = useState('all');
  const [taxTrendRows, setTaxTrendRows] = useState([]);
  const [taxTrendState, setTaxTrendState] = useState('loading');
  const [taxHistoryRange, setTaxHistoryRange] = useState(() => readCbtHistoryRange());
  const taxHistorySeasons = useMemo(() => buildCbtHistorySeasons(taxHistoryRange, CURRENT_SEASON), [taxHistoryRange]);
  useEffect(() => {
    setMinBattingPa(Number(rosterDefaults.battingPa) || 0);
    setMinPitchingIp(Number(rosterDefaults.pitchingIp) || 0);
  }, [rosterDefaults.battingPa, rosterDefaults.pitchingIp]);

  useEffect(() => {
    const onSelectAffiliate = e => {
      const detail = e.detail || {};
      const parentAbbr = String(detail.parentAbbr || '').toLowerCase();
      const foundKey = Object.keys(TEAMS).find(key => key === parentAbbr || TEAMS[key].abbr.toLowerCase() === parentAbbr);
      if (foundKey) {
        const parentTeam = TEAMS[foundKey];
        if (Number(detail.affiliateId) === Number(parentTeam.id) || Number(detail.levelId) === 1) {
          setPendingAffiliate(null);
          setAffiliateId('');
          setAffiliateLevel('11');
          setAffiliateLevelFilter('all');
          setAffiliateTab('overview');
          setAffiliateControlsOpen(false);
          setSelTeam(foundKey);
          return;
        }
        setSelTeam(foundKey);
        setPendingAffiliate({ id: String(detail.affiliateId || ''), levelId: String(detail.levelId || '11') });
        setAffiliateControlsOpen(true);
        setAffiliateLevelFilter(String(detail.levelId || 'all'));
        setOverviewView('roster');
      }
    };
    const onSelectTeam = e => {
      const abbr = e.detail?.abbr?.toLowerCase();
      if (abbr) {
        const foundKey = Object.keys(TEAMS).find(key => key.toLowerCase() === abbr || TEAMS[key].abbr.toLowerCase() === abbr);
        if (foundKey) {
          setPendingAffiliate(null);
          setAffiliateId('');
          setAffiliateLevel('11');
          setAffiliateTab('overview');
          setAffiliateControlsOpen(false);
          setAffiliateLevelFilter('all');
          setSelTeam(foundKey);
        }
      }
    };
    window.addEventListener('skip-select-team', onSelectTeam);
    window.addEventListener('skip-select-affiliate', onSelectAffiliate);
    return () => {
      window.removeEventListener('skip-select-team', onSelectTeam);
      window.removeEventListener('skip-select-affiliate', onSelectAffiliate);
    };
  }, []);
  const teamBase=TEAMS[selTeam];
  useEffect(() => {
    let alive = true;
    if (!affiliateControlsOpen) {
      setAffiliates([]);
      setAffiliatesState('idle');
      return () => { alive = false; };
    }
    setAffiliatesState('loading');
    setAffiliates([]);
    getTeamAffiliates(teamBase?.id).then(rows => {
      if (!alive) return;
      setAffiliates(normalizeMinorLeagueAffiliates(rows, teamBase?.id));
      setAffiliatesState('ready');
    }).catch(() => { if (alive) setAffiliatesState('error'); });
    return () => { alive = false; };
  }, [teamBase?.id, affiliateControlsOpen]);

  useEffect(() => {
    if (!pendingAffiliate?.id || !affiliateControlsOpen) return;
    const preferred = affiliates.find(row => String(row.id) === String(pendingAffiliate.id));
    if (preferred) {
      setAffiliateLevel(String(preferred.levelId));
      setAffiliateId(String(preferred.id));
      setAffiliateLevelFilter(String(preferred.levelId));
      setAffiliateTab('overview');
      setPendingAffiliate(null);
    } else if (affiliatesState === 'ready' || affiliatesState === 'error') {
      setPendingAffiliate(null);
    }
  }, [pendingAffiliate?.id, affiliateControlsOpen, affiliates, affiliatesState]);

  const affiliateLevelOptions = useMemo(() => Object.values(
    affiliates.reduce((levels, affiliate) => {
      const id = String(affiliate.levelId || 'unknown');
      if (!levels[id]) levels[id] = { id, label: affiliate.level || 'Other' };
      return levels;
    }, {})
  ).sort((left, right) => Number(right.id) - Number(left.id)), [affiliates]);
  const visibleAffiliates = useMemo(
    () => affiliateLevelFilter === 'all'
      ? affiliates
      : affiliates.filter(affiliate => String(affiliate.levelId) === affiliateLevelFilter),
    [affiliates, affiliateLevelFilter]
  );
  const sortedAffiliateStandings = useMemo(() => {
    const rows = Array.isArray(affiliateStandings?.rows) ? affiliateStandings.rows.map((row, index) => ({ ...row, _index:index })) : [];
    const numeric = value => Number.isFinite(Number(value)) ? Number(value) : null;
    const gamesBack = value => value === '-' || value === '–' ? 0 : numeric(value);
    const compareNumbers = (left, right, direction) => {
      if (left == null && right == null) return 0;
      if (left == null) return 1;
      if (right == null) return -1;
      return direction === 'asc' ? left - right : right - left;
    };
    return rows.sort((left, right) => {
      let comparison = 0;
      if (affiliateStandingsSort.key === 'record') {
        comparison = compareNumbers(numeric(left.w), numeric(right.w), affiliateStandingsSort.direction);
        if (comparison === 0) comparison = compareNumbers(numeric(left.l), numeric(right.l), affiliateStandingsSort.direction === 'asc' ? 'desc' : 'asc');
      } else if (affiliateStandingsSort.key === 'gb') {
        comparison = compareNumbers(gamesBack(left.gb), gamesBack(right.gb), affiliateStandingsSort.direction);
      } else if (affiliateStandingsSort.key === 'name') {
        comparison = String(left.name || '').localeCompare(String(right.name || '')) * (affiliateStandingsSort.direction === 'asc' ? 1 : -1);
      } else {
        comparison = compareNumbers(numeric(left.pct), numeric(right.pct), affiliateStandingsSort.direction);
      }
      return comparison || String(left.name || '').localeCompare(String(right.name || '')) || left._index - right._index;
    });
  }, [affiliateStandings?.rows, affiliateStandingsSort]);

  useEffect(() => {
    let alive = true;
    if (!affiliateId) { setAffiliateOverview(null); setAffiliateOverviewState('idle'); return () => { alive = false; }; }
    const selectedAffiliate = affiliates.find(row => String(row.id) === String(affiliateId));
    setAffiliateOverviewState(selectedAffiliate ? 'identity-ready' : 'loading');
    if (selectedAffiliate) {
      setAffiliateOverview({
        id: Number(affiliateId),
        name: selectedAffiliate.name,
        level: selectedAffiliate.level,
        league: selectedAffiliate.league,
        hitting: {},
        pitching: {},
      });
    }
    getMinorLeagueTeamOverview(Number(affiliateId), Number(affiliateLevel), CURRENT_SEASON).then(data => {
      if (!alive) return;
      if (data) {
        setAffiliateOverview(data);
        setAffiliateOverviewState('ready');
      } else {
        setAffiliateOverviewState('error');
      }
    }).catch(() => { if (alive) setAffiliateOverviewState('error'); });
    return () => { alive = false; };
  }, [affiliateId, affiliateLevel]);

  useEffect(() => {
    let alive = true;
    if (!affiliateId || affiliateTab !== 'standings') {
      if (!affiliateId) setAffiliateStandings(null);
      return () => { alive = false; };
    }
    setAffiliateStandings({ status:'loading', rows:[] });
    getMinorLeagueTeamStandings(Number(affiliateId), Number(affiliateLevel), CURRENT_SEASON).then(standings => {
      if (alive) setAffiliateStandings(standings);
    }).catch(() => { if (alive) setAffiliateStandings({ status:'upstream-unavailable', rows:[] }); });
    return () => { alive = false; };
  }, [affiliateId, affiliateLevel, affiliateTab]);

  useEffect(() => {
    let alive = true;
    if (!affiliateId || affiliateTab !== 'schedule') {
      if (!affiliateId) setAffiliateSchedule(null);
      return () => { alive = false; };
    }
    setAffiliateSchedule({ status:'loading', games:[] });
    getMinorLeagueTeamSchedule(Number(affiliateId), Number(affiliateLevel), CURRENT_SEASON, 14).then(schedule => {
      if (alive) setAffiliateSchedule(schedule);
    }).catch(() => { if (alive) setAffiliateSchedule({ status:'upstream-unavailable', games:[] }); });
    return () => { alive = false; };
  }, [affiliateId, affiliateLevel, affiliateTab]);

  useEffect(() => {
    let alive = true;
    if (!affiliateId) { setAffiliateSavant(null); return () => { alive = false; }; }
    const selectedAffiliate = affiliates.find(row => String(row.id) === String(affiliateId));
    const affiliateAbbr = String(selectedAffiliate?.abbr || '').trim();
    setAffiliateSavant({ status:'loading' });
    if (!affiliateAbbr) {
      setAffiliateSavant({ status:'source-gap', source:'Baseball Savant', sampleSize:0, retrievedAt:new Date().toISOString() });
    } else {
      const cached = readTeamSavantSummaryCache(affiliateAbbr, CURRENT_SEASON);
      if (cached?.data) setAffiliateSavant(cached.data);
      if (shouldRefreshDailyCache(cached)) {
        getTeamSavantMetrics(affiliateAbbr, CURRENT_SEASON).then(savant => {
          saveTeamSavantSummaryCache(affiliateAbbr, CURRENT_SEASON, savant);
          if (alive) setAffiliateSavant(savant);
        }).catch(() => {
          if (alive && !cached?.data) setAffiliateSavant({ status:'upstream-unavailable', source:'Baseball Savant' });
        });
      }
    }
    return () => { alive = false; };
  }, [affiliateId, affiliateLevel, affiliates]);

  const calculatedMetrics = calculatedIntelligence?.metrics || {};
  const calculatedStandingMetric = value => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
  const calculatedStandingFallback = useMemo(() => ({
    w: calculatedStandingMetric(calculatedMetrics.wins),
    l: calculatedStandingMetric(calculatedMetrics.losses),
    pct: calculatedStandingMetric(calculatedMetrics.winPct),
    rs: calculatedStandingMetric(calculatedMetrics.runsScored),
    ra: calculatedStandingMetric(calculatedMetrics.runsAllowed),
    diff: calculatedStandingMetric(calculatedMetrics.runDifferential),
  }), [calculatedIntelligence]);
  const team=useMemo(() => {
    const live = liveTeamData?.byId?.[teamBase?.id] || liveTeamData?.byAbbr?.[teamBase?.abbr];
    const hitting = live?.hitting || {};
    const pitching = live?.pitching || {};
    const stat = (source, key) => source?.[key] == null || source?.[key] === '' ? null : (Number.isFinite(Number(source[key])) ? Number(source[key]) : null);
    return {
      ...teamBase,
      ...(live?.standings || {}),
      w: stat(live?.standings, 'w') ?? calculatedStandingFallback.w, l: stat(live?.standings, 'l') ?? calculatedStandingFallback.l, pct: stat(live?.standings, 'pct') ?? calculatedStandingFallback.pct,
      rs: stat(live?.standings, 'rs') ?? calculatedStandingFallback.rs, ra: stat(live?.standings, 'ra') ?? calculatedStandingFallback.ra, diff: stat(live?.standings, 'diff') ?? calculatedStandingFallback.diff,
      ops: stat(hitting, 'ops'), obp: stat(hitting, 'obp'), slg: stat(hitting, 'slg'), avg: stat(hitting, 'avg'),
      hr: stat(hitting, 'homeRuns'), sb: stat(hitting, 'stolenBases'),
      era: stat(pitching, 'era'), whip: stat(pitching, 'whip'), k: stat(pitching, 'strikeOuts'),
      war: null, wrcPlus: null, fip: null, drs: null, bsr: null,
    };
  }, [liveTeamData, teamBase, calculatedStandingFallback]);
  useEffect(() => {
    setEvaluationActiveLabel(null);
  }, [team?.abbr]);
  const liveStandings = liveTeamData?.byId?.[teamBase?.id]?.standings || liveTeamData?.byAbbr?.[teamBase?.abbr]?.standings || null;
  const headlineUsesCalculatedStandings = Boolean(calculatedIntelligence && ['w', 'l', 'pct', 'rs', 'ra', 'diff'].some(key => (liveStandings?.[key] == null || liveStandings?.[key] === '') && calculatedStandingFallback[key] != null));
  // Team-brand accent used for decorative/structural elements (panel accent
  // strips, chart lines/bars, badges) throughout this page. Deliberately not
  // used for small body text — some team colors (e.g. the Padres' near-black
  // brown) would fail contrast as text against a themed background, but read
  // fine as a bar fill or a 3px accent strip.
  const teamAccent = getTeamAccent(team);
  const teamRollups = useMemo(() => deriveTeamPlayerRollups(liveTeamPlayers), [liveTeamPlayers]);
  const rosterInsights = useMemo(() => buildRosterInsights(team, liveTeamPlayers), [team, liveTeamPlayers]);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiInsightsState, setAiInsightsState] = useState('idle');
  const aiInsightsRequestKeyRef = useRef(null);
  const aiInsightsTeamRef = useRef(teamBase?.abbr || '');
  useEffect(() => {
    const nextTeam = teamBase?.abbr || '';
    if (!shouldResetRosterInsightsState(aiInsightsTeamRef.current, nextTeam)) return;
    aiInsightsTeamRef.current = nextTeam;
    setAiInsights(null);
    setAiInsightsState('idle');
    aiInsightsRequestKeyRef.current = null;
  }, [teamBase?.abbr]);
  const [verifiedTrends, setVerifiedTrends] = useState({});
  const trendSnapshotScope = `${selTeam}:${CURRENT_SEASON}`;
  const verifiedTrendMetrics = useMemo(() => {
    const verified = liveTeamDataMode === 'live' || liveTeamDataMode === 'cached';
    const source = liveTeamDataMode === 'live' ? 'MLB Stats API · live verified aggregate' : 'MLB Stats API · cached verified aggregate';
    return {
      ops: { label:'Team OPS', value:team.ops, status:verified ? 'verified' : 'unavailable', source },
      era: { label:'Team ERA', value:team.era, status:verified ? 'verified' : 'unavailable', source },
      whip: { label:'WHIP', value:team.whip, status:verified ? 'verified' : 'unavailable', source },
      runDiff: { label:'Run differential', value:team.rs != null && team.ra != null ? team.rs - team.ra : null, status:verified ? 'verified' : 'unavailable', source },
    };
  }, [team, liveTeamDataMode]);
  useEffect(() => {
    if (liveTeamDataMode !== 'live' && liveTeamDataMode !== 'cached') {
      setVerifiedTrends({});
      return;
    }
    const previous = readVerifiedSnapshot(trendSnapshotScope);
    const derived = deriveVerifiedTrends(verifiedTrendMetrics, previous);
    setVerifiedTrends(Object.fromEntries(Object.entries(derived).map(([key, value]) => [key, { ...value, displayDelta: formatTrendDelta(value.delta, key === 'ops' ? 3 : 2) }])));
    captureVerifiedSnapshot(trendSnapshotScope, verifiedTrendMetrics, liveTeamDataUpdatedAt || Date.now());
  }, [trendSnapshotScope, verifiedTrendMetrics, liveTeamDataMode, liveTeamDataUpdatedAt]);

  useEffect(() => {
    let alive = true;
    setTodayGameMetadata({});
    const games = todayGames.slice(0, 6).filter(game => /final|progress|live/i.test(String(game.status || '')) || game.inning);
    if (games.length) {
      Promise.all(games.map(game => getGameFeedMetadata(game).then(metadata => [game.gamePk, metadata]).catch(() => [game.gamePk, null]))).then(entries => {
        if (alive) setTodayGameMetadata(Object.fromEntries(entries));
      });
    }
    return () => { alive = false; };
  }, [todayGames]);
  // Today's league schedule is global, not team-specific. Keeping it outside
  // the selected-team lifecycle avoids even cached re-reads whenever a scout
  // changes teams, while an explicit MLB retry can still refresh it.
  useEffect(() => {
    let alive = true;
    setTodayGamesState('loading');
    getTodaysGames().then(games => {
      if (!alive) return;
      const visibleGames = (Array.isArray(games) ? games : []).slice(0, 8);
      setTodayGames(visibleGames);
      setTodayGamesState(visibleGames.length ? 'ready' : 'empty');
    }).catch(() => {
      if (!alive) return;
      setTodayGames([]);
      setTodayGamesState('unavailable');
    });
    return () => { alive = false; };
  }, [mlbRetryToken]);
  useEffect(() => {
    if (overviewView !== 'operations') return undefined;
    let alive = true;
    setTeamVenueState('loading');
    setTeamVenueMetadata(null);
    getTeamVenueMetadata(teamBase?.id).then(data => {
      if (!alive) return;
      setTeamVenueMetadata(data);
      setTeamVenueState(data?.status === 'live' || data?.status === 'cached' ? 'ready' : data?.status === 'source-gap' ? 'source-gap' : 'unavailable');
    }).catch(() => {
      if (!alive) return;
      setTeamVenueMetadata({ status: 'upstream-unavailable', source: 'MLB Stats API', venue: null });
      setTeamVenueState('unavailable');
    });
    return () => { alive = false; };
  }, [overviewView, teamBase?.id, mlbRetryToken]);
  useEffect(() => {
    if (overviewView !== 'operations') return undefined;
    let alive = true;
    setTeamSplitRows([]);
    setTeamSplitsState('loading');
    getTeamScheduleSplits(teamBase?.id, CURRENT_SEASON).then(rows => {
      if (!alive) return;
      setTeamSplitRows(Array.isArray(rows) ? rows : []);
      setTeamSplitsState('ready');
    }).catch(() => {
      if (!alive) return;
      setTeamSplitRows([]);
      setTeamSplitsState('unavailable');
    });
    return () => { alive = false; };
  }, [overviewView, teamBase?.id, mlbRetryToken]);
  const rosterSavantKey = useMemo(() => buildRosterSavantKey(liveTeamPlayers), [liveTeamPlayers]);
  useEffect(() => {
    if (overviewView !== 'performance') return undefined;
    let alive = true;
    const cached = readTeamSavantCache(teamBase?.abbr, CURRENT_SEASON);
    const applySnapshot = (snapshot, source) => {
      const exitRows = snapshot?.exitVelocityRows || [];
      const batted = snapshot?.battedBallRows || [];
      const pitches = snapshot?.pitchRows || [];
      setTeamExitVelocityRows(exitRows);
      setTeamExitVelocitySource(source);
      setTeamExitVelocityState(exitRows.length ? 'ready' : 'unavailable');
      setTeamBattedBallRows(batted);
      setTeamBattedBallData(buildBattedBallProfile(batted));
      setTeamPitchArsenalData(buildPitchArsenalRows(pitches));
      setTeamSavantSource(source);
      setTeamSavantState(exitRows.length || batted.length || pitches.length ? 'ready' : 'unavailable');
    };
    if (cached?.data) applySnapshot(cached.data, 'Baseball Savant Statcast Search · cached verified roster rollup');
    if (cached && !shouldRefreshDailyCache(cached)) {
      return () => { alive = false; };
    }
    setTeamExitVelocityRows([]);
    setTeamExitVelocitySource('');
    setTeamExitVelocityState('loading');
    setTeamBattedBallData(null);
    setTeamBattedBallRows([]);
    setTeamBattedBallAgainstRows([]);
    setTeamPitchArsenalData(null);
    setTeamSavantSource('');
    setTeamSavantState('loading');
    const hitters = (liveTeamPlayers.hitting || [])
      .sort((a, b) => (Number(b?.stat?.plateAppearances || b?.stat?.pa) || 0) - (Number(a?.stat?.plateAppearances || a?.stat?.pa) || 0))
      .slice(0, 12);
    const pitchers = (liveTeamPlayers.pitching || [])
      .sort((a, b) => (Number(b?.stat?.inningsPitched || b?.stat?.ip) || 0) - (Number(a?.stat?.inningsPitched || a?.stat?.ip) || 0))
      .slice(0, 12);
    resolveTeamSavantSnapshot({
      teamAbbr: teamBase?.abbr,
      season: CURRENT_SEASON,
      cached,
      hitters,
      pitchers,
      getTeamBattedBallsFn: getTeamBattedBalls,
      saveCacheFn: saveTeamSavantCache,
    }).then(({ snapshot, source }) => {
      if (!alive) return;
      applySnapshot(snapshot, source);
    }).catch(() => {
      if (!alive) return;
      applySnapshot({ exitVelocityRows: [], battedBallRows: [], pitchRows: [] }, '');
    });
    return () => { alive = false; };
  }, [overviewView, teamBase?.abbr, savantRetryToken, rosterSavantKey]);
  useEffect(() => {
    if (overviewView !== 'performance') return undefined;
    let alive = true;
    const cached = readTeamSavantAgainstCache(teamBase?.abbr, CURRENT_SEASON);
    const cachedRows = Array.isArray(cached?.data) ? cached.data : [];
    setTeamBattedBallAgainstRows(cachedRows);
    if (cached && !shouldRefreshDailyCache(cached)) {
      return () => { alive = false; };
    }
    getTeamBattedBallsAgainst(teamBase?.abbr, CURRENT_SEASON).then(rows => {
      const normalized = Array.isArray(rows) ? rows : [];
      saveTeamSavantAgainstCache(teamBase?.abbr, CURRENT_SEASON, normalized);
      if (alive) setTeamBattedBallAgainstRows(normalized);
    }).catch(() => { if (alive && !cached) setTeamBattedBallAgainstRows([]); });
    return () => { alive = false; };
  }, [overviewView, teamBase?.abbr, savantRetryToken]);
  useEffect(() => {
    if (overviewView !== 'performance') return undefined;
    let alive = true;
    setTeamModelState('loading');
    const divisionTeamNames = Object.values(TEAMS).filter(t => t.div === teamBase?.div).map(t => t.name);
    Promise.all([
      getTeamModelSources(teamBase?.abbr, CURRENT_SEASON),
      getTeamAggregateWar(teamBase?.name, divisionTeamNames, CURRENT_SEASON),
    ]).then(([baseModel, aggregate]) => {
      if (!alive) return;
      let data = baseModel;
      if (aggregate && alive) {
        if (data?.teamWar == null && aggregate.teamWar != null) {
          data = { ...data, found: true, teamWar: aggregate.teamWar, source: `${data.source || 'FanGraphs'} + ${aggregate.source}`, retrievedAt: aggregate.retrievedAt || data.retrievedAt, freshness: aggregate.freshness, statuses: { ...(data.statuses || {}), teamWar: aggregate.status } };
        }
        if (aggregate.divisionAverageWAR != null) {
          data = { ...data, divisionAverageWAR: aggregate.divisionAverageWAR };
        }
      }
      if (!data?.divisionAverageWAR && aggregate?.divisionAverageWAR != null) {
        data = { ...data, divisionAverageWAR: aggregate.divisionAverageWAR };
      }
      if (aggregate?.divisionTeams?.length) {
        data = { ...data, divisionTeams: aggregate.divisionTeams };
      }
      if (!alive) return;
      setTeamModelData(data);
      setTeamModelState(data?.found ? 'ready' : 'source-gap');
    }).catch(() => { if (alive) setTeamModelState('error'); });
    return () => { alive = false; };
  }, [overviewView, teamBase?.abbr, teamBase?.name, teamBase?.div, fangraphsRetryToken]);
  useEffect(() => {
    let alive = true;
    setCalculatedIntelligence(null);
    setCalculatedIntelligenceState(teamBase?.id ? 'loading' : 'idle');
    getTeamCalculatedIntelligence(teamBase?.id, CURRENT_SEASON).then(data => {
      if (!alive) return;
      setCalculatedIntelligence(data);
      setCalculatedIntelligenceState(data ? 'ready' : 'unavailable');
    }).catch(() => {
      if (alive) setCalculatedIntelligenceState('unavailable');
    });
    return () => { alive = false; };
  }, [teamBase?.id, mlbRetryToken]);
  useEffect(() => {
    let alive = true;
    setSecondaryPlayoffOddsData(null);
    setSecondaryPlayoffOddsState(teamBase?.abbr ? 'loading' : 'idle');
    getSecondaryPlayoffOdds(teamBase?.abbr).then(secondary => {
      if (!alive) return;
      setSecondaryPlayoffOddsData(secondary);
      setSecondaryPlayoffOddsState(secondary?.found ? 'ready' : 'unavailable');
    }).catch(() => {
      if (!alive) return;
      setSecondaryPlayoffOddsData(null);
      setSecondaryPlayoffOddsState('unavailable');
    });
    return () => { alive = false; };
  }, [teamBase?.abbr]);

  useEffect(() => {
    if (overviewView !== 'performance') return undefined;
    let alive = true;
    const cached = readTeamSavantSummaryCache(teamBase?.abbr, CURRENT_SEASON);
    setTeamSavantData(cached?.data || null);
    if (cached && !shouldRefreshDailyCache(cached)) {
      return () => { alive = false; };
    }
    getTeamSavantMetrics(teamBase?.abbr, CURRENT_SEASON).then(data => {
      saveTeamSavantSummaryCache(teamBase?.abbr, CURRENT_SEASON, data);
      if (alive) setTeamSavantData(data);
    }).catch(() => {
      if (alive && !cached?.data) setTeamSavantData({ status:'upstream-unavailable', source:'Baseball Savant', retrievedAt:new Date().toISOString() });
    });
    return () => { alive = false; };
  }, [overviewView, teamBase?.abbr]);

  useEffect(() => {
    if (overviewView !== 'performance' && evaluationActiveLabel !== 'Defense') return undefined;
    let alive = true;
    setTeamOaaData(null);
    getTeamSavantOaa(teamBase?.abbr, teamBase?.name, CURRENT_SEASON).then(data => {
      if (alive) setTeamOaaData(data);
    }).catch(() => {
      if (alive) setTeamOaaData({ status:'upstream-unavailable', source:'Baseball Savant Statcast OAA leaderboard', retrievedAt:new Date().toISOString(), oaa:null, playerCount:0, playerRows:[] });
    });
    return () => { alive = false; };
  }, [overviewView, evaluationActiveLabel, teamBase?.abbr, teamBase?.name, savantRetryToken]);

  const rosterInsightKey = useMemo(() => JSON.stringify({
    team: { name:team.name, abbr:team.abbr, w:team.w, l:team.l, pct:team.pct, rs:team.rs, ra:team.ra, ops:team.ops, hr:team.hr, era:team.era, whip:team.whip, k:team.k, sb:team.sb },
    roster: { hitting:liveTeamPlayers.hitting.slice(0, 12), pitching:liveTeamPlayers.pitching.slice(0, 12) },
  }), [team.name, team.abbr, team.w, team.l, team.pct, team.rs, team.ra, team.ops, team.hr, team.era, team.whip, team.k, team.sb, liveTeamPlayers]);

  useEffect(() => {
    if (overviewView !== 'roster') return undefined;
    const requestKey = `${teamBase?.abbr || ''}:${rosterInsightsRetryToken}`;
    if (!shouldStartRosterInsightsRequest({
      hasLiveData: Boolean(liveTeamData),
      hasInsights: Boolean(aiInsights),
      inFlightKey: aiInsightsRequestKeyRef.current,
      requestKey,
      hitterCount: liveTeamPlayers.hitting?.length || 0,
      pitcherCount: liveTeamPlayers.pitching?.length || 0,
    })) return;
    let alive = true;
    aiInsightsRequestKeyRef.current = requestKey;
    const input = {
      team: {
        name: team.name, abbr: team.abbr, w: team.w, l: team.l, pct: team.pct,
        rs: team.rs, ra: team.ra, ops: team.ops, hr: team.hr, era: team.era,
        whip: team.whip, k: team.k, sb: team.sb,
      },
      roster: {
        hitting: liveTeamPlayers.hitting.slice(0, 12),
        pitching: liveTeamPlayers.pitching.slice(0, 12),
      },
    };
    setAiInsightsState('loading');
    const controller = new AbortController();
    fetch(apiUrl('/api/trpc/ai.rosterInsights?batch=1'), {
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify({0:{json:input}}),
      signal:controller.signal,
    }).then(response => response.json().then(payload => ({ ok:response.ok, payload })))
      .then(({ ok, payload }) => {
        const data = payload?.[0]?.result?.data?.json;
        if (!ok || !data) throw new Error('AI insights unavailable');
        if (alive) { setAiInsights(data); setAiInsightsState('ready'); }
      }).catch(error => { if (alive && error?.name !== 'AbortError') setAiInsightsState('error'); });
    return () => { alive = false; controller.abort(); };
  }, [overviewView, liveTeamData, rosterInsightKey, rosterInsightsRetryToken, liveTeamPlayers.hitting?.length, liveTeamPlayers.pitching?.length]);
  const displayedInsights = aiInsights || rosterInsights;
  const finiteMetric = value => value == null || value === '' ? null : (Number.isFinite(Number(value)) ? Number(value) : null);
  const providerPlayoffOdds = resolveVerifiedPlayoffOdds(teamModelData?.playoffOdds);
  const hasProviderPlayoffOdds = providerPlayoffOdds != null;
  const secondaryPlayoffOddsDisplay = secondaryPlayoffOddsData?.found ? secondaryPlayoffOddsData.playoffOddsDisplay : null;
  const hasSecondaryPlayoffOdds = Boolean(secondaryPlayoffOddsDisplay);
  const playoffOddsValue = hasProviderPlayoffOdds
    ? `${providerPlayoffOdds.toFixed(1)}%`
    : hasSecondaryPlayoffOdds ? secondaryPlayoffOddsDisplay : 'Unavailable';
  const playoffOddsSource = hasProviderPlayoffOdds ? 'FanGraphs' : hasSecondaryPlayoffOdds ? 'PlayoffStatus · secondary' : 'Provider unavailable';
  const playoffOddsVerifiedAt = hasProviderPlayoffOdds
    ? teamModelData?.providerUpdatedAt || teamModelData?.retrievedAt
    : hasSecondaryPlayoffOdds ? secondaryPlayoffOddsData?.lastVerifiedAt || secondaryPlayoffOddsData?.retrievedAt : null;
  const playoffOddsVerificationLabel = hasProviderPlayoffOdds
    ? `FanGraphs playoff odds · last verified ${formatVerifiedTimestamp(playoffOddsVerifiedAt)}${teamModelData?.providerUpdatedText ? ` · provider updated ${teamModelData.providerUpdatedText}` : ''}`
    : hasSecondaryPlayoffOdds
      ? `PlayoffStatus secondary odds · last verified ${formatVerifiedTimestamp(playoffOddsVerifiedAt)}`
      : secondaryPlayoffOddsState === 'loading' ? 'Checking secondary postseason probability source…' : 'No verified postseason probability source is currently available.';
  const providerTeamWar = finiteMetric(teamModelData?.teamWar);
  const calculatedWarProxy = finiteMetric(calculatedMetrics.calculatedWarProxy);
  const hasProviderTeamWar = providerTeamWar != null;
  const hasCalculatedWarProxy = calculatedWarProxy != null;
  const teamWarIsCalculated = !hasProviderTeamWar && hasCalculatedWarProxy;
  const teamWarValue = hasProviderTeamWar ? providerTeamWar.toFixed(1) : hasCalculatedWarProxy ? calculatedWarProxy.toFixed(1) : 'Unavailable';
  const teamWarHeadlineLabel = teamWarIsCalculated ? 'WAR Proxy' : 'Team WAR';
  const teamWarHeadlineTitle = teamWarIsCalculated
    ? 'Calculated from verified MLB standings: Pythagorean expected 162-game wins minus a fixed 48-win replacement baseline. This is not FanGraphs Team WAR.'
    : teamWarValue === 'Unavailable' ? 'No verified provider response or safe calculated proxy is currently available.' : undefined;
  const divisionWarData = useMemo(() => (Array.isArray(teamModelData?.divisionTeams) ? teamModelData.divisionTeams : [])
    .filter(row => row?.team && row?.totalWAR != null)
    .map(row => ({
      team: Object.values(TEAMS).find(item => String(item.name).toLowerCase() === String(row.team).toLowerCase())?.abbr || String(row.team).slice(0, 4).toUpperCase(),
      teamName: row.team,
      totalWAR: Number(row.totalWAR),
      offensiveWAR: row.offensiveWAR == null ? null : Number(row.offensiveWAR),
      defensiveWAR: row.defensiveWAR == null ? null : Number(row.defensiveWAR),
      pitchingWAR: row.pitchingWAR == null ? null : Number(row.pitchingWAR),
    }))
    .sort((a, b) => b.totalWAR - a.totalWAR), [teamModelData?.divisionTeams]);
  const formatDivisionWar = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(1)}`;
  const fanGraphsHealthStatus = teamModelState === 'loading'
    ? 'loading'
    : teamModelData?.providerBlocked
      ? 'provider-blocked'
      : ['stale-cached', 'stale-local'].includes(teamModelData?.freshness)
      ? 'cached-fallback'
      : teamModelData?.freshness === 'cached'
        ? 'cached'
        : teamModelData?.found || teamModelData?.statuses?.teamWar === 'live' || teamModelData?.statuses?.playoffOdds === 'live'
          ? 'verified'
          : teamModelState === 'source-gap' ? 'coverage-gap' : 'unavailable';
  const projectedWinsValue = teamModelData?.advancedMetrics?.projectedWins ?? calculatedMetrics.projectedWins;
  const projectedLossesValue = teamModelData?.advancedMetrics?.projectedLosses ?? calculatedMetrics.projectedLosses;
  const pythagoreanWinsValue = finiteMetric(calculatedMetrics.pythagoreanProjectedWins);
  const pythagoreanLossesValue = finiteMetric(calculatedMetrics.pythagoreanProjectedLosses);
  const calculatedModelSource = teamModelData?.advancedMetrics?.projectedWins != null ? 'FanGraphs' : projectedWinsValue != null ? 'MLB Stats API · calculated' : 'FanGraphs';
  const calculatedModelStatus = teamModelData?.advancedMetrics?.projectedWins != null ? fanGraphsHealthStatus : projectedWinsValue != null ? 'calculated' : fanGraphsHealthStatus;
  const pythagoreanModelStatus = pythagoreanWinsValue != null && pythagoreanLossesValue != null ? 'calculated' : calculatedIntelligenceState === 'loading' ? 'loading' : 'unavailable';
  const calculationProviderStatus = calculatedIntelligenceState === 'loading' ? 'loading' : calculatedIntelligence ? (calculatedIntelligence.freshness === 'stale-cached' ? 'cached-fallback' : 'calculated') : 'unavailable';
  const fanGraphsMetricStatus = value => resolveMetricProviderStatus(value, fanGraphsHealthStatus);
  const fanGraphsMetricTitle = (label, value) => value == null
    ? `FanGraphs did not return a verified ${label} value; the provider status badge does not verify this missing metric.`
    : `FanGraphs ${label} source health`;
  const standingsContext = useMemo(() => buildPostseasonStandingsContext(liveTeamData, team), [liveTeamData, team]);
  const affiliateSavantHealthStatus = affiliateSavant?.status === 'loading'
    ? 'loading'
    : affiliateSavant?.freshness === 'stale-cached'
      ? 'cached-fallback'
      : affiliateSavant?.freshness === 'cached'
        ? 'cached'
        : affiliateSavant?.status === 'live' || affiliateSavant?.status === 'ready'
          ? 'verified'
          : affiliateSavant?.status ? 'unavailable' : 'loading';
  const modelFreshness = teamModelData?.providerBlocked
    ? 'provider blocked by upstream protection'
    : teamModelData?.freshness === 'stale-local'
      ? `local cached ${freshnessLabel(teamModelData?.retrievedAt)}`
      : freshnessLabel(teamModelData?.retrievedAt);
  const rosterPositions = useMemo(() => [...new Set([
    ...(liveTeamPlayers.hitting || []).map(row => row.position),
    ...(liveTeamPlayers.pitching || []).map(row => row.position),
  ].filter(Boolean))].sort(), [liveTeamPlayers]);
  const rosterSortOption = ROSTER_SORT_OPTIONS.find(item => item.key === rosterSort) || ROSTER_SORT_OPTIONS[0];
  const activeMinimum = rosterSortOption.group === 'hitting' ? minBattingPa : rosterSortOption.group === 'pitching' ? minPitchingIp : 0;
  const rosterHasFilters = Boolean(rosterPlayerQuery || selectedRosterPositions.length || minBattingPa || minPitchingIp || rosterQuickFilter !== 'all' || activeRosterPreset);
  const filteredRosterRows = useMemo(() => buildRosterRows(liveTeamPlayers, selectedRosterPositions, rosterSort, minBattingPa, minPitchingIp, rosterSortDirection, rosterPlayerQuery), [liveTeamPlayers, selectedRosterPositions, rosterSort, minBattingPa, minPitchingIp, rosterSortDirection, rosterPlayerQuery]);
  const applyRosterPreset = preset => {
    setRosterQuickFilter(null);
    setSelectedRosterPositions(preset.positions);
    setRosterSort(preset.sort);
    setRosterSortDirection(ROSTER_SORT_OPTIONS.find(option => option.key === preset.sort)?.direction || 'desc');
    setMinBattingPa(preset.minBattingPa);
    setMinPitchingIp(preset.minPitchingIp);
    setActiveRosterPreset(preset.id);
  };
  const applyRosterQuickFilter = filter => {
    setRosterQuickFilter(filter.id);
    setActiveRosterPreset(null);
    setSelectedRosterPositions(filter.positions);
    setRosterSort(filter.sort);
    setRosterSortDirection(ROSTER_SORT_OPTIONS.find(option => option.key === filter.sort)?.direction || 'desc');
    setMinBattingPa(filter.minBattingPa);
    setMinPitchingIp(filter.minPitchingIp);
  };

  useEffect(()=>{
    let alive=true;
    const cachedAggregate = readTeamAggregateCache(CURRENT_SEASON);
    setLiveTeamData(cachedAggregate?.data || null);
    setLiveTeamDataUpdatedAt(cachedAggregate?.updatedAt || null);
    setLiveTeamDataMode(cachedAggregate ? 'cached' : 'loading');
    const cachedPlayers = readTeamPlayersCache(teamBase.id, CURRENT_SEASON);
    setLiveTeamPlayers(cachedPlayers?.data || { hitting:[], pitching:[], recentByDays:{} });
    setTeamPlayersUpdatedAt(cachedPlayers?.updatedAt || null);
    setTeamPlayersDataMode(cachedPlayers ? 'cached' : 'loading');
    setLiveTeamError(false);
    setTeamPlayersLoading(true);
    setTeamPlayersError(false);

    const aggregateFresh = Boolean(cachedAggregate?.data?.byAbbr && Date.now() - Number(cachedAggregate.updatedAt || 0) < 5 * 60 * 1000 && mlbRetryToken === 0);
    const playersFresh = Boolean(cachedPlayers?.data && Date.now() - Number(cachedPlayers.updatedAt || 0) < 5 * 60 * 1000 && mlbRetryToken === 0);

    // Aggregate standings and team totals are the critical Overview path. They
    // must render independently of the slower per-player leaderboard calls,
    // otherwise one delayed pitching request leaves every visible team card on
    // an em dash even when the authoritative aggregate responses succeeded.
    let feedTimeout = null;
    if (!aggregateFresh) {
      feedTimeout = window.setTimeout(() => {
        if (alive && !liveTeamData) setLiveTeamError(true);
      }, 12000);
      const aggregateResults = { standings: null, hitting: null, pitching: null };
      const commitAggregates = () => {
        if (!alive) return;
        const byAbbr = {};
        const byId = {};
        const std = aggregateResults.standings;
        const hitting = aggregateResults.hitting;
        const pitching = aggregateResults.pitching;
        if (std?.status === 'fulfilled') {
          Object.values(std.value).flat().forEach(row => {
            const record = { standings: row };
            if (row.abbr) byAbbr[row.abbr] = record;
            if (row.id != null) byId[row.id] = record;
          });
        }
        if (hitting?.status === 'fulfilled') {
          Object.values(hitting.value).forEach(stat => {
            const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
            row.hitting = stat;
            if (stat.teamId != null) byId[stat.teamId] = row;
          });
        }
        if (pitching?.status === 'fulfilled') {
          Object.values(pitching.value).forEach(stat => {
            const row = byId[stat.teamId] || byAbbr[stat.teamAbbr] || (byAbbr[stat.teamAbbr] = {});
            row.pitching = stat;
            if (stat.teamId != null) byId[stat.teamId] = row;
          });
        }
        const fulfilled = Object.values(aggregateResults).some(result => result?.status === 'fulfilled');
        const settled = Object.values(aggregateResults).every(Boolean);
        if (fulfilled) {
          window.clearTimeout(feedTimeout);
          const snapshot = saveTeamAggregateCache({ byAbbr, byId }, CURRENT_SEASON);
          setLiveTeamData(snapshot?.data || { byAbbr, byId });
          setLiveTeamDataUpdatedAt(snapshot?.updatedAt || Date.now());
          setLiveTeamDataMode('live');
          setLiveTeamError(false);
        } else if (settled) {
          const cached = readTeamAggregateCache(CURRENT_SEASON);
          setLiveTeamDataMode(cached ? 'cached' : 'error');
          setLiveTeamError(!cached);
        }
      };
      const settleAggregate = (key, promise) => promise.then(value => {
        aggregateResults[key] = { status:'fulfilled', value };
        commitAggregates();
      }).catch(error => {
        aggregateResults[key] = { status:'rejected', reason:error };
        commitAggregates();
      });
      settleAggregate('standings', getStandings());
      settleAggregate('hitting', getAllTeamStats('hitting'));
      settleAggregate('pitching', getAllTeamStats('pitching'));
    } else {
      setLiveTeamError(false);
    }

    // Team leaders are useful but non-critical. A timeout or upstream failure
    // should only make the leader rows unavailable, not block the aggregates.
    if (!playersFresh) {
      Promise.allSettled([
        getTeamPlayerStats(teamBase.id, 'hitting'),
        getTeamPlayerStats(teamBase.id, 'pitching'),
        getTeamRecentPlayerStats(teamBase.id, 'hitting', CURRENT_SEASON, 15),
        getTeamRecentPlayerStats(teamBase.id, 'pitching', CURRENT_SEASON, 15),
      ]).then(([teamHitters, teamPitchers, recentHitters, recentPitchers]) => {
        if (!alive) return;
        const cachedPlayers = readTeamPlayersCache(teamBase.id, CURRENT_SEASON);
        const bothFailed = teamHitters.status === 'rejected' && teamPitchers.status === 'rejected';
        const recentById = recentHitters.status === 'fulfilled'
          ? Object.fromEntries(recentHitters.value.map(row => [row.id, row]))
          : {};
        const defaultRecentRows = recentHitters.status === 'fulfilled' || recentPitchers.status === 'fulfilled'
          ? {
              hitting: recentHitters.status === 'fulfilled' ? recentHitters.value : (cachedPlayers?.data?.recentByDays?.[15]?.hitting || []),
              pitching: recentPitchers.status === 'fulfilled' ? recentPitchers.value : (cachedPlayers?.data?.recentByDays?.[15]?.pitching || []),
            }
          : (cachedPlayers?.data?.recentByDays?.[15] || { hitting:[], pitching:[] });
        const latestRangeCache = readTeamPlayersCache(teamBase.id, CURRENT_SEASON)?.data?.recentByDays || cachedPlayers?.data?.recentByDays || {};
        const seasonHitters = teamHitters.status === 'fulfilled' ? teamHitters.value : (cachedPlayers?.data?.hitting || []);
        const nextPlayers = {
          hitting: seasonHitters.map(row => {
            const recent = recentById[row.id];
            const recentOps = recent?.stat?.ops ?? recent?.stat?.onBasePlusSlugging ?? null;
            return recentOps == null ? row : { ...row, stat: { ...row.stat, recentOps } };
          }),
          pitching: teamPitchers.status === 'fulfilled' ? teamPitchers.value : (cachedPlayers?.data?.pitching || []),
          recentByDays: { ...latestRangeCache, 15: defaultRecentRows },
        };
        const receivedVerifiedRows = [teamHitters, teamPitchers, recentHitters, recentPitchers].some(result => result.status === 'fulfilled');
        const snapshot = receivedVerifiedRows
          ? saveTeamPlayersCache(teamBase.id, CURRENT_SEASON, nextPlayers)
          : cachedPlayers;
        setLiveTeamPlayers(nextPlayers);
        setTeamPlayersUpdatedAt(snapshot?.updatedAt || null);
        setTeamPlayersDataMode(snapshot ? (receivedVerifiedRows ? 'live' : 'cached') : 'error');
        setTeamPlayersError(bothFailed && !cachedPlayers);
        setTeamPlayersLoading(false);
      });
    } else {
      setTeamPlayersLoading(false);
      setTeamPlayersError(false);
    }

    return ()=>{ alive=false; if (feedTimeout) window.clearTimeout(feedTimeout); };
  },[teamBase?.id, mlbRetryToken]);

  useEffect(() => {
    if (!teamBase?.id) return undefined;
    let alive = true;
    const cachedPlayers = readTeamPlayersCache(teamBase.id, CURRENT_SEASON);
    const cachedRange = cachedPlayers?.data?.recentByDays?.[hotStreakDays];
    if (cachedRange) {
      setHotStreakRows(cachedRange);
      setHotStreakState('cached');
      return () => { alive = false; };
    }
    if (teamPlayersLoading && hotStreakDays === 15) {
      setHotStreakState('loading');
      return () => { alive = false; };
    }

    setHotStreakRows({ hitting:[], pitching:[] });
    setHotStreakState('loading');
    Promise.allSettled([
      getTeamRecentPlayerStats(teamBase.id, 'hitting', CURRENT_SEASON, hotStreakDays),
      getTeamRecentPlayerStats(teamBase.id, 'pitching', CURRENT_SEASON, hotStreakDays),
    ]).then(([hitting, pitching]) => {
      if (!alive) return;
      const rows = {
        hitting: hitting.status === 'fulfilled' ? hitting.value : [],
        pitching: pitching.status === 'fulfilled' ? pitching.value : [],
      };
      const hasVerifiedRows = rows.hitting.length > 0 || rows.pitching.length > 0;
      if (hasVerifiedRows) {
        const latest = readTeamPlayersCache(teamBase.id, CURRENT_SEASON)?.data;
        const nextPlayers = latest ? { ...latest, recentByDays: { ...(latest.recentByDays || {}), [hotStreakDays]: rows } } : null;
        const snapshot = nextPlayers ? saveTeamPlayersCache(teamBase.id, CURRENT_SEASON, nextPlayers) : null;
        setLiveTeamPlayers(previous => ({ ...previous, recentByDays: { ...(previous?.recentByDays || {}), [hotStreakDays]: rows } }));
        setTeamPlayersUpdatedAt(snapshot?.updatedAt || Date.now());
      }
      setHotStreakRows(rows);
      setHotStreakState(hasVerifiedRows ? 'verified' : 'unavailable');
    }).catch(() => {
      if (alive) setHotStreakState('unavailable');
    });
    return () => { alive = false; };
  }, [teamBase?.id, hotStreakDays, mlbRetryToken, teamPlayersLoading]);

  useEffect(() => {
    if (overviewView !== 'operations') return undefined;
    let alive = true;
    const teamAbbr = teamBase?.abbr;
    if (!teamAbbr) return () => { alive = false; };
    const seasons = taxHistorySeasons;
    setTaxTrendRows([]);
    setTaxTrendState('loading');
    Promise.all(seasons.map(season => fetchTeamFinancials(teamAbbr, season)))
      .then(results => {
        if (!alive) return;
        const rows = buildHistoricalTaxTrendRows(results, seasons);
        setTaxTrendRows(rows);
        setTaxTrendState(rows.some(row => row.taxPayroll != null || row.estimatedTaxBill != null) ? 'ready' : 'unavailable');
      })
      .catch(() => {
        if (alive) {
          setTaxTrendRows([]);
          setTaxTrendState('unavailable');
        }
      });
    return () => { alive = false; };
  }, [overviewView, teamBase?.abbr, taxHistorySeasons]);

  const exportTeamDataQuality = format => {
    const payload = buildTeamDataQualityPayload({ team, liveTeamData, teamModelData, teamSavantData, liveTeamDataUpdatedAt, teamPlayersUpdatedAt, teamBattedBallData });
    const filename = `skip-${String(team?.name || teamBase?.name || 'team').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'team'}-data-quality-${CURRENT_SEASON}`;
    downloadTeamDataQualityExport(payload, format, filename);
  };
  const exportTeamOverviewPdf = async () => {
    if (!overviewRef.current || pdfExportState === 'loading') return;
    setPdfExportState('loading');
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);
      await document.fonts?.ready;
      const canvas = await html2canvas(overviewRef.current, {
        backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f7f4ed',
        scale: Math.min(2, window.devicePixelRatio || 1.5),
        useCORS: true,
        logging: false,
        ignoreElements: element => element.hasAttribute?.('data-export-ignore'),
      });
      const pdf = new jsPDF({ orientation:'portrait', unit:'pt', format:'letter', compress:true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imageHeight = canvas.height * pageWidth / canvas.width;
      const image = canvas.toDataURL('image/png');
      let remaining = imageHeight;
      let offset = 0;
      pdf.setProperties({ title:`${team.name || 'Team'} Overview`, subject:'SKIP Baseball Intelligence Terminal team overview report', author:'SKIP Baseball Intelligence Terminal' });
      while (remaining > 0) {
        if (offset > 0) pdf.addPage();
        pdf.addImage(image, 'PNG', 0, -offset, pageWidth, imageHeight, undefined, 'FAST');
        remaining -= pageHeight;
        offset += pageHeight;
      }
      const safeTeamName = String(team.name || selTeam || 'team').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      pdf.save(`skip-${safeTeamName}-overview-${SEASON}.pdf`);
      setPdfExportState('ready');
      window.setTimeout(() => setPdfExportState(current => current === 'ready' ? 'idle' : current), 2200);
    } catch (error) {
      console.error('[overview-pdf] export failed', error);
      setPdfExportState('error');
      window.setTimeout(() => setPdfExportState(current => current === 'error' ? 'idle' : current), 3200);
    }
  };

  const rd = team.rs == null || team.ra == null || !Number.isFinite(Number(team.rs)) || !Number.isFinite(Number(team.ra))
    ? null
    : Number(team.rs) - Number(team.ra);
  const liveRunDiffData = useMemo(() => buildLiveRunDiffData({ ...team, diff: rd }, CURRENT_SEASON), [team, rd]);

  const D=useMemo(()=>{
    const liveRadar = buildLiveRadarData({ team, liveTeamData, runDiff: rd });
    const records = Object.values(liveTeamData?.byAbbr || {});
    const hittingRecords = records.map(row => row?.hitting).filter(Boolean);
    const pitchingRecords = records.map(row => row?.pitching).filter(Boolean);
    const standingsRecords = records.map(row => row?.standings).filter(Boolean);
    const rankValue = (value, rows, keys, higher = true) => {
      if (value == null || value === '') return null;
      const current = Number(value);
      if (!Number.isFinite(current)) return null;
      const values = rows.map(row => keys.map(key => Number(row?.[key])).find(Number.isFinite)).filter(Number.isFinite);
      return values.length ? percentile(current, values, higher) : null;
    };
    const offPct = rankValue(team.ops, hittingRecords, ['ops']);
    const pitchingPct = rankValue(team.era, pitchingRecords, ['era'], false);
    const baserunning = deriveBaserunningGrade({
      stolenBases:teamRollups.stolenBases ?? team.sb,
      caughtStealing:teamRollups.caughtStealing,
      plateAppearances:teamRollups.plateAppearances,
      comparisonRows:hittingRecords,
    });
    const speedPct = baserunning.percentile;
    const frontOfficeCoverage = deriveFrontOfficeCoverageGrades({
      players:liveTeamPlayers,
      liveDataMode:liveTeamDataMode,
      teamAbbr:team.abbr,
      oaaPercentile:teamOaaData?.oaaPercentile,
      oaaPopulationCount:teamOaaData?.leagueTeamCount,
    });
    const { defensePct, defenseCoveragePct, defenseStatus, oaaPercentile, oaaPopulationCount, depthPct, depthStatus, rosterDepthPct, farmSystemRank, farmSystemPct, futureValuePct, fieldingPositions, fieldingPlayerCount, pitcherCount, activePlayers, prospectCount, prospectTopThreeAverage, prospectTopFiveAverage, prospectTopThreePercentile, prospectTopFivePercentile, prospectOrganizationCount, workloadCoveragePct } = frontOfficeCoverage;
    const divName = team.div || 'League';
    const standings=Object.values(TEAMS).filter(t=>t.div===team.div).map(t=>{
      const live = liveTeamData?.byAbbr?.[t.abbr]?.standings;
      return { ...t, w: live?.w ?? null, l: live?.l ?? null, pct: live?.pct == null ? '—' : Number(live.pct).toFixed(3), cur:t.abbr===team.abbr };
    }).sort((a,b)=>(b.w ?? -1)-(a.w ?? -1));
    const leagueRanks=[
      {label:'Runs Scored',  rank:rankValue(team.rs, standingsRecords, ['rs']), val:team.rs},
      {label:'Home Runs',    rank:rankValue(team.hr, hittingRecords, ['homeRuns']), val:team.hr},
      {label:'Team OPS',     rank:rankValue(team.ops, hittingRecords, ['ops']), val:fmtScorebookRate(team.ops)},
      {label:'Team ERA',     rank:rankValue(team.era, pitchingRecords, ['era'], false), val:formatTeamMetric(team.era,2)},
      {label:'WHIP',         rank:rankValue(team.whip, pitchingRecords, ['whip'], false), val:formatTeamMetric(team.whip,3)},
      {label:'Strikeouts',   rank:rankValue(team.k, pitchingRecords, ['strikeOuts']), val:team.k},
      {label:'Defense index',rank:defensePct,val:defensePct == null ? '—' : `${defensePct}%`},
      {label:'Baserunning index',rank:speedPct,val:speedPct == null ? '—' : `${speedPct}%`},
    ];
    const pctBars=[
      {lbl:'Offense', pct:offPct, color:C.amber},
      {lbl:'Pitching', pct:pitchingPct, color:C.rust},
      {lbl:'Defense', pct:defensePct, color:C.teal},
      {lbl:'Baserunning', pct:speedPct, color:C.navy},
    ];
    const frontOfficeGradeRows = [
      { label:'Offense', grade:pctToGrade(offPct), color:C.amber, detail:offPct == null ? 'Unavailable: verified team OPS and comparable MLB aggregate data are not both available.' : `Calculated from verified team OPS relative to the available MLB team aggregate set (${Math.round(offPct)}th percentile).` },
      { label:'Pitching', grade:pctToGrade(pitchingPct), color:C.rust, detail:pitchingPct == null ? 'Unavailable: verified team ERA and comparable MLB aggregate data are not both available.' : `Calculated from verified team ERA relative to the available MLB team aggregate set (${Math.round(pitchingPct)}th percentile).` },
      { label:'Defense', grade:pctToGrade(defensePct), color:C.teal, detail:defensePct == null ? defenseStatus === 'awaiting-statcast' ? `Pending verified defense quality: ${fieldingPositions} active fielding positions are covered in the roster (${Math.round(defenseCoveragePct || 0)}% coverage), but comparable Baseball Savant OAA has not been loaded. Open Performance or select this detail to retrieve OAA; roster coverage alone does not receive a performance grade.` : 'Unavailable: comparable Baseball Savant OAA and verified roster coverage are required for a defensible defense grade.' : defenseStatus === 'statcast-only' ? `Calculated from Baseball Savant team OAA (${Math.round(oaaPercentile)}th percentile of ${oaaPopulationCount} clubs). Roster coverage was unavailable, so this Statcast-only grade is explicitly narrower.` : `Calculated 80% from Baseball Savant team OAA (${Math.round(oaaPercentile)}th percentile of ${oaaPopulationCount} clubs) and 20% from verified fielding coverage (${Math.round(defenseCoveragePct)}%; ${fieldingPositions} positions, ${Math.round(workloadCoveragePct || 0)}% with 20+ PA, ${fieldingPlayerCount} fielders).` },
      { label:'Baserunning', grade:pctToGrade(speedPct), color:C.teal, detail:speedPct == null ? baserunning.status === 'insufficient-sample' ? `Unavailable: ${baserunning.minimumAttempts} verified stolen-base attempts are required; the team has ${baserunning.attempts ?? 0}.` : 'Unavailable: verified stolen-base and caught-stealing totals plus comparable MLB aggregate data are required.' : `Calculated 45% from ${baserunning.opportunityMetric} (${Math.round(baserunning.volumePercentile)}th percentile) and 55% from steal success (${(baserunning.successRate * 100).toFixed(1)}%; ${Math.round(baserunning.efficiencyPercentile)}th percentile) across ${baserunning.attempts} verified attempts.${baserunning.status === 'volume-fallback' ? ' Plate-appearance totals were unavailable across the comparison set, so volume rather than rate is used.' : ''}` },
      { label:'Depth', grade:pctToGrade(depthPct), color:C.slate, detail:depthPct == null ? 'Unavailable: a dated official MLB Pipeline farm-system rank is required; roster size alone is not organization depth.' : depthStatus === 'farm-only' ? `Calculated from MLB Pipeline’s No. ${farmSystemRank} farm-system rank (published Aug. 16, 2026). Verified active-roster coverage was unavailable, so the result reflects farm depth only.` : `Calculated 65% from MLB Pipeline’s No. ${farmSystemRank} farm-system rank (published Aug. 16, 2026) and 35% from verified active-roster coverage (${activePlayers} season roster rows, ${fieldingPositions} fielding positions, ${pitcherCount} pitcher rows). Baseball America is a public methodology reference only; subscription-only ranks are not imported.` },
      { label:'Future Value', grade:pctToGrade(futureValuePct), color:C.purple, detail:futureValuePct == null ? 'Unavailable: at least two team-scoped SKIP prospect FV rows and a comparable organization snapshot are required.' : `Calculated 65% from the organization’s top-three SKIP prospect FV average (${prospectTopThreeAverage.toFixed(1)}; ${Math.round(prospectTopThreePercentile)}th percentile) and 35% from its top-five average (${prospectTopFiveAverage.toFixed(1)}; ${Math.round(prospectTopFivePercentile)}th percentile), relative to ${prospectOrganizationCount} organizations in the current snapshot. ${prospectCount} graded prospect${prospectCount === 1 ? '' : 's'} are represented; this is prospect quality, not a complete minor-league depth chart.` },
    ];
    const frontOfficeOverall = buildFrontOfficeGradeSummary(frontOfficeGradeRows);
    return {
      offenseData:liveRadar.offenseData,strengthData:liveRadar.strengthData,radarSource:liveRadar.source,standings,leagueRanks,pctBars,divName,
      og:pctToGrade(offPct),pg:pctToGrade(pitchingPct),dg:pctToGrade(defensePct),bg:pctToGrade(speedPct),depthGrade:pctToGrade(depthPct),futureValueGrade:pctToGrade(futureValuePct),
      defensePct,defenseCoveragePct,defenseStatus,oaaPercentile,oaaPopulationCount,depthPct,depthStatus,rosterDepthPct,farmSystemRank,farmSystemPct,futureValuePct,fieldingPositions,fieldingPlayerCount,pitcherCount,activePlayers,prospectCount,prospectTopThreeAverage,prospectTopFiveAverage,prospectTopThreePercentile,prospectTopFivePercentile,prospectOrganizationCount,workloadCoveragePct,
      frontOfficeGradeRows,frontOfficeOverall,overall:frontOfficeOverall.grade,
    };
  },[team, liveTeamData, liveTeamDataMode, teamRollups, teamOaaData, rd]);

  const executivePercentiles = useMemo(() => {
    const runDiff = D.offenseData.find(row => row.axis === 'Run Diff')?.val ?? null;
    const offense = D.pctBars.find(row => row.lbl === 'Offense')?.pct ?? null;
    const pitching = D.pctBars.find(row => row.lbl === 'Pitching')?.pct ?? null;
    return {
      posture:runDiff == null ? null : { label:'Run differential', percentile:runDiff, population:'the available MLB team standings set' },
      best:team.ops >= .750 && offense != null
        ? { label:'Team OPS', percentile:offense, population:'the available MLB team aggregate set' }
        : team.era != null && team.era <= 3.50 && pitching != null
          ? { label:'Team ERA', percentile:pitching, population:'the available MLB team aggregate set' }
          : null,
    };
  }, [D, team.ops, team.era]);

  const teamLeaderEligibility = useMemo(() => ({
    ...TEAM_LEADER_ELIGIBILITY.season,
    hitterRatePa: getTeamLeaderHitterPaMinimum(team) ?? TEAM_LEADER_ELIGIBILITY.season.hitterRatePa,
  }), [team.w, team.l]);
  const selectedEvaluationGrade = useMemo(() => {
    const label = evaluationActiveLabel || 'Overall';
    if (label === 'Overall') return { label, detail:D.frontOfficeOverall.detail };
    return D.frontOfficeGradeRows.find(row => row.label === label) || { label:'Overall', detail:D.frontOfficeOverall.detail };
  }, [D.frontOfficeGradeRows, D.frontOfficeOverall, evaluationActiveLabel]);

  // These only depend on `team`, but were previously called directly in the
  // render body — every unrelated state change on this page (e.g. clicking
  // a split/arsenal tab) was silently recomputing all five for the same
  // team. Memoized on selTeam to match the `D` useMemo above.
  const { splits, leaders, hotStreakLeaders, bb, arsenal, fo } = useMemo(() => ({
    splits:  teamSplitRows,
    leaders: getLeaders(liveTeamPlayers.hitting, liveTeamPlayers.pitching, teamLeaderEligibility),
    hotStreakLeaders: getHotStreakLeaders(hotStreakRows.hitting, hotStreakRows.pitching, hotStreakDays),
    bb:      teamBattedBallData,
    arsenal: teamPitchArsenalData,
    fo:      getFrontOffice(team),
  }), [team, liveTeamPlayers, hotStreakRows, hotStreakDays, teamBattedBallData, teamPitchArsenalData, teamSplitRows, teamLeaderEligibility]);
  const evBins = useMemo(() => buildExitVelocityBins(teamExitVelocityRows), [teamExitVelocityRows]);
  const contactAllowed = useMemo(() => {
    const rows = teamBattedBallAgainstRows;
    const numeric = key => rows.map(row => Number(row?.[key])).filter(Number.isFinite);
    const average = key => { const values = numeric(key); return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; };
    return { sampleSize: rows.length, xwoba: average('xwoba'), exitVelocity: average('launch_speed'), hardHitPct: rows.length ? rows.filter(row => Number(row?.launch_speed) >= 95).length / rows.length * 100 : null };
  }, [teamBattedBallAgainstRows]);
  const sprayRows = useMemo(() => teamBattedBallRows.filter(row => Number.isFinite(Number(row?.hc_x)) && Number.isFinite(Number(row?.hc_y))).slice(0, 600), [teamBattedBallRows]);
  const teamSavantDisplayData = useMemo(() => {
    if (!teamBattedBallRows.length) return teamSavantData;
    const xwobaValues = teamBattedBallRows.map(row => Number(row?.xwoba)).filter(Number.isFinite);
    const evValues = teamBattedBallRows.map(row => Number(row?.launch_speed)).filter(Number.isFinite);
    return {
      ...teamSavantData,
      status: 'live',
      source: 'Baseball Savant · verified team batted-ball query',
      expectedWOBA: xwobaValues.length ? xwobaValues.reduce((sum, value) => sum + value, 0) / xwobaValues.length : teamSavantData?.expectedWOBA ?? null,
      exitVelocity: evValues.length ? evValues.reduce((sum, value) => sum + value, 0) / evValues.length : teamSavantData?.exitVelocity ?? null,
      sampleSize: teamBattedBallRows.length,
    };
  }, [teamBattedBallRows, teamSavantData]);
  const savantHealthStatus = teamSavantState === 'loading'
    ? 'loading'
    : teamSavantDisplayData?.freshness === 'stale-cached'
      ? 'cached-fallback'
      : teamSavantDisplayData?.freshness === 'cached'
        ? 'cached'
        : teamSavantDisplayData?.status === 'live' || teamSavantState === 'ready'
          ? 'verified'
          : 'unavailable';
  const oaaHealthStatus = teamOaaData?.freshness === 'stale-cached'
    ? 'cached-fallback'
    : teamOaaData?.freshness === 'cached'
      ? 'cached'
      : teamOaaData?.status === 'live'
        ? 'verified'
        : teamOaaData?.status === 'upstream-unavailable'
          ? 'unavailable'
          : 'coverage-gap';
  const organizationProspectDepth = useMemo(() => buildOrganizationProspectDepthChart(team.abbr), [team.abbr]);
  const formatOaa = value => value == null ? '—' : `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(0)}`;
  const splitRows=splitTab==='home'?splits.slice(0,2):splitTab==='hand'?splits.slice(2,4):splits.slice(4,6);
  const offRows=[['OPS',fmtScorebookRate(team.ops)],['OBP',formatTeamMetric(team.obp,3)],['SLG',formatTeamMetric(team.slg,3)],['AVG',fmtScorebookRate(team.avg)],['HR',formatTeamMetric(team.hr)],['SB',formatTeamMetric(team.sb)]];
  const pitRows=[['ERA',formatTeamMetric(team.era,2)],['WHIP',formatTeamMetric(team.whip,3)],['K',formatTeamMetric(team.k)],['FIP','—'],['OAA','—'],['BsR','—'] ];

  // Team-level OAA still requires a dedicated Statcast query. Exit-velocity
  // bins are built above from the verified team-scoped Savant feed.
  const oaaPositions = [];
  const aggregateAge = formatDataAge(liveTeamDataUpdatedAt);
  const aggregateStatus = liveTeamDataMode === 'live' ? 'LIVE MLB DATA' : liveTeamDataMode === 'cached' ? `CACHED MLB DATA${aggregateAge ? ` · ${aggregateAge}` : ''}` : liveTeamDataMode === 'error' ? 'LIVE FEED ERROR' : 'CONNECTING TO MLB DATA';
  const aggregateTone = liveTeamDataMode === 'live' ? C.teal : liveTeamDataMode === 'cached' ? C.amberDark : liveTeamDataMode === 'error' ? C.rust : C.amberDark;
  const aggregateSurface = liveTeamDataMode === 'live' ? C.tealSoft : liveTeamDataMode === 'cached' ? C.amberSoft : liveTeamDataMode === 'error' ? C.rustSoft : C.amberSoft;
  const aggregateBorder = liveTeamDataMode === 'live' ? C.tealMid : liveTeamDataMode === 'cached' ? C.amberMid : liveTeamDataMode === 'error' ? C.rustMid : C.amberMid;
  const teamPlayersBadge = teamPlayersDataMode === 'live' ? 'VERIFIED ROSTER ROWS' : teamPlayersDataMode === 'cached' ? `CACHED${teamPlayersUpdatedAt && formatDataAge(teamPlayersUpdatedAt) ? ` · ${formatDataAge(teamPlayersUpdatedAt)}` : ''}` : teamPlayersDataMode === 'error' ? 'UNAVAILABLE' : 'LOADING';
  const showInitialSkeleton = liveTeamDataMode === 'loading' && !liveTeamData && !liveTeamError;
  const mlbParentReadyForAffiliate = liveTeamDataMode !== 'loading' || Boolean(liveTeamData);
  const openExecutiveDestination = (view, targetId) => {
    setOverviewView(view);
    if (!targetId || typeof document === 'undefined') return;
    const scrollToTarget = () => document.getElementById(targetId)?.scrollIntoView?.({ behavior:'smooth', block:'start' });
    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(() => window.requestAnimationFrame(scrollToTarget));
    } else {
      setTimeout(scrollToTarget, 0);
    }
  };

  return (
    <div ref={overviewRef} className="page-enter skip-overview-page" style={{display:'flex',flexDirection:'column',gap:14,borderTop:`3px solid ${teamAccent}`,paddingTop:9}}>

      {showInitialSkeleton && <TeamOverviewSkeleton />}
      <Breadcrumbs items={[{ label:'Overview', onClick:() => openTab('overview') }, { label:team.name || 'Team overview' }]} accent={teamAccent} />

      {/* ── Selector + headline ── */}
      <div className="overview-command-header" style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:20,flexWrap:'wrap',paddingBottom:2}}>
          <div>
          <div className="skip-overview-team-brand" style={{'--team-accent':teamAccent}}>
            <span className="skip-overview-team-logo-mark"><TeamLogo abbr={team.abbr || selTeam.toUpperCase()} size={38} /></span>
            <div>
              <div style={px({fontSize:10,fontWeight:800,color:teamAccent,letterSpacing:'.14em',textTransform:'uppercase'})}>TEAM COMMAND CENTER</div>
              <h1 style={{ ...sans({fontSize:24,fontWeight:800,color:C.text,letterSpacing:'-.04em',lineHeight:1.1}), marginTop:3 }}>{team.name || 'Season overview'}</h1>
            </div>
          </div>
          <div style={sans({fontSize:11,color:C.text3,marginTop:6})}><span>Season overview</span><span aria-hidden="true"> · </span>a live snapshot of performance, leverage, and roster context.</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <button type="button" data-export-ignore onClick={() => exportTeamDataQuality('csv')} aria-label="Download current team data as CSV"
            style={{height:30,padding:'0 9px',border:`1px solid ${C.tealMid}`,borderRadius:7,background:C.tealSoft,color:C.teal,...px({fontSize:9.5,fontWeight:800,letterSpacing:'.05em'})}}>CSV</button>
          <button type="button" data-export-ignore onClick={() => exportTeamDataQuality('json')} aria-label="Download current team data as JSON"
            style={{height:30,padding:'0 9px',border:`1px solid ${C.tealMid}`,borderRadius:7,background:C.tealSoft,color:C.teal,...px({fontSize:9.5,fontWeight:800,letterSpacing:'.05em'})}}>JSON</button>
          <button type="button" data-export-ignore onClick={exportTeamOverviewPdf} disabled={pdfExportState === 'loading'}
            aria-label="Download the current team overview as a PDF"
            style={{height:30,padding:'0 10px',border:`1px solid ${C.amberMid}`,borderRadius:7,background:pdfExportState==='ready'?C.tealSoft:pdfExportState==='error'?C.rustSoft:C.amberSoft,color:pdfExportState==='ready'?C.teal:pdfExportState==='error'?C.rust:C.amberDark,cursor:pdfExportState==='loading'?'wait':'pointer',opacity:pdfExportState==='loading'?.7:1,...px({fontSize:9.5,fontWeight:800,letterSpacing:'.05em'})}}>
            {pdfExportState === 'loading' ? 'BUILDING PDF…' : pdfExportState === 'ready' ? 'PDF DOWNLOADED' : pdfExportState === 'error' ? 'PDF FAILED — RETRY' : 'DOWNLOAD PDF'}
          </button>
          <div role="status" aria-live="polite" style={{display:'flex',alignItems:'center',gap:7,padding:'6px 9px',borderRadius:7,background:aggregateSurface,border:`1px solid ${aggregateBorder}`}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:aggregateTone,animation:liveTeamDataMode === 'loading' ? 'pulse 1.2s ease-in-out infinite' : 'none'}} />
            <span style={px({fontSize:10,color:aggregateTone,fontWeight:700,letterSpacing:'.06em'})}>{liveTeamDataMode === 'loading' ? 'LOADING MLB TEAM…' : aggregateStatus}</span>
            {(liveTeamError || liveTeamDataMode === 'loading') && <button type="button" onClick={()=>{setLiveTeamError(false);setLiveTeamDataMode('loading');setMlbRetryToken(token=>token+1);}} style={{border:0,background:'transparent',color:C.rust,fontSize:10,fontWeight:800,cursor:'pointer',padding:0}}>RETRY</button>}
          </div>
          </div>
        </div>
      <div className="overview-team-context" style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
        <label style={{display:'flex',alignItems:'center',gap:8}}>
          <TeamLogo abbr={team.abbr || selTeam.toUpperCase()} size={24} />
          <span className="sr-only">Select team</span>
          <select aria-label="Select team" value={selTeam} onChange={e=>{ const key=e.target.value; const selected=TEAMS[key]; setPendingAffiliate(null); setAffiliateId(''); setAffiliateLevel('11'); setAffiliateTab('overview'); setAffiliateControlsOpen(false); setAffiliateLevelFilter('all'); setSelTeam(key); if (selected) recordRecentView({ type:'team', abbr:selected.abbr, label:selected.name, secondary:selected.div || 'Team overview' }); }}
          style={{height:34,padding:'0 12px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.surface,color:C.text,cursor:'pointer'}}>
            {sortTeamsByLeagueDivisionName().map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
          </select>
          <button type="button" aria-expanded={affiliateControlsOpen} aria-controls="minor-league-affiliate-selector" onClick={()=>{ if (!affiliateControlsOpen) { setAffiliateLevelFilter('all'); setAffiliateControlsOpen(true); } else { setPendingAffiliate(null); setAffiliateId(''); setAffiliateLevel('11'); setAffiliateTab('overview'); setAffiliateLevelFilter('all'); setAffiliateControlsOpen(false); } }} disabled={!mlbParentReadyForAffiliate}
            style={{height:34,padding:'0 12px',border:`1px solid ${affiliateControlsOpen?C.tealMid:C.border}`,borderRadius:7,fontSize:11,fontFamily:"'DM Mono',monospace",fontWeight:800,letterSpacing:'.04em',background:affiliateControlsOpen?C.tealSoft:C.surface,color:affiliateControlsOpen?C.teal:C.text2,cursor:mlbParentReadyForAffiliate?'pointer':'wait',opacity:mlbParentReadyForAffiliate?1:.65}}>MINOR LEAGUE{affiliateControlsOpen?' · CLOSE':''}</button>
          {affiliateControlsOpen && <select aria-label="Filter minor league affiliates by level" value={affiliateLevelFilter} onChange={e=>{ const nextFilter=e.target.value; setAffiliateLevelFilter(nextFilter); const selected=affiliates.find(row=>String(row.id)===String(affiliateId)); if (selected && nextFilter !== 'all' && String(selected.levelId) !== nextFilter) { setAffiliateId(''); setAffiliateLevel('11'); setAffiliateTab('overview'); } }} disabled={!affiliateLevelOptions.length || affiliatesState==='loading'}
           style={{height:34,padding:'0 10px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.surface,color:C.text,cursor:affiliateLevelOptions.length?'pointer':'not-allowed',opacity:affiliateLevelOptions.length?1:.65}}>
             <option value="all">All levels</option>
             {affiliateLevelOptions.map(level=><option key={level.id} value={level.id}>{level.label}</option>)}
           </select>}
          {affiliateControlsOpen && <select id="minor-league-affiliate-selector" aria-label="Select minor league affiliate" value={affiliateId} onChange={e=>{const next=visibleAffiliates.find(row=>String(row.id)===e.target.value); setAffiliateId(e.target.value); if(next) { setAffiliateLevel(String(next.levelId)); setOverviewView('roster'); recordRecentView({ type:'affiliate', affiliateId:next.id, parentAbbr:team.abbr, levelId:next.levelId, label:next.name, secondary:`${next.level} · ${team.name}` }); }}} disabled={!visibleAffiliates.length || affiliatesState==='loading'}
           style={{height:34,padding:'0 12px',border:`1px solid ${C.border}`,borderRadius:7,fontSize:12,fontFamily:"'Plus Jakarta Sans',sans-serif",background:C.surface,color:C.text,cursor:affiliates.length?'pointer':'not-allowed',opacity:affiliates.length?1:.65}}>
             <option value="">{affiliatesState==='loading'?'Loading affiliates…':affiliatesState==='error'?'Affiliates unavailable':visibleAffiliates.length?'Select MiLB affiliate':'No affiliates at this level'}</option>
             {visibleAffiliates.map(row=><option key={row.id} value={row.id}>{row.level} · {row.name}</option>)}
           </select>}
        </label>
        {overviewView === 'operations' && cacheHealth?.providers && <div role="status" aria-label="Provider cache health" style={{width:'100%',display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginTop:4,padding:'6px 9px',border:`1px solid ${C.borderLight}`,borderRadius:6,background:C.surface2,...sans({fontSize:9,color:C.text3})}}><strong style={px({fontSize:9,color:C.text2,letterSpacing:'.06em',textTransform:'uppercase'})}>Cache health · {cacheHealth.day}</strong>{Object.entries(cacheHealth.providers).filter(([,counts]) => counts && (counts['durable-hit'] || counts['stale-hit'] || counts['upstream-miss'])).map(([provider,counts]) => <span key={provider} style={{display:'inline-flex',gap:5,alignItems:'center'}}><span style={{color:C.text2}}>{provider}</span><span style={{color:C.teal}}>D {counts['durable-hit'] || 0}</span><span style={{color:C.amber}}>S {counts['stale-hit'] || 0}</span><span style={{color:C.text3}}>M {counts['upstream-miss'] || 0}</span></span>)}</div>}
        {overviewView === 'operations' && import.meta.env.DEV && <RequestDiagnosticsPanel />}
        <div className="overview-team-metrics" aria-label="Season team metrics" style={{display:'flex',gap:22,flexWrap:'wrap'}}>
          {[['W–L',team.w == null || team.l == null ? '—' : `${team.w}–${team.l}`],['Win%',fmtWinPct(team.pct)],['RS',formatTeamMetric(team.rs)],['RA',formatTeamMetric(team.ra)],['Run Diff',rd == null ? '—' : `${rd>0?'+':''}${rd}`],['Playoff Odds',playoffOddsValue], [teamWarHeadlineLabel,teamWarValue,teamWarHeadlineTitle]].map(([l,v,title],i)=>(
            <div key={i} title={title || (v === 'Unavailable' ? `${l} unavailable: no verified provider response or safe derived rollup` : undefined)} style={{textAlign:'center',minWidth:0}}>
              <div className="overview-team-metric-value" style={px({fontSize:20,fontWeight:800,lineHeight:1,color:i===4?(rd==null?C.text3:rd>0?C.teal:C.rust):(i===5||i===6)?(v === 'Unavailable' ? C.text4 : C.teal):C.text})}><MetricValue value={v} loading={liveTeamDataMode === 'loading' && !headlineUsesCalculatedStandings} width={i === 0 ? 54 : 38} /></div>
              <div style={sans({fontSize:10,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginTop:3})}>{l}</div>
            </div>
          ))}
        </div>
        <div role="status" data-testid="playoff-odds-verification" style={{width:'100%',marginTop:-8,...sans({fontSize:9,color:hasProviderPlayoffOdds?C.teal:hasSecondaryPlayoffOdds?C.purple:C.text3,lineHeight:1.4})}}>{playoffOddsVerificationLabel}</div>
        {teamWarIsCalculated && <div role="status" data-testid="team-war-proxy-verification" style={{width:'100%',marginTop:-8,...sans({fontSize:9,color:C.teal,lineHeight:1.4})}}>WAR proxy · MLB verified standings · calculated, not FanGraphs Team WAR</div>}
        {headlineUsesCalculatedStandings && <div role="status" data-testid="calculated-standings-headline-note" style={{width:'100%',marginTop:-8,...sans({fontSize:9,color:C.teal,lineHeight:1.4})}}>MLB standings fallback · verified, not projected</div>}
      </div>

      <nav className="skip-overview-view-rail" aria-label="Team Overview views">
        <div className="skip-overview-view-copy">
          <span>Workspace view</span>
          <strong>{OVERVIEW_VIEW_OPTIONS.find(view => view.id === overviewView)?.detail}</strong>
        </div>
        <div className="skip-overview-view-list" aria-label="Team Overview view selector">
          {OVERVIEW_VIEW_OPTIONS.map(view => {
            const selected = overviewView === view.id;
            return <button
              key={view.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setOverviewView(view.id)}
              className="skip-overview-view-button"
              data-active={selected ? 'true' : 'false'}
            >{view.label}</button>;
          })}
        </div>
      </nav>

      <CompactExecutiveBriefing
        rd={rd}
        ops={team.ops}
        era={team.era}
        executivePercentiles={executivePercentiles}
        activeView={overviewView}
        onOpenPerformance={() => openExecutiveDestination('performance', 'team-overview-performance')}
        onOpenProspects={() => window.dispatchEvent(new CustomEvent('skip-navigate', { detail:{ tab:'prospects' } }))}
      />
      {overviewView === 'news' && <TeamNewsPanel team={team} accent={teamAccent} />}

      {overviewView === 'roster' && mlbParentReadyForAffiliate && affiliateId && affiliateId !== String(team.id) && <Panel title="Minor-League Affiliate Overview" accent={C.teal} badge={affiliateOverviewState==='loading'?'Loading…':affiliateOverviewState==='identity-ready'?'Live MLB identity · stats loading':affiliateOverviewState==='ready'?'Live MLB Stats API':'Source unavailable'}>
        <div style={{display:'flex',gap:6,padding:'8px 12px',borderBottom:`1px solid ${C.borderLight}`,flexWrap:'wrap'}}>
          {[['overview','Overview'],['standings','Standings'],['schedule','Schedule']].map(([key,label])=><button key={key} type="button" onClick={()=>setAffiliateTab(key)} style={{border:0,borderBottom:`2px solid ${affiliateTab===key?C.teal:'transparent'}`,background:'transparent',color:affiliateTab===key?C.teal:C.text3,padding:'6px 8px',cursor:'pointer',...px({fontSize:9,fontWeight:800,letterSpacing:'.06em',textTransform:'uppercase'})}}>{label}</button>)}
        </div>
        {affiliateTab==='overview' && <>
          <div className="skip-affiliate-overview-grid skip-balanced-grid" style={{padding:'12px 14px',display:'grid',gridTemplateColumns:'minmax(0,1.3fr) repeat(4,minmax(90px,1fr))',gap:12,alignItems:'center'}}>
            <div><div style={sans({fontSize:15,fontWeight:800,color:C.text})}>{affiliateOverview?.name || affiliates.find(row=>String(row.id)===String(affiliateId))?.name || 'Minor-league affiliate'}</div><div style={sans({fontSize:10,color:C.text3,marginTop:3})}>{affiliateOverview?.level || affiliates.find(row=>String(row.id)===String(affiliateId))?.level || 'MiLB'} · {affiliateOverview?.league || affiliates.find(row=>String(row.id)===String(affiliateId))?.league || 'Affiliate feed'}{affiliateOverview?.venue ? ` · ${affiliateOverview.venue}` : ''}</div><div style={sans({fontSize:9,color:C.text3,marginTop:5})}>Affiliated with {team.name} · {affiliateOverview?.retrievedAt ? `retrieved ${new Date(affiliateOverview.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : humanizeAffiliateOverviewState(affiliateOverviewState)}</div></div>
            {[[affiliateOverview?.hitting?.ops,'OPS',3],[affiliateOverview?.hitting?.homeRuns,'HR',0],[affiliateOverview?.pitching?.era,'ERA',2],[affiliateOverview?.pitching?.strikeOuts,'K',0]].map(([value,label,digits])=><div key={label} style={{textAlign:'center'}}><div style={px({fontSize:18,fontWeight:800,color:value==null?C.text3:C.text})}>{value==null?'—':Number(value).toFixed(digits)}</div><div style={sans({fontSize:9,textTransform:'uppercase',letterSpacing:'.06em',color:C.text3})}>{label}</div></div>)}
          </div>
          <div className="skip-affiliate-savant-grid skip-balanced-grid" style={{padding:'0 14px 12px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:8}}>
            {[['xBA',affiliateSavant?.expectedBA,3],['xSLG',affiliateSavant?.expectedSLG,3],['Hard-hit %',affiliateSavant?.hardHitPercent,1],['Barrel %',affiliateSavant?.barrelPercent,1]].map(([label,value,digits])=><div key={label} style={{padding:'8px',border:`1px solid ${C.borderLight}`,borderRadius:6,background:C.surface2}}><div style={px({fontSize:14,fontWeight:800,color:value==null?C.text3:C.text})}>{value==null?'—':Number(value).toFixed(digits)}{value!=null && label.includes('%')?'%':''}</div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}><span style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em'})}><MetricInfo label={label} /></span><OverviewSourceBadge provider="Savant" status={affiliateSavantHealthStatus} title={`Baseball Savant affiliate source: ${humanizeFeedStatus(affiliateSavant?.status, 'Not retrieved')}`} /></div></div>)}
          </div>
          <div style={{padding:'0 14px 10px',...sans({fontSize:9,color:C.text3})}}>Baseball Savant · <SavantFreshnessText data={affiliateSavant} /></div>
          {affiliateOverviewState==='error' && <div style={{padding:'0 14px 12px',...sans({fontSize:10,color:C.rust})}}>The selected affiliate’s live overview is unavailable right now. The MLB parent overview remains available above.</div>}
        </>}
      {affiliateTab==='standings' && <div style={{padding:'10px 14px'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:8}}><div style={sans({fontSize:9,color:C.text3})}>{affiliateOverview?.level || affiliates.find(row=>String(row.id)===String(affiliateId))?.level || 'Minor-league'} standings · {affiliateStandings?.retrievedAt ? `retrieved ${new Date(affiliateStandings.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : humanizeFeedStatus(affiliateStandings?.status, 'Loading')}</div>{affiliateStandings?.rows?.length ? <div style={{display:'flex',alignItems:'center',gap:5}}><label style={sans({fontSize:8.5,color:C.text3})}>Sort</label><select aria-label="Sort affiliate standings" value={affiliateStandingsSort.key} onChange={e=>{ const key=e.target.value; setAffiliateStandingsSort(current=>({ key, direction:key==='gb'?'asc':key==='name'?'asc':current.direction })); }} style={{height:26,padding:'0 6px',border:`1px solid ${C.border}`,borderRadius:5,background:C.surface,color:C.text,...sans({fontSize:9})}}><option value="pct">Win %</option><option value="record">W–L</option><option value="gb">Games back</option><option value="name">Team</option></select><button type="button" aria-label="Toggle affiliate standings sort direction" onClick={()=>setAffiliateStandingsSort(current=>({ ...current, direction:current.direction==='asc'?'desc':'asc' }))} style={{height:26,minWidth:26,border:`1px solid ${C.border}`,borderRadius:5,background:C.surface2,color:C.text2,cursor:'pointer',...px({fontSize:12,fontWeight:800})}}>{affiliateStandingsSort.direction==='asc'?'↑':'↓'}</button></div> : null}</div>{sortedAffiliateStandings.length ? <><div aria-label="Affiliate standings column labels" style={{display:'grid',gridTemplateColumns:'28px minmax(0,1fr) 48px 48px 52px',gap:8,padding:'0 0 4px',borderBottom:`1px solid ${C.border}`,...px({fontSize:8,color:C.text4,letterSpacing:'.05em'})}}><span>RK</span><span>TEAM</span><span>W–L</span><span>WIN%</span><span>GB</span></div>{sortedAffiliateStandings.slice(0,12).map((row,index)=><div key={row.id || row.name} data-testid="affiliate-standings-row" style={{display:'grid',gridTemplateColumns:'28px minmax(0,1fr) 48px 48px 52px',gap:8,padding:'6px 0',borderBottom:`1px solid ${C.borderLight}`,...sans({fontSize:10,color:row.id===Number(affiliateId)?C.teal:C.text})}}><span>{row.rank || index+1}</span><span>{row.name}</span><span>{row.w}–{row.l}</span><span>{fmtWinPct(row.pct)}</span><span>{row.gb || '—'}</span></div>)}</> : <div style={sans({padding:'14px 0',fontSize:10,color:C.text3})}>Standings are unavailable from the current minor-league feed.</div>}</div>}
        {affiliateTab==='schedule' && <div style={{padding:'10px 14px'}}><div style={sans({fontSize:9,color:C.text3,marginBottom:8})}>Next 14 days · {affiliateSchedule?.freshness === 'stale-cached' ? 'verified cached schedule · provider temporarily unavailable' : affiliateSchedule?.retrievedAt ? `retrieved ${new Date(affiliateSchedule.retrievedAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}` : humanizeFeedStatus(affiliateSchedule?.status, 'Loading')}</div>{affiliateSchedule?.games?.length ? affiliateSchedule.games.map(game=><div key={game.gamePk} style={{display:'grid',gridTemplateColumns:'76px minmax(0,1fr) 74px',gap:8,alignItems:'center',padding:'7px 0',borderBottom:`1px solid ${C.borderLight}`,...sans({fontSize:10,color:C.text})}}><span>{game.time ? new Date(game.time).toLocaleDateString([], {month:'short',day:'numeric'}) : 'TBD'}</span><span>{game.away.name} @ {game.home.name}</span><span style={{color:C.text3}}>{game.status || 'Scheduled'}</span></div>) : <div style={sans({padding:'14px 0',fontSize:10,color:C.text3})}>The affiliate schedule is unavailable or has no games in the next 14 days.</div>}</div>}
      </Panel>}

      {overviewView === 'performance' && <StatStrip items={[
        {val:<MetricValue value={fmtScorebookRate(team.ops)} loading={liveTeamDataMode === 'loading'} />,lbl:'Team OPS',   sub:'Offense', trend:verifiedTrends.ops},
        {val:<MetricValue value={formatTeamMetric(team.hr)} loading={liveTeamDataMode === 'loading'} />,    lbl:'Home Runs',  sub:'Power'},
        {val:<MetricValue value={formatTeamMetric(team.era,2)} loading={liveTeamDataMode === 'loading'} />,lbl:'Team ERA',   sub:'Pitching', trend:verifiedTrends.era},
        {val:<MetricValue value={formatTeamMetric(team.whip,3)} loading={liveTeamDataMode === 'loading'} />,lbl:'WHIP',      sub:'Command', trend:verifiedTrends.whip},
        {val:<MetricValue value={fmtScorebookRate(team.avg)} loading={liveTeamDataMode === 'loading'} />,lbl:'Batting Avg',sub:'Contact'},
        {val:<MetricValue value={formatTeamMetric(team.k)} loading={liveTeamDataMode === 'loading'} />,     lbl:'Strikeouts', sub:'K'},
        {val:<MetricValue value={formatTeamMetric(team.sb)} loading={liveTeamDataMode === 'loading'} />,    lbl:'Stolen Bases',sub:'Speed'},
        {val:<MetricValue value={teamWarValue} loading={liveTeamDataMode === 'loading'} />,lbl:teamWarIsCalculated ? 'WAR Proxy' : 'Team WAR',   sub:<div>{teamWarIsCalculated ? <span style={sans({fontSize:8,color:C.teal})}>MLB Stats API · calculated</span> : <OverviewSourceBadge provider="FanGraphs" status={fanGraphsHealthStatus} title={`FanGraphs Team WAR source: ${humanizeFeedStatus(teamModelData?.statuses?.teamWar || teamModelState)}`} />}{teamModelData?.divisionAverageWAR != null && teamModelData?.teamWar != null && <div style={{fontSize:8,color:C.text3,marginTop:2}}>{team.div}: {Number(Number(teamModelData.teamWar) - Number(teamModelData.divisionAverageWAR)) >= 0 ? `+${(Number(teamModelData.teamWar) - Number(teamModelData.divisionAverageWAR)).toFixed(1)}` : (Number(teamModelData.teamWar) - Number(teamModelData.divisionAverageWAR)).toFixed(1)} div avg</div>}</div>, color:teamWarValue === 'Unavailable' ? C.text4 : C.purple},
      ]}/>}

      {overviewView === 'performance' && <>
      {/* Moved Unavailable / FanGraphs model panels toward the bottom as requested */}
      <div style={{display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',padding:'7px 10px',border:`1px solid ${C.borderLight}`,borderRadius:7,background:C.surface2,...sans({fontSize:9.5,color:C.text3})}}>
        <span>Model source: <strong style={{color:C.text2}}>{teamWarIsCalculated ? 'FanGraphs when available · MLB fallback' : 'FanGraphs'}</strong> · {modelFreshness}</span>
        <span>Playoff odds: {playoffOddsSource} · {teamWarIsCalculated ? 'WAR: MLB Stats API · calculated proxy' : `Team WAR: ${humanizeFeedStatus(teamModelData?.statuses?.teamWar || teamModelState)}`}</span>
      </div>
      <Panel title="Postseason Standing Context" accent={C.teal} badge="MLB Stats API">
        {standingsContext ? <>
          <div data-testid="postseason-standings-context" className="skip-balanced-grid" style={{padding:'10px 14px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(106px,1fr))',gap:8}}>
            {[
              ['Record', standingsContext.record],
              ['Division place', standingsContext.divisionRank],
              ['Games back', standingsContext.gamesBack],
              ['Wild-card place', standingsContext.wildCardRank],
              ['Last 10', standingsContext.lastTen],
              ['Streak', standingsContext.streak],
            ].map(([label,value]) => <div key={label} style={{padding:'8px',border:`1px solid ${C.borderLight}`,borderRadius:6,background:C.surface2}}><div style={px({fontSize:14,fontWeight:800,color:value==='—'?C.text3:C.text})}>{value}</div><div style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em',marginTop:4})}>{label}</div></div>)}
          </div>
          <div style={sans({padding:'0 14px 10px',fontSize:9,color:C.text3,lineHeight:1.4})}>{standingsContext.divisionName} leader: <strong style={{color:C.text2}}>{standingsContext.divisionLeader} ({standingsContext.divisionLeaderRecord})</strong> · verified MLB standings context, not a projected probability.</div>
        </> : <OverviewEmptyState status={liveTeamDataMode === 'loading' ? 'Loading' : 'Unavailable'} message="Postseason standings context" detail="Verified division and Wild Card position will appear when the current MLB standings snapshot is available." />}
      </Panel>
      <Panel title="Divisional WAR Comparison" accent={C.purple} badge={<span className="skip-overview-source-badges" style={{gap:10}}><OverviewSourceBadge provider="FanGraphs" status={fanGraphsHealthStatus} /></span>}>
        <div style={{ padding:'8px 14px 0', display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', alignItems:'baseline' }}>
          <span style={sans({ fontSize:9.5, color:C.text3 })}>{teamModelData?.providerBlocked ? (divisionWarData.length ? 'Cached verified rows · provider blocked' : 'Provider blocked · no verified rows') : 'Verified WAR by division'}</span>
          <span style={px({ fontSize:9, color:C.text4 })}>{divisionWarData.length ? `${divisionWarData.length} teams` : 'No verified rows'}</span>
        </div>
        {divisionWarData.length ? <Suspense fallback={<div role="status" style={{ height:178, display:'flex', alignItems:'center', justifyContent:'center', color:C.text3, ...px({ fontSize:10 }) }}>Loading WAR chart…</div>}>
          <DivisionalWarChart data={divisionWarData} selectedTeam={team.abbr} selectedTeamAccent={teamAccent} />
        </Suspense> : <OverviewEmptyState status={teamModelData?.providerBlocked ? 'Provider blocked' : 'Unavailable'} message="Divisional WAR rows" detail="No verified FanGraphs divisional WAR rows are available for this view, so SKIP does not reserve chart-sized space for an empty comparison." />}
        {divisionWarData.length > 0 && <div className="skip-divisional-war-table-wrap">
          <table className="skip-divisional-war-table" aria-label="Exact divisional WAR values">
            <thead><tr><th scope="col">Team</th><th scope="col">Total</th><th scope="col">Off</th><th scope="col">Pitch</th><th scope="col">Def</th></tr></thead>
            <tbody>{divisionWarData.map(row => <tr key={row.team} data-selected={row.team === team.abbr ? 'true' : 'false'}>
              <th scope="row">{row.team}</th>
              <td>{formatDivisionWar(row.totalWAR)}</td>
              <td>{formatDivisionWar(row.offensiveWAR)}</td>
              <td>{formatDivisionWar(row.pitchingWAR)}</td>
              <td>{formatDivisionWar(row.defensiveWAR)}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        <div style={sans({ padding:'0 14px 10px', fontSize:9, color:C.text4, lineHeight:1.4 })}>{teamModelData?.providerBlocked ? (divisionWarData.length ? 'Historical cache; not live.' : 'No cached divisional WAR available.') : divisionWarData.length ? <><span style={{ color:teamAccent, fontWeight:800 }}>{team.abbr} highlighted in club color</span><span> · division peers remain neutral purple · missing components shown as —.</span></> : 'No verified divisional WAR available.'}</div>
      </Panel>
      <Panel title="Advanced Models & Savant" accent={C.purple}>
        <div className="skip-overview-panel-status" role="status" aria-label="Advanced models data sources">
          <span>Sources</span>
          <OverviewSourceBadge provider="FanGraphs" status={fanGraphsHealthStatus} />
          <OverviewSourceBadge provider="MLB Stats API" status={calculationProviderStatus} />
          <OverviewSourceBadge provider="Savant" status={savantHealthStatus} />
        </div>
        <div className="skip-balanced-grid" style={{padding:'10px 14px',display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(90px,1fr))',gap:8}}>
          {[['Win pace W',projectedWinsValue,1,calculatedModelSource,calculatedModelStatus],['Win pace L',projectedLossesValue,1,calculatedModelSource,calculatedModelStatus],['Pythag W',pythagoreanWinsValue,1,'MLB Stats API',pythagoreanModelStatus],['Pythag L',pythagoreanLossesValue,1,'MLB Stats API',pythagoreanModelStatus],['Off WAR',teamModelData?.advancedMetrics?.offenseWar,1,'FanGraphs',fanGraphsHealthStatus],['Def WAR',teamModelData?.advancedMetrics?.defenseWar,1,'FanGraphs',fanGraphsHealthStatus],['xwOBA',teamSavantDisplayData?.expectedWOBA,3,'Savant',savantHealthStatus],['Exit velo',teamSavantDisplayData?.exitVelocity,1,'Savant',savantHealthStatus]].map(([label,value,digits,provider,status])=>{
            const metricStatus = provider === 'FanGraphs' ? fanGraphsMetricStatus(value) : status;
            const metricTitle = provider === 'FanGraphs' ? fanGraphsMetricTitle(label, value) : `${provider} metric source health`;
            return <div key={label} title={metricTitle} style={{padding:'8px',border:`1px solid ${C.borderLight}`,borderRadius:6,background:C.surface2}}><div style={px({fontSize:14,fontWeight:800,color:value==null?C.text3:C.text})}>{value==null?'—':Number(value).toFixed(digits)}</div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:4}}><span style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em'})}>{label}</span>{value == null && <span style={px({fontSize:8,color:C.text4,letterSpacing:'.04em'})}>—</span>}</div></div>;
          })}
        </div>
        <div title="Playoff odds are shown only when FanGraphs returns a team-specific value. Current win pace and Pythagorean pace are calculated from verified MLB standings and shown separately. WAR proxy is Pythagorean expected wins above a 48-win replacement baseline, not FanGraphs WAR." style={{padding:'0 14px 10px',display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',...sans({fontSize:9,color:C.text3})}}>{(calculatedModelSource === 'MLB Stats API · calculated' || pythagoreanWinsValue != null || teamWarIsCalculated) ? 'MLB calculated · pace: record · pythag: RS/RA · WAR: proxy · playoff odds: FanGraphs only' : `FanGraphs projections · ${modelFreshness}`} · {teamSavantDisplayData?.source || 'Baseball Savant'} · <SavantFreshnessText data={teamSavantDisplayData} /></div>
      </Panel>
      </>}
      {overviewView === 'operations' && <Panel title="Ballpark Environment" accent={OVERVIEW_ACCENTS.context} badge={teamVenueState === 'loading' ? 'Loading…' : teamVenueState === 'ready' ? (teamVenueMetadata?.freshness === 'stale-cached' ? 'Cached MLB Stats API' : 'MLB Stats API') : 'Unavailable'}>
        {teamVenueMetadata?.venue ? <>
          <div style={{padding:'10px 14px 8px',display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap',alignItems:'baseline'}}>
            <div style={px({fontSize:15,fontWeight:800,color:C.text})}>{teamVenueMetadata.venue.name || team.name}</div>
            <div style={sans({fontSize:9,color:C.text3})}>{teamVenueMetadata.freshness === 'stale-cached' ? 'Verified cached snapshot' : 'Verified venue metadata'}</div>
          </div>
          <div className="skip-balanced-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',borderTop:`0.5px solid ${C.borderLight}`}}>
            {[
              ['Capacity', teamVenueMetadata.venue.capacity == null ? '—' : teamVenueMetadata.venue.capacity.toLocaleString()],
              ['Surface', teamVenueMetadata.venue.surface || '—'],
              ['Roof', teamVenueMetadata.venue.roof || '—'],
              ['Coordinates', teamVenueMetadata.venue.latitude == null || teamVenueMetadata.venue.longitude == null ? '—' : `${teamVenueMetadata.venue.latitude.toFixed(2)}, ${teamVenueMetadata.venue.longitude.toFixed(2)}`],
            ].map(([label,value], index) => <div key={label} style={{padding:'9px 10px',borderRight:index < 3 ? `0.5px solid ${C.borderLight}` : 'none'}}><div style={px({fontSize:13,fontWeight:800,color:value === '—' ? C.text3 : C.text})}>{value}</div><div style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em',marginTop:3})}>{label}</div></div>)}
          </div>
          <div style={sans({padding:'8px 14px 10px',fontSize:9,color:C.text4,lineHeight:1.4})}>Wall distances: LF {teamVenueMetadata.venue.dimensions?.leftLine ?? '—'} · LCF {teamVenueMetadata.venue.dimensions?.leftCenter ?? '—'} · CF {teamVenueMetadata.venue.dimensions?.center ?? '—'} · RCF {teamVenueMetadata.venue.dimensions?.rightCenter ?? '—'} · RF {teamVenueMetadata.venue.dimensions?.rightLine ?? '—'} ft. Altitude, wall height, orientation, and park factors are not shown without a verified source.</div>
        </> : <OverviewEmptyState status={teamVenueState === 'loading' ? 'Loading' : teamVenueState === 'source-gap' ? 'Source gap' : 'Unavailable'} message="Ballpark metadata" detail="Official MLB venue metadata is not available for this team right now. No static park values are substituted." />}
      </Panel>}

      {overviewView === 'briefing' && <section className="skip-overview-deferred-analysis-section" aria-labelledby="team-overview-detailed-analysis-title">
        <div className="skip-overview-deferred-analysis-intro">
          <div>
            <span>Supporting analysis</span>
            <h2 id="team-overview-detailed-analysis-title">Detailed team cards</h2>
          </div>
          <p>Leaders, team evaluation, and strength context.</p>
        </div>
        <div id="team-overview-detailed-analysis" className="overview-responsive-grid overview-decision-row skip-overview-deferred-analysis" style={{display:'grid',gridTemplateColumns:'minmax(240px,1fr) minmax(280px,1.15fr)',minHeight:'100%',gap:10,alignItems:'start'}}>
        <Panel title={`Team Leaders · ${teamLeaderEligibility.hitterRatePa} PA min`} accent={OVERVIEW_ACCENTS.offense} badge={teamPlayersBadge}>
          <div style={{padding:'7px 10px 5px',borderBottom:`0.5px solid ${C.borderLight}`}}>
            <div style={sans({fontSize:9.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.amber,marginBottom:5})}>Batting</div>
            {leaders.batting.map((row,i)=>(
              <div key={row.cat} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0',borderBottom:i<leaders.batting.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={{display:'flex',gap:7,alignItems:'center'}}>
                  <span title={row.eligibility ? `Minimum eligibility: ${row.eligibility}` : undefined} style={{...px({fontSize:10,fontWeight:700,color:C.amber}),background:C.amberSoft,padding:'1px 6px',borderRadius:4,minWidth:row.eligibility ? 54 : 30,textAlign:'center'}}>{row.cat}{row.eligibility ? ` · ${row.eligibility}` : ''}</span>
                  <TeamLeaderProfileLink row={row} color={C.amber} group="season batting" />
                </div>
                <span style={px({fontSize:12,fontWeight:800,color:C.text})}>{row.val}</span>
              </div>
            ))}
          </div>
          <div style={{padding:'7px 10px 5px'}}>
            <div style={sans({fontSize:9.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.rust,marginBottom:5})}>Pitching</div>
            {leaders.pitching.map((row,i)=>(
              <div key={row.cat} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0',borderBottom:i<leaders.pitching.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={{display:'flex',gap:7,alignItems:'center'}}>
                  <span title={row.eligibility ? `Minimum eligibility: ${row.eligibility}` : undefined} style={{...px({fontSize:10,fontWeight:700,color:C.rust}),background:C.rustSoft,padding:'1px 6px',borderRadius:4,minWidth:row.eligibility ? 54 : 30,textAlign:'center'}}>{row.cat}{row.eligibility ? ` · ${row.eligibility}` : ''}</span>
                  <TeamLeaderProfileLink row={row} color={C.rust} group="season pitching" />
                </div>
                <span style={px({fontSize:12,fontWeight:800,color:C.text})}>{row.val}</span>
              </div>
            ))}
          </div>
          <section className="skip-team-hot-streak" aria-labelledby="team-hot-streak-title">
            <div className="skip-team-hot-streak-heading">
              <div><span>Recent performance</span><strong id="team-hot-streak-title">{hotStreakDays}-day hot streak</strong></div>
              <div className="skip-team-hot-streak-controls">
                <label>
                  <span>Range</span>
                  <select aria-label="Select hot-streak date range" value={hotStreakDays} onChange={event => setHotStreakDays(Number(event.target.value))}>
                    {HOT_STREAK_RANGE_OPTIONS.map(option => <option key={option.days} value={option.days}>{option.label}</option>)}
                  </select>
                </label>
                <span>{hotStreakState === 'loading' ? 'Checking MLB' : hotStreakState === 'cached' ? 'Cached MLB rows' : hotStreakState === 'verified' ? 'Official MLB Stats API' : 'MLB rows unavailable'}</span>
              </div>
            </div>
            {hotStreakState === 'loading' ? <div className="skip-team-hot-streak-unavailable" role="status">Loading verified {hotStreakDays}-day MLB player splits.</div> : hotStreakLeaders.available ? <div className="skip-team-hot-streak-grid">
              {[...hotStreakLeaders.batting.map(row => ({ row, color:C.amber, surface:C.amberSoft, group:`${hotStreakDays}-day batting` })), ...hotStreakLeaders.pitching.map(row => ({ row, color:C.rust, surface:C.rustSoft, group:`${hotStreakDays}-day pitching` }))].map(({row,color,surface,group}) => (
                <div className="skip-team-hot-streak-row" key={`${group}-${row.cat}`}>
                  <span title={row.eligibility ? `Minimum eligibility: ${row.eligibility}` : undefined} style={{...px({fontSize:9,fontWeight:700,color}),background:surface,padding:'1px 5px',borderRadius:4,whiteSpace:'nowrap'}}>{row.cat}{row.eligibility ? ` · ${row.eligibility}` : ''}</span>
                  <TeamLeaderProfileLink row={row} color={color} group={group} />
                  <strong>{row.val}</strong>
                </div>
              ))}
            </div> : <div className="skip-team-hot-streak-unavailable" role="status">No verified {hotStreakDays}-day MLB player-split rows are available. Recent leaders are intentionally hidden.</div>}
          </section>
          <div style={sans({padding:'6px 10px 8px',fontSize:8.5,color:C.text4,lineHeight:1.35,borderTop:`0.5px solid ${C.borderLight}`})}>Batting rate minimum: {teamLeaderEligibility.hitterRatePa} PA = ceil(33% × 3.5 PA per game × {Number(team.w || 0) + Number(team.l || 0)} games). AVG and OPS use this team-specific threshold; ERA and WHIP use qualifying pitcher IP. Hitter and pitcher splits remain separate.</div>
        </Panel>

        <div id="team-overview-front-office-evaluation">
        <Panel title="Front Office Evaluation" accent={OVERVIEW_ACCENTS.context} badge="Decision Lens">
          <div style={{padding:'8px 10px 0'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <div>
                <div style={sans({fontSize:9.5,fontWeight:700,color:C.teal,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6})}>Strengths</div>
                {fo.strengths.map(s=>(
                  <div key={s} style={{display:'flex',alignItems:'flex-start',gap:5,marginBottom:5}}>
                    <span style={{color:C.teal,fontSize:11,flexShrink:0,marginTop:1}}>✓</span>
                    <span style={sans({fontSize:10.5,color:C.text2,lineHeight:1.4})}>{s}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={sans({fontSize:9.5,fontWeight:700,color:C.rust,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6})}>Weaknesses</div>
                {fo.weaknesses.length ? fo.weaknesses.map(s=>(
                  <div key={s} style={{display:'flex',alignItems:'flex-start',gap:5,marginBottom:5}}>
                    <span style={{color:C.rust,fontSize:11,flexShrink:0,marginTop:1}}>✕</span>
                    <span style={sans({fontSize:10.5,color:C.text2,lineHeight:1.4})}>{s}</span>
                  </div>
                )) : <div style={sans({fontSize:10,color:C.text4,lineHeight:1.4})}>No material weaknesses surfaced at current thresholds.</div>}
              </div>
            </div>
            <div style={{marginTop:6,paddingTop:10,borderTop:`0.5px solid ${C.borderLight}`}} data-evaluation-presentation={evaluationPresentation}>
              <div style={sans({fontSize:9.5,fontWeight:700,letterSpacing:'.07em',textTransform:'uppercase',color:C.text3,marginBottom:8})}>Overall Team Rating</div>
              {evaluationPresentation === 'score-ring'
                ? <FrontOfficeScoreRingPreview teamName={team.name} grades={D.frontOfficeGradeRows} overall={D.frontOfficeOverall} teamKey={team.abbr} activeLabel={evaluationActiveLabel} onActiveLabelChange={setEvaluationActiveLabel} />
                : <FrontOfficeGradeCards grades={D.frontOfficeGradeRows} overall={D.frontOfficeOverall} teamKey={team.abbr} activeLabel={evaluationActiveLabel} onActiveLabelChange={setEvaluationActiveLabel} />}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap',marginTop:7}}>
                <div data-selected-grade={selectedEvaluationGrade.label} style={sans({fontSize:8.5,color:C.text4,lineHeight:1.35})}><strong style={{color:C.text3}}>{selectedEvaluationGrade.label} methodology. </strong>{selectedEvaluationGrade.detail}</div>
                <button type="button" onClick={() => setFutureValueModalOpen(true)} aria-haspopup="dialog" aria-label="Open organization prospect depth chart" style={{border:`1px solid ${C.purple}`,borderRadius:5,background:C.surface,color:C.purple,padding:'4px 7px',cursor:'pointer',whiteSpace:'nowrap',...sans({fontSize:8.5,fontWeight:700})}}>INSPECT PROSPECT DEPTH</button>
              </div>
            </div>
          </div>
        </Panel>
        </div>

        {futureValueModalOpen && <div className="skip-future-value-modal-backdrop" role="presentation" onMouseDown={() => setFutureValueModalOpen(false)}>
          <section className="skip-future-value-modal" role="dialog" aria-modal="true" aria-labelledby="future-value-depth-title" onMouseDown={event => event.stopPropagation()}>
            <header className="skip-future-value-modal-header">
              <div>
                <div style={sans({fontSize:9,color:C.purple,fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em'})}>SKIP prospect snapshot</div>
                <h2 id="future-value-depth-title" style={px({fontSize:19,fontWeight:800,color:C.text,margin:'3px 0 0'})}>{team.name} Organization Depth</h2>
              </div>
              <button type="button" className="skip-future-value-modal-close" onClick={() => setFutureValueModalOpen(false)} aria-label="Close organization prospect depth chart">×</button>
            </header>
            <div className="skip-future-value-modal-summary">
              <span>{organizationProspectDepth.prospects.length} graded prospect{organizationProspectDepth.prospects.length === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>{organizationProspectDepth.rows.length} position group{organizationProspectDepth.rows.length === 1 ? '' : 's'}</span>
              <span>·</span>
              <span>FV uses the established SKIP eFV baseline</span>
            </div>
            {organizationProspectDepth.rows.length ? <div className="skip-future-value-depth-grid">
              {organizationProspectDepth.rows.map(row => <section key={row.position} className="skip-future-value-position-group">
                <div className="skip-future-value-position-heading"><span>{row.position}</span><span>Top FV {row.topFutureValue.toFixed(0)}</span></div>
                {row.prospects.slice(0, 4).map(prospect => <a key={`${prospect.mlbId || prospect.name}-${prospect.pos}`} href="#players" className="skip-future-value-prospect-row skip-future-value-prospect-link" onClick={event => { event.preventDefault(); setFutureValueModalOpen(false); openPlayerProfile(prospect.mlbId, prospect.name); }} aria-label={`Open ${prospect.name} detailed player profile`}>
                  <div><strong>{prospect.name}</strong><span>{prospect.level} · age {prospect.age}</span></div><b>{prospect.futureValue.toFixed(0)} FV</b>
                </a>)}
              </section>)}
            </div> : <OverviewEmptyState message="Prospect depth chart" detail="The current SKIP prospect snapshot has no graded prospects for this organization." />}
            <p className="skip-future-value-modal-note">Source: curated SKIP prospect snapshot. This chart is an organization-level planning view, not a live MLB Pipeline or third-party prospect ranking feed.</p>
          </section>
        </div>}

        <Panel title="Team Strength Radar" accent={OVERVIEW_ACCENTS.context} badge="Percentiles">
          <div style={{padding:'3px 8px 0'}}>
            <Suspense fallback={<ChartFallback height={196}/> }>
              <StrengthRadar data={D.strengthData} accent={teamAccent} showLeagueBenchmark={D.hasLeagueBenchmark}/>
            </Suspense>
          </div>
          <div style={{padding:'0 14px 10px',...sans({fontSize:9.5,color:C.text4,lineHeight:1.4})}}>
            {getStrengthRadarBenchmarkCaption({hasLeagueBenchmark:D.hasLeagueBenchmark,leagueTeamCount:D.leagueTeamCount,radarSource:D.radarSource})}
          </div>
        </Panel>
        </div>
      </section>}

      {overviewView === 'operations' && <Panel id="team-overview-operations" role="tabpanel" title="Franchise CBT Trend" accent={teamAccent} badge={`${taxHistorySeasons[0]}–${taxHistorySeasons.at(-1)}`}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,padding:'10px 14px 4px',flexWrap:'wrap'}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <TeamLogo abbr={team.abbr || selTeam.toUpperCase()} size={24} />
            <div>
              <div style={sans({fontSize:11,fontWeight:800,color:C.text})}>{team.name || 'Selected franchise'}</div>
              <div style={sans({fontSize:9.5,color:C.text3,marginTop:2})}>Historical tax payroll and estimated CBT bill</div>
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap',marginLeft:'auto'}}>
            <label style={{display:'inline-flex',alignItems:'center',gap:6,...sans({fontSize:9.5,color:C.text3,fontWeight:700})}}>
              <span>History</span>
              <select aria-label="Franchise CBT history range" value={taxHistoryRange} onChange={event => setTaxHistoryRange(saveCbtHistoryRange(event.target.value))}
                style={{padding:'5px 7px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface3,color:C.text,...px({fontSize:9.5,fontWeight:800})}}>
                {CBT_HISTORY_OPTIONS.map(option => <option key={option} value={option}>{option} seasons</option>)}
              </select>
            </label>
            <div style={px({fontSize:9,color:taxTrendState==='ready'?C.teal:taxTrendState==='loading'?C.amber:C.text3,fontWeight:800,letterSpacing:'.06em'})}>
              {taxTrendState === 'loading' ? 'LOADING SOURCE HISTORY' : taxTrendState === 'ready' ? 'SPOTRAC HISTORY' : 'HISTORY UNAVAILABLE'}
            </div>
          </div>
        </div>
        <div style={{padding:'2px 8px 0'}}>
          <Suspense fallback={<ChartFallback height={178}/> }>
            <LuxuryTaxTrendChart data={taxTrendRows} accent={teamAccent}/>
          </Suspense>
        </div>
        <div style={{display:'flex',gap:16,flexWrap:'wrap',padding:'0 14px 8px',...sans({fontSize:9.5,color:C.text3})}}>
          <span><i style={{display:'inline-block',width:16,height:2,background:teamAccent,verticalAlign:'middle',marginRight:5}} />CBT payroll</span>
          <span><i style={{display:'inline-block',width:16,height:2,background:C.rust,verticalAlign:'middle',marginRight:5}} />Estimated tax bill</span>
        </div>
        <div style={{padding:'0 14px 10px',...sans({fontSize:9.5,color:C.text4,lineHeight:1.4})}}>
                        {taxHistoryRange}-season rows are requested from season-specific Spotrac MLB Tax Trackers. Missing rows remain unavailable; SKIP does not interpolate historical tax values. Threshold rules follow the <a href="https://www.mlb.com/glossary/transactions/competitive-balance-tax" target="_blank" rel="noreferrer" style={{color:C.amber}}>MLB CBT glossary</a>.

        </div>
      </Panel>}

      {overviewView === 'roster' && <Panel id="team-overview-roster" role="tabpanel" title="AI Scout Insights" accent={C.teal} badge={aiInsightsState === 'loading' ? 'Analyzing roster…' : aiInsightsState === 'ready' ? 'AI-assisted' : 'Local fallback'}>
        <div style={{padding:'8px 14px 0',...sans({fontSize:10,color:C.text3,lineHeight:1.45})}}>
          Automated read of the selected team using current aggregate stats and roster leaders. It updates when the team or live feed changes.
        </div>
        <div className="roster-insight-quick-filters" style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',padding:'10px 14px 0'}}>
          <span style={sans({fontSize:9.5,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em'})}>Quick filter</span>
          {ROSTER_QUICK_FILTERS.map(filter => <button key={filter.id} type="button" aria-pressed={rosterQuickFilter === filter.id} onClick={()=>applyRosterQuickFilter(filter)} style={{height:28,padding:'0 9px',border:`1px solid ${rosterQuickFilter === filter.id ? C.teal : C.border}`,borderRadius:6,background:rosterQuickFilter === filter.id ? C.tealSoft : C.surface,color:rosterQuickFilter === filter.id ? C.teal : C.text2,fontSize:10,fontWeight:700,cursor:'pointer'}}>{filter.label}</button>)}
        </div>
        <div className="roster-insight-presets" style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',padding:'10px 14px 0'}}>
          <span style={sans({fontSize:9.5,color:C.text3,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em'})}>Presets</span>
          {ROSTER_PRESETS.map(preset => <button key={preset.id} type="button" aria-pressed={activeRosterPreset === preset.id} onClick={()=>applyRosterPreset(preset)} style={{height:28,padding:'0 9px',border:`1px solid ${activeRosterPreset === preset.id ? C.teal : C.border}`,borderRadius:6,background:activeRosterPreset === preset.id ? C.tealSoft : C.surface,color:activeRosterPreset === preset.id ? C.teal : C.text2,fontSize:10,fontWeight:700,cursor:'pointer'}}>{preset.label}</button>)}
        </div>
        <div className="roster-insight-controls" style={{display:'flex',alignItems:'flex-start',gap:8,flexWrap:'wrap',padding:'8px 14px 2px'}}>
          <fieldset style={{border:0,padding:0,margin:0,minWidth:190}}>
            <legend style={sans({fontSize:10,color:C.text2,fontWeight:700,marginBottom:5})}>Positions</legend>
            <div style={{display:'flex',alignItems:'center',gap:5,flexWrap:'wrap'}}>
              <button type="button" aria-label="Show all roster positions" onClick={()=>{setSelectedRosterPositions([]);setActiveRosterPreset(null);setRosterQuickFilter('all')}} style={{height:28,padding:'0 8px',border:`1px solid ${selectedRosterPositions.length===0?C.amber:C.border}`,borderRadius:6,background:selectedRosterPositions.length===0?C.amberSoft:C.surface,color:selectedRosterPositions.length===0?C.amberDark:C.text2,fontSize:10,cursor:'pointer'}}>All</button>
              {rosterPositions.map(position => {
                const checked = selectedRosterPositions.includes(position);
                return <label key={position} style={{display:'inline-flex',alignItems:'center',gap:4,height:28,padding:'0 7px',border:`1px solid ${checked?C.amber:C.border}`,borderRadius:6,background:checked?C.amberSoft:C.surface,cursor:'pointer',...sans({fontSize:10,color:checked?C.amberDark:C.text2,fontWeight:700})}}>
                  <input type="checkbox" aria-label={`Filter roster insights by ${position}`} checked={checked} onChange={e=>{setActiveRosterPreset(null);setRosterQuickFilter(null);setSelectedRosterPositions(prev=>e.target.checked?[...prev,position]:prev.filter(item=>item!==position))}} style={{accentColor:C.amber}} />
                  {position}
                </label>;
              })}
              {!rosterPositions.length && <span style={sans({fontSize:10,color:C.text4,fontStyle:'italic'})}>Loading positions…</span>}
            </div>
          </fieldset>
          <label style={{display:'flex',alignItems:'center',gap:6,...sans({fontSize:10,color:C.text2,fontWeight:700})}}>
            <span>Sort by</span>
            <select aria-label="Sort roster insights by player statistic" value={rosterSort} onChange={e=>{const nextSort=e.target.value;setActiveRosterPreset(null);setRosterQuickFilter(null);setRosterSort(nextSort);setRosterSortDirection(ROSTER_SORT_OPTIONS.find(option=>option.key===nextSort)?.direction || 'desc')}} style={{height:30,padding:'0 8px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text,fontSize:10,cursor:'pointer'}}>
              {ROSTER_SORT_OPTIONS.map(option => <option key={option.key} value={option.key}>{option.label}{option.direction === 'asc' ? ' ↑' : ' ↓'}</option>)}
            </select>
          </label>
          <label style={{display:'flex',alignItems:'center',gap:6,...sans({fontSize:10,color:C.text2,fontWeight:700})}}>
            <span>Player</span>
            <input aria-label="Filter roster insights by player name" value={rosterPlayerQuery} onChange={event=>{setActiveRosterPreset(null);setRosterQuickFilter(null);setRosterPlayerQuery(event.target.value)}} placeholder="Search name or position" style={{height:30,width:152,padding:'0 8px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text,fontSize:10}} />
          </label>
          <button type="button" aria-label={`Reverse roster insights sort direction; currently ${rosterSortDirection === 'asc' ? 'ascending' : 'descending'}`} aria-pressed={rosterSortDirection === 'asc'} onClick={()=>{setActiveRosterPreset(null);setRosterQuickFilter(null);setRosterSortDirection(direction=>direction === 'asc' ? 'desc' : 'asc')}} style={{height:30,padding:'0 9px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text2,fontSize:10,fontWeight:800,cursor:'pointer'}}>{rosterSortDirection === 'asc' ? 'ASC ↑' : 'DESC ↓'}</button>
          {rosterSortOption.group !== 'all' && <label style={{display:'flex',alignItems:'center',gap:6,...sans({fontSize:10,color:C.text2,fontWeight:700})}}>
            <span>Min {rosterSortOption.group === 'hitting' ? 'PA' : 'IP'}</span>
            <select aria-label={`Minimum ${rosterSortOption.group === 'hitting' ? 'plate appearances' : 'innings pitched'}`} value={activeMinimum} onChange={e=>{setActiveRosterPreset(null);setRosterQuickFilter(null);rosterSortOption.group === 'hitting' ? setMinBattingPa(Number(e.target.value)) : setMinPitchingIp(Number(e.target.value))}} style={{height:30,padding:'0 8px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text,fontSize:10,cursor:'pointer'}}>
              {(rosterSortOption.group === 'hitting' ? [[0,'Any PA'],[50,'50+ PA'],[150,'150+ PA'],[300,'300+ PA']] : [[0,'Any IP'],[10,'10+ IP'],[30,'30+ IP'],[60,'60+ IP']]).map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>}
          <span style={{marginLeft:'auto',...px({fontSize:9.5,color:C.text4})}}>{filteredRosterRows.length} {filteredRosterRows.length === 1 ? 'player' : 'players'} · {rosterSortOption.label}</span>
          {rosterHasFilters && <button type="button" onClick={()=>{setSelectedRosterPositions([]);setRosterSort('name');setRosterSortDirection('asc');setRosterPlayerQuery('');setMinBattingPa(Number(rosterDefaults.battingPa) || 0);setMinPitchingIp(Number(rosterDefaults.pitchingIp) || 0);setActiveRosterPreset(null);setRosterQuickFilter('all')}} style={{height:28,padding:'0 8px',border:`1px solid ${C.border}`,borderRadius:6,background:C.surface,color:C.text3,fontSize:9.5,fontWeight:700,cursor:'pointer'}}>Clear filters</button>}
        </div>
        <div className="roster-insight-leaders" style={{padding:'8px 14px 4px'}}>
          {teamPlayersLoading && <RosterInsightsTableSkeleton />}
          {!teamPlayersLoading && !teamPlayersError && filteredRosterRows.length > 0 && <div className="skip-roster-insights-table-wrap"><table className="skip-roster-insights-table" aria-label={`Roster insights sorted by ${rosterSortOption.label}`}><thead><tr><th scope="col">Player</th><th scope="col">Pos.</th><th scope="col">Sample</th><th scope="col"><button type="button" onClick={()=>{setActiveRosterPreset(null);setRosterQuickFilter(null);setRosterSortDirection(direction=>direction === 'asc' ? 'desc' : 'asc')}} aria-label={`Toggle ${rosterSortOption.label} sort direction`}>{rosterSortOption.label} {rosterSortDirection === 'asc' ? '↑' : '↓'}</button></th></tr></thead><tbody>{filteredRosterRows.map(row => <tr key={`${row.group}-${row.id}`}><th scope="row">{row.name}</th><td>{row.position || '—'}</td><td>{formatRosterSampleLabel(row.group, activeMinimum)}</td><td>{formatRosterStat(row, rosterSortOption)}</td></tr>)}</tbody></table></div>}
          {!teamPlayersLoading && teamPlayersError && <OverviewEmptyState status="Unavailable" message="Roster leader data" detail="The current MLB roster leader feed did not return verified rows." />}
          {!teamPlayersLoading && !teamPlayersError && !filteredRosterRows.length && <OverviewEmptyState status="No matching rows" message="Roster leaders" detail="No roster players match the selected positions, name search, stat, and sample threshold." />}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:0,marginTop:8}}>
          {[
            {label:'Strengths', items:displayedInsights.strengths, color:C.teal, soft:C.tealSoft, empty:'No qualifying strength signal yet.'},
            {label:'Weaknesses', items:displayedInsights.weaknesses, color:C.rust, soft:C.rustSoft, empty:'No qualifying weakness signal yet.'},
          ].map((group, groupIndex) => (
            <div key={group.label} style={{padding:'8px 14px 12px',borderRight:groupIndex===0?`0.5px solid ${C.borderLight}`:'none'}}>
              <div style={sans({fontSize:9.5,fontWeight:800,color:group.color,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:7})}>{group.label}</div>
              {group.items.length ? group.items.map(item => (
                <div key={item.title} style={{padding:'8px 9px',marginBottom:6,borderRadius:6,background:group.soft,border:`0.5px solid ${group.color}33`}}>
                  <div style={sans({fontSize:11.5,fontWeight:800,color:C.text})}>{item.title}</div>
                  <div style={sans({fontSize:10,color:C.text2,lineHeight:1.4,marginTop:3})}>{item.detail}</div>
                  <div style={px({fontSize:9.5,color:group.color,fontWeight:700,marginTop:5})}>{item.evidence}</div>
                </div>
              )) : <div style={sans({fontSize:10,color:C.text3,fontStyle:'italic'})}>{group.empty}</div>}
            </div>
          ))}
        </div>
        <div style={{padding:'8px 14px',borderTop:`0.5px solid ${C.borderLight}`,...sans({fontSize:9.5,color:C.text4})}}>
          Source: {displayedInsights.source}. {aiInsightsState === 'error' ? 'AI service unavailable; showing local roster analysis. ' : ''}This is decision support, not a replacement for staff scouting review.
        </div>
      </Panel>}

      {overviewView === 'performance' && <div id="team-overview-performance" role="tabpanel">
      {/* ── ROW 1: Tables | Radars + Run Diff | Standings + Grade ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'minmax(160px,190px) 1fr minmax(168px,210px)',gap:14,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="Offense" accent={teamAccent} badge="2026">
            {offRows.map(([l,v],i)=><KVRow key={l} label={l} value={v} last={i===offRows.length-1}/>)}
          </Panel>
          <Panel title="Pitching" accent={teamAccent}>
            {pitRows.map(([l,v],i)=><KVRow key={l} label={l} value={v} last={i===pitRows.length-1}/>)}
          </Panel>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:14,minWidth:0}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <Panel title="Offensive Profile" accent={teamAccent} badge={D.offenseData.length ? 'MLB Stats API' : 'Unavailable'}>
              {D.offenseData.length ? <Suspense fallback={<ChartFallback height={196}/> }>
                <OffenseRadar data={D.offenseData} accent={teamAccent}/>
              </Suspense> : <OverviewEmptyState message="Offensive profile unavailable" detail="No verified current-season hitting aggregates were returned by the MLB Stats API." />}
              <div style={sans({padding:'0 12px 9px',fontSize:9,color:C.text4})}>Source: {D.radarSource}.</div>
            </Panel>
            <Panel title="Team Strengths" accent={teamAccent} badge={D.strengthData.length ? 'MLB Stats API' : 'Unavailable'}>
              {D.strengthData.length ? <Suspense fallback={<ChartFallback height={196}/> }>
                <StrengthRadar data={D.strengthData} accent={teamAccent} showLeagueBenchmark={D.hasLeagueBenchmark}/>
              </Suspense> : <OverviewEmptyState message="Team strengths unavailable" detail="No verified current-season team aggregates were returned by the MLB Stats API." />}
              <div style={sans({padding:'0 12px 9px',fontSize:9,color:C.text4,lineHeight:1.4})}>{getStrengthRadarBenchmarkCaption({hasLeagueBenchmark:D.hasLeagueBenchmark,leagueTeamCount:D.leagueTeamCount,radarSource:D.radarSource})}</div>
            </Panel>
          </div>
          <Panel title={`Run Differential — ${CURRENT_SEASON}`} accent={teamAccent} badge={liveRunDiffData.length ? 'MLB Stats API' : 'Unavailable'}>
            <div style={{padding:'8px 2px 4px'}}>
              {liveRunDiffData.length ? <Suspense fallback={<ChartFallback height={144}/> }>
                <RunDiffChart data={liveRunDiffData} accent={teamAccent}/>
              </Suspense> : <OverviewEmptyState message="Run differential unavailable" detail="No verified current-season MLB Stats API rollup was returned." />}
            </div>
            <div style={sans({padding:'0 12px 9px',fontSize:9,color:C.text4})}>Source: MLB Stats API standings · current-season cumulative snapshot.</div>
          </Panel>
        </div>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title={`${D.divName} Standings`} accent={teamAccent}>
            <table style={{width:'100%',borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:C.surface2}}>
                  {['Team','W','L','PCT'].map(h=>(
                    <th key={h} style={{padding:'6px 10px',fontSize:10,fontWeight:700,letterSpacing:'.05em',textTransform:'uppercase',color:C.text2,textAlign:h==='Team'?'left':'right',borderBottom:`0.5px solid ${C.border}`,whiteSpace:'nowrap'}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {D.standings.map((r,i)=>(
                  <tr key={i} style={{background:r.cur?`color-mix(in srgb, ${teamAccent} 14%, transparent)`:'transparent'}}>
                    <td style={{padding:'6px 10px',fontWeight:r.cur?700:500,color:C.text,fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:12}}>{r.abbr}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.w}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{r.l}</td>
                    <td style={{padding:'6px 10px',textAlign:'right',fontFamily:"'DM Mono',monospace",fontSize:11,color:C.text}}>{fmtWinPct(r.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
          <Panel title="Evaluation Context" accent={OVERVIEW_ACCENTS.context} badge="Canonical">
            <div style={{padding:'12px 14px'}}>
              <div style={sans({fontSize:11,fontWeight:800,color:C.text})}>One authoritative team evaluation</div>
              <div style={sans({fontSize:9.5,color:C.text3,lineHeight:1.45,marginTop:5})}>The overall team rating, its 4.30 scale, source coverage, and calculation details are maintained only in Front Office Evaluation. This avoids competing rating formulas across workspaces.</div>
              <button type="button" onClick={() => {
                setOverviewView('briefing');
                window.setTimeout(() => document.getElementById('team-overview-front-office-evaluation')?.scrollIntoView?.({ behavior:'smooth', block:'center' }), 0);
              }} aria-label="Open canonical Front Office Evaluation" style={{marginTop:10,padding:'6px 8px',border:`1px solid ${C.purple}`,borderRadius:5,background:C.surface,color:C.purple,cursor:'pointer',...sans({fontSize:9,fontWeight:800})}}>OPEN FRONT OFFICE EVALUATION →</button>
            </div>
          </Panel>
        </div>
      </div>

      {/* ── ROW 2: Batted Ball Profile | Pitch Arsenal | Contact Quality ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Batted Ball Profile — same honesty treatment as PlayersPage's
             SprayChart/PlateDisciplineZone: seeded from real team stats,
             not real tracked batted-ball data. Was flagged in this doc's
             notes twice before as lower-priority than the player-level
             fix (decorative, not sitting beside real per-player Statcast
             panels) — fixing it now that a debug pass finally had room
             for it, since "lower priority" isn't the same as "not a real
             gap", and half this page turned out to share the pattern. */}
        <Panel title="Batted Ball Profile" accent={OVERVIEW_ACCENTS.offense}>
          <div className="skip-overview-panel-status" role="status" aria-label="Batted Ball Profile data source"><span>Source</span><OverviewSourceBadge provider="Savant" status={bb ? (teamSavantSource?.includes('rollup') ? 'estimated' : 'verified') : teamSavantState === 'loading' ? 'loading' : 'coverage-gap'} /></div>
          {bb ? (
          <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:0}}>
            {[
              ['Barrel %',     formatPanelMetric(bb.barrelPct, '%'), C.text],
              ['Hard Hit %',   formatPanelMetric(bb.hardHitPct, '%'), C.text],
              ['Sweet Spot %', formatPanelMetric(bb.sweetSpot, '%'), C.text],
              ['Avg EV',       formatPanelMetric(bb.avgEV, ' mph'), C.text],
              ['Max EV',       formatPanelMetric(bb.maxEV, ' mph'), C.text],
              ['Launch Angle', formatPanelMetric(bb.launchAngle, '°'), C.text],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{padding:'8px 14px',borderBottom:i<3?`0.5px solid ${C.borderLight}`:'none',borderRight:i%3!==2?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={sans({fontSize:9.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:2})}>{l}</div>
                <div style={px({fontSize:16,fontWeight:800,color:c})}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{borderTop:`0.5px solid ${C.border}`,padding:'10px 14px'}}>
            <div style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8})}>Spray Direction</div>
            <div style={{display:'flex',gap:10,marginBottom:8}}>
              {[['Pull %',formatPanelMetric(bb.pullPct, '%')],['Center %',formatPanelMetric(bb.centerPct, '%')],['Oppo %',formatPanelMetric(bb.oppoPct, '%')]].map(([l,v])=>(
                <div key={l} style={{flex:1,textAlign:'center',background:C.surface2,borderRadius:6,padding:'6px 4px'}}>
                  <div style={px({fontSize:14,fontWeight:800,color:C.text})}>{v}</div>
                  <div style={sans({fontSize:9,color:C.text3,marginTop:2})}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:10}}>
              {[['GB %',formatPanelMetric(bb.gbPct, '%'),C.text],['FB %',formatPanelMetric(bb.fbPct, '%'),C.text],['LD %',formatPanelMetric(bb.ldPct, '%'),C.text]].map(([l,v,c])=>(
                <div key={l} style={{flex:1,textAlign:'center',background:C.surface2,borderRadius:6,padding:'6px 4px'}}>
                  <div style={px({fontSize:14,fontWeight:800,color:c})}>{v}</div>
                  <div style={sans({fontSize:9,color:C.text3,marginTop:2})}>{l}</div>
                </div>
              ))}
            </div>
            <div style={sans({fontSize:9,color:C.text4,marginTop:8,lineHeight:1.4})}>
              Sample: {bb.sampleSize?.toLocaleString() || '—'} batted balls.
            </div>
          </div>
          </div>
          ) : (
              <OverviewEmptyState status={teamSavantState === 'loading' ? 'Loading' : 'Unavailable'} message="Team batted-ball rows" detail={teamSavantState === 'loading' ? 'Checking the verified Baseball Savant team and roster feed.' : 'No verified Baseball Savant batted-ball rows were returned for this season.'} />
          )}
        </Panel>

        {/* Pitch Arsenal */}
        <Panel title="Pitch Arsenal" accent={OVERVIEW_ACCENTS.pitching}
          badge={arsenal ? <div style={{display:'flex',gap:6}}>

            {[['Usage','usage'],['Grades','grades']].map(([l,k])=>(
              <button key={k} onClick={()=>setArsenalTab(k)} aria-pressed={arsenalTab===k}
                style={{padding:'2px 8px',fontSize:10,fontFamily:"'DM Mono',monospace",fontWeight:700,
                  background:arsenalTab===k?`color-mix(in srgb, ${teamAccent} 14%, transparent)`:C.surface3,color:arsenalTab===k?teamAccent:C.text3,
                  border:'none',borderRadius:4,cursor:'pointer'}}>
                {l}
              </button>
            ))}
          </div> : null}>
          <div className="skip-overview-panel-status" role="status" aria-label="Pitch Arsenal data source"><span>Source</span><OverviewSourceBadge provider="Savant" status={arsenal ? 'verified' : teamSavantState === 'loading' ? 'loading' : 'coverage-gap'} /></div>
          {arsenal ? (arsenalTab === 'usage' ? (
            <div style={{display:'flex',gap:0,alignItems:'stretch'}}>
              {/* Donut */}
              <div style={{width:140,flexShrink:0,padding:'8px 0'}}>
                <Suspense fallback={<ChartFallback height={130}/>}>
                  <ArsenalPie data={arsenal}/>
                </Suspense>
              </div>
              {/* Legend */}
              <div style={{flex:1,padding:'12px 14px',display:'flex',flexDirection:'column',gap:6,justifyContent:'center'}}>
                {arsenal.map(p=>(
                  <div key={p.type} style={{display:'flex',alignItems:'center',gap:7}}>
                    <div style={{width:9,height:9,borderRadius:2,background:p.color,flexShrink:0}}/>
                    <span style={sans({fontSize:11,color:C.text2,flex:1})}>{p.type}</span>
                    <span aria-label={`${p.type} usage ${p.pct == null ? 'unavailable' : `${p.pct.toFixed(1)} percent`}`} style={px({fontSize:12,fontWeight:700,color:p.color})}>{p.pct == null ? '—' : `${p.pct.toFixed(1)}%`}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{padding:'4px 0'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',padding:'6px 14px',borderBottom:`0.5px solid ${C.border}`,gap:8}}>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>Pitch</span>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>Stuff+</span>
                <span style={sans({fontSize:9.5,fontWeight:700,color:C.text3,textTransform:'uppercase',letterSpacing:'.06em'})}>MLB Rank</span>
              </div>
              {arsenal.map((p,i,arr)=>{
                const rank = p.stuffPlus == null ? null : Math.round(3 + (1 - p.stuffPlus/120) * 25);
                const col = p.stuffPlus == null ? C.text3 : p.stuffPlus >= 110 ? C.teal : p.stuffPlus >= 100 ? C.amber : C.slate;
                return (
                  <div key={p.type} style={{display:'grid',gridTemplateColumns:'1fr auto auto',padding:'7px 14px',gap:8,borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none',alignItems:'center'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <div style={{width:7,height:7,borderRadius:'50%',background:p.color,flexShrink:0}}/>
                      <span style={sans({fontSize:11,color:C.text})}>{p.type}</span>
                    </div>
                    <span style={px({fontSize:12,fontWeight:700,color:col})}>{formatPanelMetric(p.stuffPlus)}</span>
                    <span style={{...px({fontSize:10,fontWeight:700,color:col}),background:`color-mix(in srgb, ${col} 9%, transparent)`,padding:'1px 7px',borderRadius:10,textAlign:'center'}}>{rank == null ? '—' : ord(rank)}</span>
                  </div>
                );
              })}
            </div>
          )) : (
              <OverviewEmptyState status={teamSavantState === 'loading' ? 'Loading' : 'Unavailable'} message="Team pitch arsenal rows" detail={teamSavantState === 'loading' ? 'Checking the verified Baseball Savant roster pitch rollup.' : 'No verified Baseball Savant pitch rows were returned for this season.'} />
          )}
          <div style={sans({fontSize:9,color:C.text4,padding:'0 14px 8px',lineHeight:1.4})}>
            Verified pitch rows · Stuff+ unavailable.
          </div>
        </Panel>

        {/* Contact Quality Allowed + Position OAA */}
        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="Contact Quality Allowed" accent={OVERVIEW_ACCENTS.pitching}>
            <div className="skip-overview-panel-status" role="status" aria-label="Contact Quality Allowed data source"><span>Source</span><OverviewSourceBadge provider="Savant" status={contactAllowed.sampleSize ? 'verified' : teamSavantState === 'loading' ? 'loading' : 'coverage-gap'} /></div>
            {contactAllowed.sampleSize ? (
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0}}>
                {[['xwOBA', contactAllowed.xwoba == null ? '—' : contactAllowed.xwoba.toFixed(3)], ['Avg EV', contactAllowed.exitVelocity == null ? '—' : `${contactAllowed.exitVelocity.toFixed(1)} mph`], ['Hard-hit', contactAllowed.hardHitPct == null ? '—' : `${contactAllowed.hardHitPct.toFixed(1)}%`]].map(([label,value]) => <div key={label} style={{padding:'18px 10px',textAlign:'center',borderRight:`0.5px solid ${C.borderLight}`}}><div style={px({fontSize:17,fontWeight:800,color:C.text})}>{value}</div><div style={sans({fontSize:8.5,color:C.text3,textTransform:'uppercase',letterSpacing:'.05em',marginTop:4})}>{label}</div></div>)}
                <div style={sans({gridColumn:'1 / -1',padding:'7px 14px 10px',fontSize:9,color:C.text4})}>Sample: {contactAllowed.sampleSize.toLocaleString()} opponent batted-ball rows.</div>
              </div>
            ) : <OverviewEmptyState message="Opponent contact quality" detail="Baseball Savant did not return verified opponent batted-ball rows for this season." />}
          </Panel>

          {/* Player count is derived from verified roster rows; OAA comes from the separately sourced Statcast leaderboard. */}
          <Panel title="Position Breakdown" accent={OVERVIEW_ACCENTS.defense} badge={<OverviewSourceBadge provider="Savant" status={oaaHealthStatus} />}>
            {teamRollups.positions.length ? teamRollups.positions.slice(0, 8).map((row, index) => (
              <div key={row.position} style={{display:'flex',justifyContent:'space-between',padding:'7px 14px',borderBottom:index<Math.min(teamRollups.positions.length,8)-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <span style={sans({fontSize:11,color:C.text2})}>{row.position}</span>
                <span style={px({fontSize:11,fontWeight:700,color:teamAccent})}>{row.players} player{row.players === 1 ? '' : 's'}</span>
              </div>
            )) : <div style={sans({padding:'20px 14px',fontSize:10,color:C.text3})}>Roster rows are still loading.</div>}
            <div style={sans({padding:'8px 14px',fontSize:9,color:C.text4,lineHeight:1.4})}>Verified player-count coverage from the current MLB season feed. The map below uses separately returned Baseball Savant OAA and does not claim starter or backup depth.</div>
            <DefensiveOaaFieldMap playerRows={teamOaaData?.playerRows} status={oaaHealthStatus === 'loading' ? 'loading' : oaaHealthStatus} source={teamOaaData?.source} />
          </Panel>
        </div>
      </div>

      {/* ── ROW 2b: Baserunning | EV Distribution | Spray Chart ── */}
      <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14,alignItems:'start'}}>

        {/* Baserunning */}
        <Panel title="Baserunning" accent={OVERVIEW_ACCENTS.defense} badge={<OverviewSourceBadge status="verified" />}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:0,borderBottom:`0.5px solid ${C.border}`}}>
            {[
              ['SB', teamRollups.stolenBases ?? team.sb, C.teal],
              ['Attempts', teamRollups.stolenBaseAttempts ?? 'Unavailable', teamRollups.stolenBaseAttempts == null ? C.text4 : C.teal],
              ['XB Hits', teamRollups.extraBaseHits ?? 'Unavailable', teamRollups.extraBaseHits == null ? C.text4 : C.teal],
            ].map(([l,v,c],i)=>(
              <div key={l} style={{padding:'12px 10px',textAlign:'center',borderRight:i<2?`0.5px solid ${C.borderLight}`:'none'}}>
                <div style={px({fontSize:22,fontWeight:800,color:c,lineHeight:1})}>{v}</div>
                <div style={sans({fontSize:9.5,color:C.text3,marginTop:4,textTransform:'uppercase',letterSpacing:'.05em'})}>{l}</div>
              </div>
            ))}
          </div>
          <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
            {[
              ['Sprint Speed','Unavailable', C.text4],
              ['Stolen Base Attempts',teamRollups.stolenBaseAttempts ?? 'Unavailable', teamRollups.stolenBaseAttempts == null ? C.text4 : C.teal],
              ['Caught Stealing', teamRollups.caughtStealing ?? 'Unavailable', teamRollups.caughtStealing == null ? C.text4 : C.teal],
              ['MLB Rank (BsR)',  'Unavailable', C.text4],
              ['Extra Base Rate', teamRollups.extraBaseRate == null ? 'Unavailable' : `${(teamRollups.extraBaseRate * 100).toFixed(1)}%`, teamRollups.extraBaseRate == null ? C.text4 : C.teal],
            ].map(([l,v,c],i,arr)=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'5px 0', borderBottom:i<arr.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                <span style={sans({fontSize:11,color:C.text2})}>{l}</span>
                <span style={px({fontSize:11,fontWeight:700,color:c})}>{v}</span>
              </div>
            ))}
            <div style={sans({fontSize:9,color:C.text4,paddingTop:2,lineHeight:1.4})}>
              Stolen bases, attempts, caught stealing, and extra-base hits are rolled up from verified player rows. Sprint speed, BsR, and league rank still require dedicated Statcast or play-by-play feeds.
            </div>
          </div>
        </Panel>

        <Panel title="Exit Velocity Distribution" accent={OVERVIEW_ACCENTS.offense} badge={teamExitVelocityState === 'ready' ? 'Savant' : 'Coverage gap'}>
          {teamExitVelocityState === 'ready' ? (
            <div>
              <Suspense fallback={<ChartFallback height={130} />}>
                <EvDistributionChart data={evBins} accent={teamAccent} />
              </Suspense>
              <div style={sans({fontSize:9,color:C.text4,padding:'0 14px 8px',lineHeight:1.4})}>
                Source: {teamExitVelocitySource} · {teamExitVelocityRows.length.toLocaleString()} batted balls · 5 mph bins.
              </div>
            </div>
          ) : (
              <OverviewEmptyState message="Team exit velocity" detail="Baseball Savant did not return verified team batted-ball rows for this season. Individual player panels remain available." />
          )}
        </Panel>

        <Panel title="Spray Chart" accent={OVERVIEW_ACCENTS.offense} badge={sprayRows.length ? 'Savant' : 'Unavailable'}>
          {sprayRows.length ? <div style={{padding:'10px 14px 8px'}}><svg viewBox="0 0 260 150" role="img" aria-label="Verified Baseball Savant batted-ball spray coordinates" style={{width:'100%',height:150,background:'linear-gradient(180deg, rgba(21,112,112,.06), transparent)',borderRadius:6}}><path d="M130 142 L28 22 M130 142 L232 22" stroke={C.border} strokeWidth="1" fill="none"/><path d="M130 142 L130 18" stroke={C.border} strokeWidth="1" fill="none"/>{sprayRows.map((row,index) => { const x = Math.max(20, Math.min(240, 130 + ((Number(row.hc_x) - 125) * 0.85))); const y = Math.max(18, Math.min(138, 142 - ((Number(row.hc_y) - 30) * 0.55))); const color = row.bb_type === 'ground_ball' ? C.teal : row.bb_type === 'fly_ball' ? C.amber : row.bb_type === 'line_drive' ? C.rust : C.slate; return <circle key={`${row.hc_x}-${row.hc_y}-${index}`} cx={x} cy={y} r="2.2" fill={color} opacity=".72"/>; })}</svg><div style={sans({fontSize:9,color:C.text4,lineHeight:1.4,marginTop:5})}>Source: Baseball Savant · {sprayRows.length.toLocaleString()} verified batted-ball coordinates. Raw Savant coordinate view; points are not estimated.</div></div> : <OverviewEmptyState message="Team spray coordinates" detail="Baseball Savant did not return verified team batted-ball coordinates for this season." />}
        </Panel>
      </div>
      </div>}

      {/* ── ROW 3: League Rankings + Pct Bars | Splits Dashboard ── */}
      {overviewView === 'operations' && <div className="overview-responsive-grid" style={{display:'grid',gridTemplateColumns:'minmax(190px,220px) 1fr',gap:14,alignItems:'start'}}>

        <div style={{display:'flex',flexDirection:'column',gap:12}}>
          <Panel title="League Rankings" accent={teamAccent} badge="MLB">
            {D.leagueRanks.map(({label,rank,val},i)=>{
              const color=rank<=3?C.teal:rank<=7?C.amber:rank<=12?C.slate:C.rust;
              return (
                <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 14px',borderBottom:i<D.leagueRanks.length-1?`0.5px solid ${C.borderLight}`:'none'}}>
                  <span style={sans({fontSize:11,color:C.text2})}>{label}</span>
                  <div style={{display:'flex',alignItems:'center',gap:7}}>
                    <span style={px({fontSize:10,color:C.text4})}>{val}</span>
                    <span style={{...px({fontSize:11,fontWeight:700,color}),background:`color-mix(in srgb, ${color} 9%, transparent)`,padding:'1px 7px',borderRadius:10,minWidth:42,textAlign:'center'}}>{percentileLabel(rank)}</span>
                  </div>
                </div>
              );
            })}
          </Panel>
          <Panel title="Team Percentile Rankings" accent={teamAccent} badge="vs MLB">
            <div style={{padding:'10px 14px',display:'flex',flexDirection:'column',gap:6}}>
              {D.pctBars.map(({lbl,pct,color})=>(
                <div key={lbl}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:2}}>
                    <span style={sans({fontSize:10.5,fontWeight:600,color:C.text2})}>{lbl}</span>
                    <span style={px({fontSize:10.5,fontWeight:700,color})}>{percentileLabel(pct)}</span>
                  </div>
                  <div role="img" aria-label={pct == null ? `${lbl} percentile unavailable` : `${lbl} percentile ${percentileLabel(pct)}`} style={{height:6,background:`linear-gradient(to right, ${C.rust} 0%, ${C.amber} 50%, ${C.teal} 100%)`,borderRadius:3,position:'relative',opacity:pct == null ? .45 : 1}}>
                    <div style={{position:'absolute',top:'50%',left:'50%',height:10,width:1,background:`color-mix(in srgb, ${C.border} 70%, transparent)`,transform:'translateY(-50%)'}}/>
                    {pct != null && <div aria-hidden="true" style={{position:'absolute',top:'50%',left:`${Math.max(0,Math.min(100,pct))}%`,width:10,height:10,borderRadius:'50%',background:C.surface,border:`2px solid ${color}`,boxShadow:`0 0 0 1px ${C.surface}`,transform:'translate(-50%,-50%)'}}/>}
                  </div>
                </div>
              ))}
              <div style={px({fontSize:9,color:C.text4,textAlign:'center',marginTop:2})}>50th = MLB Average</div>
            </div>
          </Panel>
        </div>

        <Panel title="Splits Dashboard" accent={teamAccent}>
          <div style={{display:'flex',borderBottom:`0.5px solid ${C.border}`}}>
            {[['home','Home / Away'],['hand','vs LHP / RHP'],['time','Day / Night']].map(([k,l])=>(
              <button key={k} onClick={()=>setSplitTab(k)} aria-pressed={splitTab===k}
                style={{padding:'8px 16px',fontSize:11,fontFamily:"'Plus Jakarta Sans',sans-serif",fontWeight:600,color:splitTab===k?teamAccent:C.text3,borderBottom:splitTab===k?`2px solid ${teamAccent}`:'2px solid transparent',borderTop:'none',borderLeft:'none',borderRight:'none',background:'transparent',cursor:'pointer',transition:'all .12s',whiteSpace:'nowrap'}}>
                {l}
              </button>
            ))}
          </div>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead>
              <tr style={{background:C.surface2}}>
                {['Split','W–L','OPS','ERA'].map(h=>(
                  <th key={h} style={{padding:'7px 14px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:C.text2,textAlign:h==='Split'?'left':'right',borderBottom:`0.5px solid ${C.border}`}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teamSplitsState === 'loading' ? (
                <tr><td colSpan={4} style={sans({padding:'28px 14px',fontSize:10.5,color:C.text3,textAlign:'center',lineHeight:1.5})}>Loading verified completed-game splits…</td></tr>
              ) : splitRows.length ? splitRows.map((row,i)=>(
                <tr key={i} style={{borderBottom:i<splitRows.length-1?`0.5px solid ${C.borderLight}`:'none'}}
                  onMouseEnter={e=>e.currentTarget.style.background=C.amberSoft}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <td style={sans({padding:'9px 14px',fontSize:12,fontWeight:700,color:C.text})}>{row.split}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.navy})}>{row.w}–{row.l}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.amber,fontWeight:700})}>{row.ops}</td>
                  <td style={px({padding:'9px 14px',fontSize:12,textAlign:'right',color:C.rust})}>{row.era}</td>
                </tr>
              )) : (
                <tr><td colSpan={4} style={sans({padding:'28px 14px',fontSize:10.5,color:C.text3,textAlign:'center',lineHeight:1.5})}>Split statistics unavailable in the current MLB team aggregate feed. No estimated rows are shown.</td></tr>
              )}
            </tbody>
          </table>
          <div style={{padding:'16px 14px',borderTop:`0.5px solid ${C.border}`}}>
            <div style={sans({fontSize:10.5,color:C.text3,lineHeight:1.5})}>{teamSplitsState === 'loading' ? 'Completed-game split results load only when this Operations workspace is opened.' : splitRows.length ? 'W–L is derived from completed MLB schedule games. OPS and ERA require per-game boxscore aggregation and remain unavailable in this view.' : 'No verified completed schedule rows were returned for the selected team. No estimated split rows are shown.'}</div>
          </div>
        </Panel>

      </div>}

      {/* ── Live Schedule ── */}
      {overviewView === 'operations' && (
        <Panel title="Today's Schedule" accent={C.rust} badge={
          todayGamesState === 'loading' ? 'Loading MLB' : todayGamesState === 'unavailable' ? 'Unavailable' : todayGamesState === 'empty' ? 'No games today' : <div style={{display:'flex',alignItems:'center',gap:5}}><div style={{width:6,height:6,borderRadius:'50%',background:C.teal,animation:'pulse 1.6s ease-in-out infinite'}}/><span style={{fontFamily:"'DM Mono',monospace",fontSize:10,color:C.teal}}>LIVE</span></div>
        }>
          {todayGamesState === 'loading' ? <OverviewEmptyState status="Loading" message="Today’s MLB schedule" detail="Loading the official MLB schedule." /> : todayGamesState === 'unavailable' ? <OverviewEmptyState message="Today’s MLB schedule" detail="The official MLB schedule is temporarily unavailable. Use the provider retry control to request a fresh feed." /> : todayGamesState === 'empty' ? <OverviewEmptyState status="No games today" message="Today’s MLB schedule" detail="The official MLB schedule returned no games for today." /> : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:0}}>
            {todayGames.map((g,i)=>{
              const live=g.inning&&g.status!=='Final'&&g.statusCode!=='F';
              const status=g.status==='Final'?'Final':g.inning?`${g.inningHalf==='top'?'▲':'▼'}${g.inning}`:g.status||'Pre';
              const awayW=g.away.runs!=null&&g.home.runs!=null&&g.away.runs>g.home.runs;
              const homeW=g.away.runs!=null&&g.home.runs!=null&&g.home.runs>g.away.runs;
              return (
                <div key={g.gamePk} style={{padding:'10px 14px',borderBottom:`0.5px solid ${C.borderLight}`,
                  borderRight:(i+1)%4!==0?`0.5px solid ${C.borderLight}`:'none',
                  background:live?`color-mix(in srgb, ${C.teal} 2%, transparent)`:'transparent'}}>
                  <div style={{display:'flex',justifyContent:'space-between',marginBottom:5}}>
                    <span style={{...px({fontSize:9.5,fontWeight:700}),color:live?C.teal:C.text3,
                      background:live?C.tealSoft:C.surface2,padding:'1px 6px',borderRadius:3}}>
                      {live&&'● '}{status}
                    </span>
                  </div>
                  {[{t:g.away,w:awayW},{t:g.home,w:homeW}].map(({t:tm,w},j)=>(
                    <div key={j} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:2}}>
                      <span style={sans({fontSize:11,fontWeight:w?800:500,color:w?C.text:C.text2})}>{tm.abbr||tm.name}</span>
                      <span style={{...px({fontSize:15,fontWeight:800,lineHeight:1}),color:w?C.amber:C.text}}>{tm.runs??'–'}</span>
                    </div>
                  ))}
                  <div style={sans({fontSize:9,color:C.text3,marginTop:6,display:'flex',justifyContent:'space-between',gap:8,alignItems:'center'})}>
                    <span>{g.venue || 'Venue unavailable'}{todayGameMetadata[g.gamePk]?.weather?.temp ? ` · ${todayGameMetadata[g.gamePk].weather.temp}` : todayGameMetadata[g.gamePk]?.status === 'unavailable' ? ' · Weather unavailable' : ''}</span>
                    <a href={todayGameMetadata[g.gamePk]?.mediaUrl || `https://www.mlb.com/gameday/${g.gamePk}`} target="_blank" rel="noreferrer" style={{color:C.navy,fontWeight:700,textDecoration:'none'}}>MLB Gameday ↗</a>
                  </div>
                </div>
              );
            })}
          </div>}
        </Panel>
      )}
    </div>
  );
}

// Memoized: takes no props, so App re-rendering (e.g. the 30s live-ticker
// poll) doesn't force this whole page to re-render while it's on screen.
export default memo(OverviewPage);
