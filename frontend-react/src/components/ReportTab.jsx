import React, { useState, useRef, useMemo } from 'react';
import {
  Trophy,
  Download,
  AlertTriangle,
  FileText,
  TrendingUp,
  Award,
  BarChart3,
  Target,
  Flame,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Compass,
  ArrowUpRight,
  Percent,
  Activity,
  Layers,
  Sparkles,
  SlidersHorizontal,
  Code2,
  User,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  LineChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';

export default function ReportTab({ data, loading, onGenerateReport, cfHandle, lcHandle }) {
  const reportRef = useRef(null);
  const [activeChart, setActiveChart] = useState('auto');

  // Extract data safely (empty objects when no data yet)
  const { cf_data: cf = {}, lc_data: lc = {}, analysis: an = {}, report_markdown = '', errors = [] } = data || {};

  // ALL hooks must be called unconditionally (before any early return)
  const cfContestHistory = useMemo(() => {
    return (cf.contest_history || []).map((c, i) => ({
      contest: c.contestName ? `#${i + 1}` : `#${i + 1}`,
      name: c.contestName || `Round ${i + 1}`,
      rating: c.newRating,
      rank: c.rank,
      change: c.newRating - c.oldRating,
      platform: 'Codeforces'
    }));
  }, [cf.contest_history]);

  const lcContestHistory = useMemo(() => {
    const raw = lc.contest_history || [];
    const attended = raw.filter(c => c.attended && (c.rating > 0 || c.ranking > 0));
    return attended.map((c, i) => ({
      contest: `#${i + 1}`,
      name: c.contestName || `LC Contest ${i + 1}`,
      rating: Math.round(c.rating || 0),
      rank: c.ranking,
      solved: c.problemsSolved !== undefined ? `${c.problemsSolved}/${c.totalProblems || 4}` : undefined,
      platform: 'LeetCode'
    }));
  }, [lc.contest_history]);

  const dualContestHistory = useMemo(() => {
    const maxLen = Math.max(cfContestHistory.length, lcContestHistory.length);
    const combined = [];
    for (let i = 0; i < maxLen; i++) {
      combined.push({
        contest: `#${i + 1}`,
        cfRating: cfContestHistory[i]?.rating || null,
        lcRating: lcContestHistory[i]?.rating || null,
        cfName: cfContestHistory[i]?.name,
        lcName: lcContestHistory[i]?.name,
      });
    }
    return combined;
  }, [cfContestHistory, lcContestHistory]);

  const currentChartMode = useMemo(() => {
    if (activeChart !== 'auto') return activeChart;
    if (cfContestHistory.length > 0 && lcContestHistory.length > 0) return 'cf';
    if (lcContestHistory.length > 0) return 'lc';
    return 'cf';
  }, [activeChart, cfContestHistory.length, lcContestHistory.length]);

  // Derived stats (safe even when data is null)
  const consistencyPct = an.consistency_score ? Math.round(an.consistency_score * 100) : 0;
  const waPct = an.wa_rate ? Math.round(an.wa_rate * 100) : (an._cf?.wa_rate ? Math.round(an._cf.wa_rate * 100) : null);
  const tlePct = an.tle_rate ? Math.round(an.tle_rate * 100) : (an._cf?.tle_rate ? Math.round(an._cf.tle_rate * 100) : null);
  const peakHour = an.peak_solving_hour !== undefined ? an.peak_solving_hour : an._cf?.peak_hour;
  const avgDelta = an.avg_rating_change !== undefined ? an.avg_rating_change : an._cf?.avg_rating_change;
  const bestRank = an.best_contest_rank || an._cf?.best_rank;

  const narrativeRaw = an.narrative || report_markdown || '';
  const narrativeParagraphs = narrativeRaw
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !p.startsWith('#'));

  const overviewText = narrativeParagraphs[0] || 'Overall competitive programming profile active across Codeforces and LeetCode benchmarks.';
  const weaknessText = narrativeParagraphs[1] || 'Algorithmic bottlenecks identified in complex topic areas.';
  const actionText = narrativeParagraphs[2] || 'Focus on structured deliberate practice targeting high-error algorithm categories.';

  const handleExportPDF = () => {
    if (window.html2pdf && reportRef.current) {
      const opt = {
        margin: 10,
        filename: `Upsolver_Performance_Report_${cf.handle || 'User'}_${lc.username || ''}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#e0e5ec' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };
      window.html2pdf().set(opt).from(reportRef.current).save();
    } else {
      window.print();
    }
  };

  // --- Early returns AFTER all hooks ---
  if (loading) {
    return (
      <div className="industrial-card corner-screws p-12 text-center border border-white/60">
        <div className="h-12 w-12 border-4 border-[#ff4757]/30 border-t-[#ff4757] rounded-full animate-spin mx-auto mb-4" />
        <h3 className="text-lg font-extrabold text-[#2d3436] tracking-tight text-embossed">
          Generating Comprehensive Performance Report...
        </h3>
        <p className="text-xs text-[#4a5568] font-mono mt-1.5 max-w-md mx-auto">
          Ingesting contest submissions, skill tag distributions, and AI algorithmic evaluation.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="industrial-card corner-screws p-12 text-center border border-white/60">
        <div className="h-12 w-12 rounded-2xl bg-[#d8e0ea] shadow-[inset_2px_2px_5px_#babecc,inset_-2px_-2px_5px_#ffffff] flex items-center justify-center mx-auto mb-4">
          <FileText className="h-6 w-6 text-[#ff4757]" />
        </div>
        <h3 className="text-lg font-extrabold text-[#2d3436] text-embossed">
          No Performance Report Loaded
        </h3>
        <p className="text-xs text-[#4a5568] mt-1.5 max-w-md mx-auto">
          Enter your handles above and click <strong className="text-[#ff4757] font-mono">Execute Report</strong> to generate your performance analysis.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" ref={reportRef}>
      {/* Alert Notices */}
      {errors.length > 0 && (
        <div className="industrial-panel p-4 border border-[#ffb000]/60 bg-[#fff9eb] text-[#2d3436] flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-[#ffb000] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold font-mono uppercase tracking-wider text-[#2d3436]">
              Ingestion Notes:
            </p>
            <ul className="list-disc list-inside space-y-0.5 text-xs text-[#4a5568] mt-1 font-mono">
              {errors.map((e, idx) => (
                <li key={idx}>{e}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Report Header Banner Component */}
      <div className="industrial-card corner-screws p-6 border border-white/60">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="h-12 w-12 rounded-xl bg-[#e0e5ec] shadow-[inset_2px_2px_5px_#babecc,inset_-2px_-2px_5px_#ffffff] flex items-center justify-center border border-white/60">
              <Trophy className="h-6 w-6 text-[#ff4757]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-extrabold tracking-tight text-[#2d3436] text-embossed">
                  Performance Evaluation Report
                </h2>
                <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#d8e0ea] text-[#2d3436] shadow-[inset_1px_1px_2px_#babecc] font-mono">
                  VERIFIED
                </span>
              </div>
              <p className="text-xs text-[#4a5568] mt-0.5 font-medium">
                Candidate: <strong className="text-[#2d3436] font-mono">{cf.handle || 'Unspecified'}</strong> (Codeforces) · <strong className="text-[#ff4757] font-mono">{lc.username || 'Unspecified'}</strong> (LeetCode)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onGenerateReport}
              disabled={loading}
              className="btn-industrial-secondary py-2 px-3.5 text-xs font-mono flex items-center gap-1.5"
              title="Refresh / Re-generate this Diagnostic Report"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#ff4757] ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Audit</span>
            </button>
            <button
              onClick={handleExportPDF}
              className="btn-industrial-secondary py-2 px-4 text-xs font-mono flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5 text-[#ff4757]" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {/* CF Rating */}
        <div className="industrial-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#4a5568] uppercase font-mono tracking-wider">CF Rating</span>
            <Code2 className="h-3.5 w-3.5 text-[#2d3436]" />
          </div>
          <p className="text-2xl font-black text-[#2d3436] font-mono mt-2 text-embossed">{cf.rating || '—'}</p>
          <div className="mt-1 pt-1.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono">
            <span className="text-[#718096]">Rank:</span>
            <span className="font-bold text-[#2d3436] uppercase">{cf.rank || 'Unrated'}</span>
          </div>
        </div>

        {/* CF Peak */}
        <div className="industrial-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#4a5568] uppercase font-mono tracking-wider">Peak Rating</span>
            <Award className="h-3.5 w-3.5 text-[#ff4757]" />
          </div>
          <p className="text-2xl font-black text-[#2d3436] font-mono mt-2 text-embossed">{cf.max_rating || '—'}</p>
          <div className="mt-1 pt-1.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono">
            <span className="text-[#718096]">Tier:</span>
            <span className="font-bold text-[#2d3436] uppercase">{cf.max_rank || '—'}</span>
          </div>
        </div>

        {/* LC Solved */}
        <div className="industrial-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#ff4757] uppercase font-mono tracking-wider">LC Solved</span>
            <User className="h-3.5 w-3.5 text-[#ff4757]" />
          </div>
          <p className="text-2xl font-black text-[#ff4757] font-mono mt-2 text-embossed">{lc.total_solved || 0}</p>
          <div className="mt-1 pt-1.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono">
            <span className="text-[#10b981] font-bold">E:{lc.easy_solved || 0}</span>
            <span className="text-[#f59e0b] font-bold">M:{lc.medium_solved || 0}</span>
            <span className="text-[#ff4757] font-bold">H:{lc.hard_solved || 0}</span>
          </div>
        </div>

        {/* LC Contest */}
        <div className="industrial-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#4a5568] uppercase font-mono tracking-wider">LC Contest</span>
            <Trophy className="h-3.5 w-3.5 text-[#f59e0b]" />
          </div>
          <p className="text-2xl font-black text-[#2d3436] font-mono mt-2 text-embossed">
            {lc.contest_rating ? Math.round(lc.contest_rating) : '—'}
          </p>
          <div className="mt-1 pt-1.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono">
            <span className="text-[#718096]">Global:</span>
            <span className="font-bold text-[#2d3436]">{lc.contest_ranking ? `#${lc.contest_ranking}` : (lc.contest_attended ? `${lc.contest_attended} rounds` : 'Unranked')}</span>
          </div>
        </div>

        {/* Consistency */}
        <div className="industrial-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#4a5568] uppercase font-mono tracking-wider">Consistency</span>
            <Flame className="h-3.5 w-3.5 text-[#ff4757]" />
          </div>
          <p className="text-2xl font-black text-[#ff4757] font-mono mt-2 text-embossed">{consistencyPct}%</p>
          <div className="mt-1 pt-1.5 border-t border-[#babecc]/30">
            <div className="w-full bg-[#d1d9e6] h-1.5 rounded-full shadow-[inset_1px_1px_2px_#babecc] overflow-hidden">
              <div className="bg-[#ff4757] h-full rounded-full" style={{ width: `${consistencyPct}%` }} />
            </div>
          </div>
        </div>

        {/* CF Total Solved */}
        <div className="industrial-card p-4 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[#4a5568] uppercase font-mono tracking-wider">CF Solved</span>
            <Layers className="h-3.5 w-3.5 text-[#2d3436] opacity-60" />
          </div>
          <p className="text-2xl font-black text-[#2d3436] font-mono mt-2 text-embossed">{cf.solved_count || 0}</p>
          <div className="mt-1 pt-1.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono">
            <span className="text-[#718096]">Contests:</span>
            <span className="font-bold text-[#2d3436]">{cf.contest_history?.length || an._cf?.cf_contests || 0}</span>
          </div>
        </div>
      </div>

      {/* Structured Evaluation Cards (Component Briefing) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Executive Overview Card */}
        <div className="industrial-card corner-screws p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-[#babecc]/40">
              <div className="h-7 w-7 rounded-lg bg-[#e0e5ec] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff] flex items-center justify-center">
                <Compass className="h-4 w-4 text-[#2d3436]" />
              </div>
              <h3 className="text-xs font-bold text-[#2d3436] uppercase font-mono tracking-wider">
                Profile Executive Snapshot
              </h3>
            </div>
            <p className="text-xs text-[#2d3436] leading-relaxed font-sans">
              {overviewText}
            </p>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono text-[#718096]">
            <span>Contest Velocity:</span>
            <span className="font-bold text-[#2d3436]">{avgDelta !== undefined ? `${avgDelta > 0 ? '+' : ''}${avgDelta} pts/round` : 'N/A'}</span>
          </div>
        </div>

        {/* Bottlenecks Card */}
        <div className="industrial-card corner-screws p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-[#babecc]/40">
              <div className="h-7 w-7 rounded-lg bg-[#fff1f2] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff] flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-[#ff4757]" />
              </div>
              <h3 className="text-xs font-bold text-[#ff4757] uppercase font-mono tracking-wider">
                Key Performance Gaps
              </h3>
            </div>
            <p className="text-xs text-[#2d3436] leading-relaxed font-sans">
              {weaknessText}
            </p>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono text-[#718096]">
            <span>WA Failure Rate:</span>
            <span className="font-bold text-[#ff4757]">{waPct !== null ? `${waPct}%` : 'N/A'}</span>
          </div>
        </div>

        {/* Tactical Actions Card */}
        <div className="industrial-card corner-screws p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 pb-2.5 mb-3 border-b border-[#babecc]/40">
              <div className="h-7 w-7 rounded-lg bg-[#ecfdf5] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff] flex items-center justify-center">
                <Target className="h-4 w-4 text-[#10b981]" />
              </div>
              <h3 className="text-xs font-bold text-[#10b981] uppercase font-mono tracking-wider">
                Tactical Action Directives
              </h3>
            </div>
            <p className="text-xs text-[#2d3436] leading-relaxed font-sans">
              {actionText}
            </p>
          </div>
          <div className="mt-4 pt-2.5 border-t border-[#babecc]/30 flex items-center justify-between text-[10px] font-mono text-[#718096]">
            <span>Peak Hour:</span>
            <span className="font-bold text-[#2d3436]">{peakHour !== undefined ? `${peakHour}:00 UTC` : 'N/A'}</span>
          </div>
        </div>
      </div>

      {/* Rating Trajectory Chart & Algorithmic Strengths/Weaknesses Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Rating Progression Chart Card with Platform Switcher */}
        <div className="lg:col-span-2 industrial-card corner-screws p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-[#babecc]/50">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-[#ff4757]" />
                <h3 className="text-sm font-bold text-[#2d3436] tracking-tight">
                  {currentChartMode === 'lc'
                    ? 'LeetCode Contest Rating Trajectory'
                    : currentChartMode === 'both'
                    ? 'Dual Platform Contest Rating Overlay'
                    : 'Codeforces Rating Progression History'}
                </h3>
              </div>
              <p className="text-xs text-[#4a5568] mt-0.5">
                {currentChartMode === 'lc'
                  ? `Attended rated rounds for @${lc.username || 'user'}`
                  : currentChartMode === 'both'
                  ? 'Synchronized rating progression across Codeforces & LeetCode'
                  : 'Historical contest ELO curve and milestone trajectories'}
              </p>
            </div>

            {/* Platform Switcher Buttons */}
            <div className="flex items-center gap-1.5 p-1 bg-[#d8e0ea] rounded-xl shadow-[inset_2px_2px_4px_#babecc,inset_-2px_-2px_4px_#ffffff]">
              {cfContestHistory.length > 0 && (
                <button
                  onClick={() => setActiveChart('cf')}
                  className={`px-3 py-1 text-xs font-bold uppercase transition-all duration-150 cursor-pointer rounded-lg font-mono flex items-center gap-1 ${
                    currentChartMode === 'cf'
                      ? 'bg-[#e0e5ec] text-[#2d3436] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff]'
                      : 'text-[#4a5568] hover:text-[#2d3436]'
                  }`}
                >
                  <Code2 className="h-3 w-3 text-[#2d3436]" />
                  <span>CF ({cfContestHistory.length})</span>
                </button>
              )}

              {lcContestHistory.length > 0 && (
                <button
                  onClick={() => setActiveChart('lc')}
                  className={`px-3 py-1 text-xs font-bold uppercase transition-all duration-150 cursor-pointer rounded-lg font-mono flex items-center gap-1 ${
                    currentChartMode === 'lc'
                      ? 'bg-[#e0e5ec] text-[#ff4757] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff]'
                      : 'text-[#4a5568] hover:text-[#ff4757]'
                  }`}
                >
                  <User className="h-3 w-3 text-[#ff4757]" />
                  <span>LC ({lcContestHistory.length})</span>
                </button>
              )}

              {cfContestHistory.length > 0 && lcContestHistory.length > 0 && (
                <button
                  onClick={() => setActiveChart('both')}
                  className={`px-3 py-1 text-xs font-bold uppercase transition-all duration-150 cursor-pointer rounded-lg font-mono ${
                    currentChartMode === 'both'
                      ? 'bg-[#e0e5ec] text-[#ff4757] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff]'
                      : 'text-[#4a5568] hover:text-[#2d3436]'
                  }`}
                >
                  Dual
                </button>
              )}
            </div>
          </div>

          {/* Chart Rendering */}
          {currentChartMode === 'lc' ? (
            /* LeetCode Rating Progression Chart */
            lcContestHistory.length > 0 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={lcContestHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="lcGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ff4757" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ff4757" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                    <XAxis dataKey="contest" stroke="#64748b" tick={{ fontSize: 10, fill: '#4a5568', fontFamily: 'JetBrains Mono' }} tickLine={false} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#4a5568', fontFamily: 'JetBrains Mono' }} domain={['dataMin - 50', 'dataMax + 50']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#2d3436',
                        borderColor: '#4a5568',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f0f2f5',
                        boxShadow: '4px 4px 12px rgba(0,0,0,0.2)'
                      }}
                      labelStyle={{ color: '#ff4757', fontWeight: 'bold' }}
                      formatter={(val, name, item) => [
                        `${val} Rating (Rank #${item.payload.rank || 'N/A'}${item.payload.solved ? ` · Solved ${item.payload.solved}` : ''})`,
                        item.payload.name || 'LeetCode Contest'
                      ]}
                    />
                    <Area type="monotone" dataKey="rating" stroke="#ff4757" strokeWidth={2.5} fillOpacity={1} fill="url(#lcGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-[#4a5568] text-xs font-mono">
                No attended LeetCode contest rating history recorded for @{lc.username || 'user'}.
              </div>
            )
          ) : currentChartMode === 'both' ? (
            /* Dual Platform Chart */
            dualContestHistory.length > 0 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dualContestHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                    <XAxis dataKey="contest" stroke="#64748b" tick={{ fontSize: 10, fill: '#4a5568', fontFamily: 'JetBrains Mono' }} tickLine={false} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#4a5568', fontFamily: 'JetBrains Mono' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#2d3436',
                        borderColor: '#4a5568',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f0f2f5',
                        boxShadow: '4px 4px 12px rgba(0,0,0,0.2)'
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono', paddingTop: '8px' }} />
                    <Line type="monotone" name={`Codeforces [${cf.handle || 'CF'}]`} dataKey="cfRating" stroke="#2d3436" strokeWidth={2.5} dot={{ r: 2 }} />
                    <Line type="monotone" name={`LeetCode [${lc.username || 'LC'}]`} dataKey="lcRating" stroke="#ff4757" strokeWidth={2.5} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-[#4a5568] text-xs font-mono">
                Insufficient contest history across both platforms.
              </div>
            )
          ) : (
            /* Codeforces Rating Chart */
            cfContestHistory.length > 0 ? (
              <div className="h-64 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={cfContestHistory} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cfGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2d3436" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2d3436" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#cbd5e1" vertical={false} />
                    <XAxis dataKey="contest" stroke="#64748b" tick={{ fontSize: 10, fill: '#4a5568', fontFamily: 'JetBrains Mono' }} tickLine={false} />
                    <YAxis stroke="#64748b" tick={{ fontSize: 10, fill: '#4a5568', fontFamily: 'JetBrains Mono' }} domain={['dataMin - 100', 'dataMax + 100']} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#2d3436',
                        borderColor: '#4a5568',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#f0f2f5',
                        boxShadow: '4px 4px 12px rgba(0,0,0,0.2)'
                      }}
                      labelStyle={{ color: '#ff4757', fontWeight: 'bold' }}
                      formatter={(val, name, item) => [
                        `${val} Rating (Rank #${item.payload.rank || 'N/A'}${item.payload.change ? `, ${item.payload.change > 0 ? '+' : ''}${item.payload.change}` : ''})`,
                        item.payload.name || 'Contest'
                      ]}
                    />
                    <Area type="monotone" dataKey="rating" stroke="#2d3436" strokeWidth={2.5} fillOpacity={1} fill="url(#cfGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-[#4a5568] text-xs font-mono">
                No rated contest history found for Codeforces handle @{cf.handle || 'user'}.
              </div>
            )
          )}
        </div>

        {/* Skill Gap Matrix (Weak Topics) */}
        <div className="industrial-card corner-screws p-5 flex flex-col justify-between">
          <div>
            <div className="pb-3 mb-3 border-b border-[#babecc]/50">
              <h3 className="text-sm font-bold text-[#2d3436] tracking-tight flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-[#ff4757]" />
                <span>Target Focus Topics</span>
              </h3>
              <p className="text-xs text-[#4a5568]">Topics with highest historical failure rate</p>
            </div>

            <div className="space-y-2.5 overflow-y-auto max-h-60 pr-1">
              {(an.weak_topics || []).length > 0 ? (
                an.weak_topics.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-[#d8e0ea] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#ff4757]" />
                      <span className="text-xs font-bold text-[#2d3436] font-mono capitalize">{t.tag}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-bold text-[#ff4757] font-mono">{t.failure_rate ? Math.round(t.failure_rate * 100) : (t.fail_rate || 0)}% fail</span>
                      <span className="text-[10px] text-[#4a5568] ml-1.5 font-mono">({t.attempts || 0} tries)</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#4a5568] py-8 text-center font-mono">No critical topic bottlenecks detected.</p>
              )}
            </div>
          </div>

          {/* Strong Topics Footer Tags */}
          {(an.strong_topics || []).length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#babecc]/40">
              <span className="text-[10px] font-bold text-[#4a5568] font-mono uppercase block mb-1.5">
                Demonstrated Strengths:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {an.strong_topics.slice(0, 4).map((st, sIdx) => (
                  <span
                    key={sIdx}
                    className="px-2 py-0.5 text-[10px] font-bold font-mono rounded-md bg-[#ecfdf5] text-[#065f46] border border-[#10b981]/30"
                  >
                    #{st.tag}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
