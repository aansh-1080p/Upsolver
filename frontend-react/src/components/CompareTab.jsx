import React, { useState } from 'react';
import {
  Users,
  Swords,
  TrendingUp,
  Award,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Zap,
  CheckCircle2,
  Code2,
  User
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';

export default function CompareTab({
  compareData,
  loading,
  onCompare,
  hostCf,
  hostLc,
  setHostCf,
  setHostLc
}) {
  const [targetCf, setTargetCf] = useState('tourist');
  const [targetLc, setTargetLc] = useState('neal_wu');

  const comp = compareData || {};
  const comparison = comp.comparison || {};
  const youData = comp.you || {};
  const peerData = comp.peer || {};

  // Extract host / your metrics
  const hostCfHandle = youData.cf_data?.handle || comparison.your_handle || comparison.you?.cf?.handle || hostCf || 'Host';
  const hostCfRating = youData.cf_data?.rating || comparison.you?.cf?.cf_rating || '—';
  const hostCfMax = youData.cf_data?.maxRating || comparison.you?.cf?.cf_max_rating || '—';
  const hostLcSolved = youData.lc_data?.total_solved ?? comparison.you?.lc?.lc_solved ?? 0;
  const hostLcRating = youData.lc_data?.contest_rating ? Math.round(youData.lc_data.contest_rating) : (comparison.you?.lc?.lc_rating || '—');

  // Extract rival / peer metrics
  const rivalCfHandle = peerData.cf_data?.handle || comparison.peer_handle || comparison.peer?.cf?.handle || targetCf || 'Rival';
  const rivalCfRating = peerData.cf_data?.rating || comparison.peer?.cf?.cf_rating || '—';
  const rivalCfMax = peerData.cf_data?.maxRating || comparison.peer?.cf?.cf_max_rating || '—';
  const rivalLcSolved = peerData.lc_data?.total_solved ?? comparison.peer?.lc?.lc_solved ?? 0;
  const rivalLcRating = peerData.lc_data?.contest_rating ? Math.round(peerData.lc_data.contest_rating) : (comparison.peer?.lc?.lc_rating || '—');

  const diff = comparison.diff || {};
  const hasData = Boolean(comp.comparison || comp.you || comp.user_a);

  // Synchronize contest ELO history for overlay chart
  const historyA = youData.cf_data?.contest_history || comp.user_a?.cf?.contest_history || [];
  const historyB = peerData.cf_data?.contest_history || comp.user_b?.cf?.contest_history || [];
  const maxLen = Math.max(historyA.length, historyB.length);

  const chartData = [];
  for (let i = 0; i < maxLen; i++) {
    chartData.push({
      contest: `#${i + 1}`,
      hostRating: historyA[i]?.newRating || null,
      rivalRating: historyB[i]?.newRating || null,
    });
  }

  const handleRunCompare = () => {
    onCompare({
      peer_cf: targetCf.trim(),
      peer_lc: targetLc.trim(),
      cf_b: targetCf.trim(),
      lc_b: targetLc.trim()
    });
  };

  const getDeltaBadge = (delta = 0) => {
    if (delta > 0) {
      return (
        <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-md bg-[#ecfdf5] text-[#10b981] border border-[#10b981]/30">
          +{delta} LEAD
        </span>
      );
    } else if (delta < 0) {
      return (
        <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-md bg-[#fff1f2] text-[#ff4757] border border-[#ff4757]/30">
          {delta} BEHIND
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-xs font-bold font-mono rounded-md bg-[#f0f2f5] text-[#4a5568]">
        TIED
      </span>
    );
  };

  const [friendsList, setFriendsList] = useState(() => {
    try {
      const saved = localStorage.getItem('upsolver_web_friends');
      return saved ? JSON.parse(saved) : [
        { name: 'tourist (Benchmark)', cf: 'tourist', lc: 'neal_wu' },
        { name: 'Benq (Grandmaster)', cf: 'Benq', lc: 'Benq' },
        { name: 'Ravindra (Peer)', cf: 'Ravindra19', lc: 'Ravindra056' }
      ];
    } catch {
      return [
        { name: 'tourist (Benchmark)', cf: 'tourist', lc: 'neal_wu' },
        { name: 'Benq (Grandmaster)', cf: 'Benq', lc: 'Benq' },
        { name: 'Ravindra (Peer)', cf: 'Ravindra19', lc: 'Ravindra056' }
      ];
    }
  });

  const handleSelectFriend = (friend) => {
    const cf = friend.cf || '';
    const lc = friend.lc || '';
    setTargetCf(cf);
    setTargetLc(lc);
    onCompare({
      peer_cf: cf,
      peer_lc: lc,
      cf_b: cf,
      lc_b: lc
    });
  };

  const handleSaveCurrentFriend = () => {
    if (!targetCf.trim() && !targetLc.trim()) return;
    const exists = friendsList.some(f => f.cf === targetCf.trim() && f.lc === targetLc.trim());
    if (exists) return;
    const newFriend = {
      name: targetCf.trim() || targetLc.trim() || 'Competitor',
      cf: targetCf.trim(),
      lc: targetLc.trim()
    };
    const updated = [newFriend, ...friendsList];
    setFriendsList(updated);
    try { localStorage.setItem('upsolver_web_friends', JSON.stringify(updated)); } catch {}
  };

  return (
    <div className="space-y-6">
      {/* Integrated Dual-Profile Arena Setup Console */}
      <div className="industrial-card corner-screws p-6 border border-white/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-[#babecc]/50">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2d3436] uppercase tracking-wider font-mono">
            <Swords className="h-4 w-4 text-[#ff4757]" />
            <span>Peer Duel Arena Configuration</span>
          </div>
          
          {/* Quick Duel Friend Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[#4a5568] font-mono font-bold uppercase">⚔️ 1-Click Rival:</span>
            {friendsList.map((f, fIdx) => (
              <button
                key={fIdx}
                type="button"
                onClick={() => handleSelectFriend(f)}
                className="px-2.5 py-1 text-[10px] font-bold font-mono rounded-md bg-[#d8e0ea] text-[#2d3436] hover:text-[#ff4757] hover:bg-[#ffffff] shadow-[inset_1px_1px_2px_#babecc,inset_-1px_-1px_2px_#ffffff] transition-all cursor-pointer"
              >
                ⚔️ {f.name}
              </button>
            ))}
          </div>
        </div>

        {/* Dual Input Panels (Host vs Rival) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Your Profile Panel */}
          <div className="industrial-panel p-4 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#babecc]/40">
              <span className="text-xs font-bold font-mono text-[#ff4757] uppercase tracking-wider">
                Unit 01: You (Host)
              </span>
              <span className="text-[10px] font-mono text-[#4a5568]">PRIMARY PROFILE</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#4a5568] mb-1 uppercase font-mono flex items-center gap-1">
                  <Code2 className="h-3 w-3 text-[#2d3436]" />
                  Codeforces
                </label>
                <input
                  type="text"
                  value={hostCf || ''}
                  onChange={(e) => setHostCf && setHostCf(e.target.value)}
                  placeholder="e.g. your_cf_handle"
                  className="input-industrial w-full py-2 px-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#4a5568] mb-1 uppercase font-mono flex items-center gap-1">
                  <User className="h-3 w-3 text-[#ff4757]" />
                  LeetCode
                </label>
                <input
                  type="text"
                  value={hostLc || ''}
                  onChange={(e) => setHostLc && setHostLc(e.target.value)}
                  placeholder="e.g. your_lc_username"
                  className="input-industrial w-full py-2 px-3 text-xs"
                />
              </div>
            </div>
          </div>

          {/* Rival Profile Panel */}
          <div className="industrial-panel p-4 space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-[#babecc]/40">
              <span className="text-xs font-bold font-mono text-[#2d3436] uppercase tracking-wider">
                Unit 02: Competitor (Rival)
              </span>
              <span className="text-[10px] font-mono text-[#4a5568]">TARGET BENCHMARK</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#4a5568] mb-1 uppercase font-mono flex items-center gap-1">
                  <Code2 className="h-3 w-3 text-[#2d3436]" />
                  Competitor Codeforces
                </label>
                <input
                  type="text"
                  value={targetCf}
                  onChange={(e) => setTargetCf(e.target.value)}
                  placeholder="e.g. tourist, Benq"
                  className="input-industrial w-full py-2 px-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#4a5568] mb-1 uppercase font-mono flex items-center gap-1">
                  <User className="h-3 w-3 text-[#ff4757]" />
                  Competitor LeetCode
                </label>
                <input
                  type="text"
                  value={targetLc}
                  onChange={(e) => setTargetLc(e.target.value)}
                  placeholder="e.g. neal_wu"
                  className="input-industrial w-full py-2 px-3 text-xs"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="mt-5 pt-3 border-t border-[#babecc]/40 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleSaveCurrentFriend}
            className="text-xs font-mono font-bold text-[#4a5568] hover:text-[#ff4757] transition-colors cursor-pointer"
          >
            + Save Competitor to Friends Roster
          </button>

          <button
            onClick={handleRunCompare}
            disabled={loading || (!hostCf?.trim() && !hostLc?.trim()) || (!targetCf.trim() && !targetLc.trim())}
            className="btn-industrial-primary py-2.5 px-7"
          >
            {loading ? (
              <>
                <span className="inline-block animate-spin">⟳</span>
                <span>Calculating Head-to-Head Differential Telemetry...</span>
              </>
            ) : (
              <>
                <Swords className="h-4 w-4" />
                <span>Execute Peer Duel</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Comparison Results */}
      {hasData ? (
        <div className="space-y-6">
          {/* Dual Split Consoles: Host vs Rival */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Host Console */}
            <div className="industrial-card corner-screws p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#babecc]/50">
                <span className="px-2.5 py-1 bg-[#d8e0ea] text-[#2d3436] rounded-md text-xs font-bold font-mono shadow-[inset_1px_1px_2px_#babecc]">
                  YOU (HOST UNIT)
                </span>
                <span className="text-xs font-bold font-mono text-[#ff4757]">
                  {hostCfHandle}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">CF Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">{hostCfRating}</p>
                  <p className="text-[9px] text-[#6b7280] font-mono mt-0.5">Peak: {hostCfMax}</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Solved</p>
                  <p className="text-xl font-extrabold text-[#ff4757] font-mono mt-1 text-embossed">{hostLcSolved}</p>
                  <p className="text-[9px] text-[#6b7280] font-mono mt-0.5">Problems</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">
                    {hostLcRating}
                  </p>
                  <p className="text-[9px] text-[#6b7280] font-mono mt-0.5">Contest</p>
                </div>
              </div>
            </div>

            {/* Target Rival Console */}
            <div className="industrial-card corner-screws p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#babecc]/50">
                <span className="px-2.5 py-1 bg-[#d8e0ea] text-[#2d3436] rounded-md text-xs font-bold font-mono shadow-[inset_1px_1px_2px_#babecc]">
                  RIVAL (BENCHMARK)
                </span>
                <span className="text-xs font-bold font-mono text-[#2d3436]">
                  {rivalCfHandle}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">CF Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">{rivalCfRating}</p>
                  <p className="text-[9px] text-[#6b7280] font-mono mt-0.5">Peak: {rivalCfMax}</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Solved</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">{rivalLcSolved}</p>
                  <p className="text-[9px] text-[#6b7280] font-mono mt-0.5">Problems</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">
                    {rivalLcRating}
                  </p>
                  <p className="text-[9px] text-[#6b7280] font-mono mt-0.5">Contest</p>
                </div>
              </div>
            </div>
          </div>

          {/* Differential Metrics Readout */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="industrial-panel p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#4a5568] font-mono uppercase">CF Rating Gap</p>
                <p className="text-sm text-[#2d3436] mt-0.5 font-mono">
                  {hostCfRating} vs {rivalCfRating}
                </p>
              </div>
              <div>{getDeltaBadge(diff.cf_rating ?? 0)}</div>
            </div>

            <div className="industrial-panel p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#4a5568] font-mono uppercase">LC Volume Gap</p>
                <p className="text-sm text-[#2d3436] mt-0.5 font-mono">
                  {hostLcSolved} vs {rivalLcSolved}
                </p>
              </div>
              <div>{getDeltaBadge(diff.lc_solved ?? 0)}</div>
            </div>

            <div className="industrial-panel p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#4a5568] font-mono uppercase">CF Peak Delta</p>
                <p className="text-sm text-[#2d3436] mt-0.5 font-mono">
                  {hostCfMax} vs {rivalCfMax}
                </p>
              </div>
              <div>{getDeltaBadge(diff.cf_max_rating ?? 0)}</div>
            </div>
          </div>

          {/* AI Coach Head-to-Head Tactical Briefing */}
          {comparison.narrative && (
            <div className="industrial-card corner-screws p-6 border border-white/60">
              <div className="flex items-center gap-2 pb-3 mb-3 border-b border-[#babecc]/50">
                <Sparkles className="h-4 w-4 text-[#ff4757]" />
                <span className="text-xs font-bold text-[#2d3436] uppercase font-mono tracking-wider">
                  AI Tactical Coach Head-to-Head Briefing
                </span>
              </div>
              <p className="text-xs text-[#2d3436] font-sans leading-relaxed whitespace-pre-wrap">
                {comparison.narrative}
              </p>
            </div>
          )}

          {/* Tag Breakdown Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Common Weak */}
            <div className="industrial-card corner-screws p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#d97706] font-mono uppercase pb-2 border-b border-[#babecc]/40">
                <AlertTriangle className="h-3.5 w-3.5 text-[#f59e0b]" />
                <span>Shared Vulnerabilities</span>
              </div>
              {(comparison.common_weak || []).length === 0 ? (
                <p className="text-[11px] text-[#4a5568] font-mono">No shared weak spots detected.</p>
              ) : (
                <div className="space-y-1.5">
                  {comparison.common_weak.map((t, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-[#f0f2f5] text-xs font-mono flex items-center justify-between">
                      <span className="font-bold text-[#2d3436]">{t.tag}</span>
                      <span className="text-[10px] text-[#dc2626]">You: {t.your_rate}% | Peer: {t.peer_rate}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Your Edge */}
            <div className="industrial-card corner-screws p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#059669] font-mono uppercase pb-2 border-b border-[#babecc]/40">
                <Zap className="h-3.5 w-3.5 text-[#10b981]" />
                <span>Your Algorithmic Edge</span>
              </div>
              {(comparison.your_edge || []).length === 0 ? (
                <p className="text-[11px] text-[#4a5568] font-mono">No category edges identified.</p>
              ) : (
                <div className="space-y-1.5">
                  {comparison.your_edge.map((t, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-[#f0f2f5] text-xs font-mono flex items-center justify-between">
                      <span className="font-bold text-[#2d3436]">{t.tag}</span>
                      <span className="text-[10px] font-bold text-[#10b981]">+{t.advantage}pp accuracy</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Peer Edge */}
            <div className="industrial-card corner-screws p-4 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-[#dc2626] font-mono uppercase pb-2 border-b border-[#babecc]/40">
                <Flame className="h-3.5 w-3.5 text-[#ef4444]" />
                <span>Rival's Algorithmic Edge</span>
              </div>
              {(comparison.peer_edge || []).length === 0 ? (
                <p className="text-[11px] text-[#4a5568] font-mono">Peer holds no category edges.</p>
              ) : (
                <div className="space-y-1.5">
                  {comparison.peer_edge.map((t, idx) => (
                    <div key={idx} className="p-2 rounded-lg bg-[#f0f2f5] text-xs font-mono flex items-center justify-between">
                      <span className="font-bold text-[#2d3436]">{t.tag}</span>
                      <span className="text-[10px] font-bold text-[#dc2626]">Peer +{t.advantage}pp lead</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Rating Progression Overlay Chart */}
          {chartData.length > 0 && (
            <div className="industrial-card corner-screws p-6">
              <div className="pb-3 mb-3 border-b border-[#babecc]/50">
                <h3 className="text-sm font-bold text-[#2d3436] tracking-tight flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#ff4757]" />
                  <span>Synchronized Rating Trajectory Overlay</span>
                </h3>
                <p className="text-xs text-[#4a5568]">Host unit vs Benchmark rival contest history</p>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
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
                    <Legend wrapperStyle={{ fontSize: '11px', fontFamily: 'JetBrains Mono', paddingTop: '10px' }} />
                    <Line
                      type="monotone"
                      name={`You [${hostCfHandle}]`}
                      dataKey="hostRating"
                      stroke="#ff4757"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      name={`Rival [${rivalCfHandle}]`}
                      dataKey="rivalRating"
                      stroke="#4a5568"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="industrial-card corner-screws p-12 text-center border border-white/60">
          <Users className="h-10 w-10 text-[#a3b1c6] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#2d3436] text-embossed">No Benchmark Telemetry Loaded</h3>
          <p className="text-xs text-[#4a5568] mt-1 max-w-sm mx-auto">
            Review your handles and your competitor's handles above and click <strong>[Execute Peer Duel]</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
