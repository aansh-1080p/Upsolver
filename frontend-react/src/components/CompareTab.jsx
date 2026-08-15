import React, { useState } from 'react';
import {
  Users,
  Swords,
  TrendingUp,
  Award,
  AlertTriangle,
  Flame,
  ArrowRight,
  ShieldAlert
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
  hostLc
}) {
  const [targetCf, setTargetCf] = useState('tourist');
  const [targetLc, setTargetLc] = useState('neal_wu');

  const comp = compareData || {};
  const host = comp.user_a || {};
  const rival = comp.user_b || {};
  const comparison = comp.comparison || {};
  const hasData = Boolean(comp.user_a && comp.user_b);

  // Synchronize contest ELO history for overlay chart
  const historyA = host.cf?.contest_history || [];
  const historyB = rival.cf?.contest_history || [];
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
      cf_a: hostCf,
      lc_a: hostLc,
      cf_b: targetCf,
      lc_b: targetLc,
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
        { name: 'Ravindra (Peer)', cf: 'Ravindra19', lc: 'Ravindra056' }
      ];
    }
  });

  const handleSelectFriend = (friend) => {
    setTargetCf(friend.cf || '');
    setTargetLc(friend.lc || '');
    onCompare({
      cf_a: hostCf,
      lc_a: hostLc,
      cf_b: friend.cf || '',
      lc_b: friend.lc || '',
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
      {/* Target Rival Configuration Console */}
      <div className="industrial-card corner-screws p-6 border border-white/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 mb-4 border-b border-[#babecc]/50">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2d3436] uppercase tracking-wider font-mono">
            <Swords className="h-4 w-4 text-[#ff4757]" />
            <span>Target Benchmark Configuration</span>
          </div>
          
          {/* Quick Duel Friend Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-[#4a5568] font-mono font-bold uppercase">⚔️ Quick Duel:</span>
            {friendsList.map((f, fIdx) => (
              <button
                key={fIdx}
                type="button"
                onClick={() => handleSelectFriend(f)}
                className="px-2 py-0.5 text-[10px] font-bold font-mono rounded-md bg-[#d8e0ea] text-[#2d3436] hover:text-[#ff4757] shadow-[inset_1px_1px_2px_#babecc,inset_-1px_-1px_2px_#ffffff] transition-all cursor-pointer"
              >
                {f.name}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono">
              Target Codeforces Benchmark
            </label>
            <input
              type="text"
              value={targetCf}
              onChange={(e) => setTargetCf(e.target.value)}
              placeholder="e.g. tourist"
              className="input-industrial w-full py-2.5 px-3.5"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono">
              Target LeetCode Benchmark
            </label>
            <input
              type="text"
              value={targetLc}
              onChange={(e) => setTargetLc(e.target.value)}
              placeholder="e.g. neal_wu"
              className="input-industrial w-full py-2.5 px-3.5"
            />
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-[#babecc]/40 flex items-center justify-between">
          <button
            type="button"
            onClick={handleSaveCurrentFriend}
            className="text-xs font-mono font-bold text-[#4a5568] hover:text-[#ff4757] transition-colors cursor-pointer"
          >
            + Save to Friends Roster
          </button>

          <button
            onClick={handleRunCompare}
            disabled={loading || (!targetCf.trim() && !targetLc.trim())}
            className="btn-industrial-primary py-2.5 px-6"
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span>
                <span>Calculating Differential Telemetry...</span>
              </>
            ) : (
              <>
                <Swords className="h-4 w-4" />
                <span>Execute Peer Comparison</span>
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
                  HOST UNIT
                </span>
                <span className="text-xs font-bold font-mono text-[#ff4757]">
                  {host.cf?.handle || hostCf}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">CF Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">{host.cf?.rating || '—'}</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Solved</p>
                  <p className="text-xl font-extrabold text-[#ff4757] font-mono mt-1 text-embossed">{host.lc?.total_solved || 0}</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">
                    {host.lc?.contest_rating ? Math.round(host.lc.contest_rating) : '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Target Rival Console */}
            <div className="industrial-card corner-screws p-5">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#babecc]/50">
                <span className="px-2.5 py-1 bg-[#d8e0ea] text-[#2d3436] rounded-md text-xs font-bold font-mono shadow-[inset_1px_1px_2px_#babecc]">
                  TARGET BENCHMARK
                </span>
                <span className="text-xs font-bold font-mono text-[#2d3436]">
                  {rival.cf?.handle || targetCf}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">CF Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">{rival.cf?.rating || '—'}</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Solved</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">{rival.lc?.total_solved || 0}</p>
                </div>
                <div className="industrial-panel p-3 text-center">
                  <p className="text-[10px] font-bold text-[#4a5568] font-mono uppercase">LC Rating</p>
                  <p className="text-xl font-extrabold text-[#2d3436] font-mono mt-1 text-embossed">
                    {rival.lc?.contest_rating ? Math.round(rival.lc.contest_rating) : '—'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Differential Metrics Readout */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="industrial-panel p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#4a5568] font-mono uppercase">CF Differential</p>
                <p className="text-sm text-[#2d3436] mt-0.5">
                  Host: {host.cf?.rating || 0} vs Rival: {rival.cf?.rating || 0}
                </p>
              </div>
              <div>{getDeltaBadge(comparison.cf_rating_diff || 0)}</div>
            </div>

            <div className="industrial-panel p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#4a5568] font-mono uppercase">LC Differential</p>
                <p className="text-sm text-[#2d3436] mt-0.5">
                  Host: {host.lc?.total_solved || 0} vs Rival: {rival.lc?.total_solved || 0}
                </p>
              </div>
              <div>{getDeltaBadge(comparison.lc_solved_diff || 0)}</div>
            </div>

            <div className="industrial-panel p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-[#4a5568] font-mono uppercase">Contest Differential</p>
                <p className="text-sm text-[#2d3436] mt-0.5">
                  Host: {host.cf?.contests_count || 0} vs Rival: {rival.cf?.contests_count || 0}
                </p>
              </div>
              <div>{getDeltaBadge((host.cf?.contests_count || 0) - (rival.cf?.contests_count || 0))}</div>
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
                <p className="text-xs text-[#4a5568]">Host profile vs Benchmark target</p>
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
                      name={`Host [${host.cf?.handle || 'Host'}]`}
                      dataKey="hostRating"
                      stroke="#ff4757"
                      strokeWidth={2.5}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      name={`Rival [${rival.cf?.handle || 'Rival'}]`}
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
            Specify a target rival's Codeforces & LeetCode handles above and click <strong>[Execute Peer Comparison]</strong>.
          </p>
        </div>
      )}
    </div>
  );
}
