import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Users,
  Swords,
  RefreshCw,
  Plus,
  Trash2,
  ExternalLink,
  Code2,
  User,
  Award,
  Radio,
  Clock,
  Search,
  CheckCircle2,
  TrendingUp,
  AlertCircle,
  Sparkles,
  HelpCircle
} from 'lucide-react';
import { getContests, refreshFriendsBatch } from '../api';

export default function FriendsTab({ onLaunchDuel }) {
  const [friends, setFriends] = useState(() => {
    try {
      const saved = localStorage.getItem('upsolver_web_friends');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error('Error loading saved friends:', e);
    }
    return [
      {
        id: 'f_tourist',
        name: 'tourist (Benchmark)',
        cf: 'tourist',
        lc: 'neal_wu',
        cfRating: 3850,
        cfMaxRating: 3979,
        cfRank: 'Legendary Grandmaster',
        cfSolved: 2150,
        lcRating: 3340,
        lcSolved: 2480,
        lastUpdated: Date.now()
      },
      {
        id: 'f_benq',
        name: 'Benq (Grandmaster)',
        cf: 'Benq',
        lc: 'Benq',
        cfRating: 3520,
        cfMaxRating: 3680,
        cfRank: 'Legendary Grandmaster',
        cfSolved: 1420,
        lcRating: 2980,
        lcSolved: 1100,
        lastUpdated: Date.now()
      },
      {
        id: 'f_ravindra',
        name: 'Ravindra (Peer)',
        cf: 'Ravindra19',
        lc: 'Ravindra056',
        cfRating: 1420,
        cfMaxRating: 1485,
        cfRank: 'Specialist',
        cfSolved: 310,
        lcRating: 1780,
        lcSolved: 480,
        lastUpdated: Date.now()
      }
    ];
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [contestsData, setContestsData] = useState({ live: [], upcoming: [], live_standings: {} });
  const [contestsLoading, setContestsLoading] = useState(false);

  // Form State for Adding New Friend
  const [newName, setNewName] = useState('');
  const [newCf, setNewCf] = useState('');
  const [newLc, setNewLc] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');

  // Hover state for tooltip on friend cards
  const [hoveredFriendId, setHoveredFriendId] = useState(null);

  // Save friends to localStorage whenever state changes
  const persistFriends = useCallback((updatedList) => {
    setFriends(updatedList);
    try {
      localStorage.setItem('upsolver_web_friends', JSON.stringify(updatedList));
    } catch (e) {
      console.error('Failed to persist friends:', e);
    }
  }, []);

  // Fetch Live & Upcoming Contests
  const fetchContestsInfo = useCallback(async () => {
    setContestsLoading(true);
    try {
      const handles = friends.map(f => f.cf).filter(Boolean).join(',');
      const res = await getContests(handles).catch(() => ({ live: [], upcoming: [], live_standings: {} }));
      setContestsData(res);
    } catch (err) {
      console.error('Failed to fetch contests info:', err);
    } finally {
      setContestsLoading(false);
    }
  }, [friends]);

  // Initial load of contests
  useEffect(() => {
    fetchContestsInfo();
    const interval = setInterval(fetchContestsInfo, 60000); // Polling every minute
    return () => clearInterval(interval);
  }, [fetchContestsInfo]);

  // Batch Refresh All Friends Ratings & Problem Counts
  const handleRefreshAll = async () => {
    if (friends.length === 0) return;
    setRefreshing(true);
    try {
      const res = await refreshFriendsBatch(friends);
      if (res.success && Array.isArray(res.friends)) {
        persistFriends(res.friends);
      }
      await fetchContestsInfo();
    } catch (err) {
      console.error('Failed to batch refresh friends:', err);
    } finally {
      setRefreshing(false);
    }
  };

  // Add New Friend
  const handleAddFriendSubmit = async (e) => {
    e.preventDefault();
    if (!newCf.trim() && !newLc.trim()) {
      setAddError('Enter at least a Codeforces handle or LeetCode username.');
      return;
    }
    setAddLoading(true);
    setAddError('');

    try {
      const friendObj = {
        id: `f_${Date.now()}`,
        name: newName.trim() || newCf.trim() || newLc.trim() || 'Competitor',
        cf: newCf.trim(),
        lc: newLc.trim(),
        cfRating: 0,
        cfMaxRating: 0,
        cfRank: 'unrated',
        cfSolved: 0,
        lcRating: 0,
        lcSolved: 0,
        lastUpdated: Date.now()
      };

      // Enrich immediately via backend
      const res = await refreshFriendsBatch([friendObj]).catch(() => ({ friends: [friendObj] }));
      const enriched = res.friends?.[0] || friendObj;

      const updated = [enriched, ...friends];
      persistFriends(updated);
      setNewName('');
      setNewCf('');
      setNewLc('');
      setShowAddModal(false);
    } catch (err) {
      setAddError(err.message || 'Failed to add friend');
    } finally {
      setAddLoading(false);
    }
  };

  // Delete Friend
  const handleDeleteFriend = (id) => {
    if (!window.confirm('Remove this friend from your roster?')) return;
    const updated = friends.filter(f => f.id !== id);
    persistFriends(updated);
  };

  // Filtered Friends List
  const filteredFriends = useMemo(() => {
    if (!searchQuery.trim()) return friends;
    const q = searchQuery.toLowerCase().trim();
    return friends.filter(f =>
      (f.name || '').toLowerCase().includes(q) ||
      (f.cf || '').toLowerCase().includes(q) ||
      (f.lc || '').toLowerCase().includes(q)
    );
  }, [friends, searchQuery]);

  return (
    <div className="space-y-6">
      {/* Top Header Console Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-[#d8e0ea] text-[#ff4757] shadow-[inset_1px_1px_3px_#babecc]">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[#2d3436] tracking-tight flex items-center gap-2">
              <span>Friends &amp; Benchmark Roster</span>
              <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-md bg-[#e0e5ec] text-[#4a5568] shadow-[inset_1px_1px_2px_#babecc]">
                {friends.length} TRACKED
              </span>
            </h2>
            <p className="text-xs text-[#4a5568]">
              Dual-platform ratings, total problem mastery on hover, and live contest standings.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAddModal(!showAddModal)}
            className="btn-industrial-primary py-2 px-4 text-xs flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Friend</span>
          </button>

          <button
            onClick={handleRefreshAll}
            disabled={refreshing}
            className="btn-industrial-secondary py-2 px-3.5 text-xs flex items-center gap-1.5"
            title="Refresh all ratings and questions solved from Codeforces & LeetCode"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin text-[#ff4757]' : ''}`} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh All'}</span>
          </button>
        </div>
      </div>

      {/* Add Friend Collapsible Console */}
      {showAddModal && (
        <div className="industrial-card corner-screws p-5 border border-white/60 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#babecc]/50">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2d3436] uppercase font-mono">
              <Plus className="h-4 w-4 text-[#ff4757]" />
              <span>Enroll New Friend or Benchmark Handle</span>
            </div>
            <button
              onClick={() => setShowAddModal(false)}
              className="text-xs text-[#4a5568] hover:text-[#ff4757] font-mono"
            >
              ✕ Close
            </button>
          </div>

          <form onSubmit={handleAddFriendSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#4a5568] mb-1 font-mono uppercase">
                  Friend / Benchmark Name
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. tourist, Alex, Benq"
                  className="input-industrial w-full py-2 px-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#4a5568] mb-1 font-mono uppercase flex items-center gap-1">
                  <Code2 className="h-3 w-3 text-[#2d3436]" />
                  Codeforces Handle
                </label>
                <input
                  type="text"
                  value={newCf}
                  onChange={(e) => setNewCf(e.target.value)}
                  placeholder="e.g. tourist"
                  className="input-industrial w-full py-2 px-3 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#4a5568] mb-1 font-mono uppercase flex items-center gap-1">
                  <User className="h-3 w-3 text-[#ff4757]" />
                  LeetCode Username
                </label>
                <input
                  type="text"
                  value={newLc}
                  onChange={(e) => setNewLc(e.target.value)}
                  placeholder="e.g. neal_wu"
                  className="input-industrial w-full py-2 px-3 text-xs"
                />
              </div>
            </div>

            {addError && (
              <p className="text-xs text-[#ff4757] font-mono">{addError}</p>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#babecc]/30">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="btn-industrial-secondary py-1.5 px-3 text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={addLoading}
                className="btn-industrial-primary py-1.5 px-5 text-xs flex items-center gap-1.5"
              >
                {addLoading ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    <span>Enrolling &amp; Fetching...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Save to Roster</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ═══════ LIVE CONTEST & ARENA MONITORING STATION ═══════ */}
      <div className="industrial-card corner-screws p-5 border border-white/60 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-[#babecc]/50">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center justify-center">
              <Radio className="h-4 w-4 text-[#ff4757] animate-pulse" />
            </div>
            <span className="text-xs font-bold font-mono uppercase text-[#2d3436] tracking-wider">
              Contest Radar &amp; Live Ranking Arena
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono text-[#4a5568]">
            <Clock className="h-3.5 w-3.5 text-[#ff4757]" />
            <span>{contestsData.live?.length > 0 ? 'LIVE CONTEST IN PROGRESS' : 'AUTO-SCANNING SCHEDULE'}</span>
          </div>
        </div>

        {contestsLoading ? (
          <p className="text-xs text-[#4a5568] py-3 text-center font-mono animate-pulse">
            Scanning Codeforces &amp; LeetCode contest satellites...
          </p>
        ) : (contestsData.live || []).length > 0 ? (
          /* Active Live Contest Detected */
          <div className="space-y-3">
            {contestsData.live.map((c) => (
              <div key={c.id} className="p-4 rounded-xl bg-[#ecfdf5] border border-[#10b981]/50 space-y-3 shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-[#10b981] text-white text-[10px] font-extrabold font-mono flex items-center gap-1 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      LIVE NOW
                    </span>
                    <span className="text-xs font-bold text-[#065f46] font-mono">
                      {c.platform}: {c.name}
                    </span>
                  </div>

                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-mono text-[#065f46] hover:text-[#ff4757] flex items-center gap-1 underline font-bold"
                  >
                    <span>Open Contest Arena</span>
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>

                {/* Live Standings of Friends in this Contest */}
                <div>
                  <p className="text-[11px] font-bold font-mono text-[#047857] uppercase mb-1.5">
                    Live Friend Standings:
                  </p>
                  {friends.some(f => f.cf && contestsData.live_standings?.[f.cf.toLowerCase()]) ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {friends.map(f => {
                        const standing = f.cf ? contestsData.live_standings?.[f.cf.toLowerCase()] : null;
                        if (!standing) return null;
                        return (
                          <div key={f.id} className="p-2.5 rounded-lg bg-white/80 border border-[#10b981]/40 flex items-center justify-between">
                            <div>
                              <p className="text-xs font-bold text-[#065f46] font-mono">{f.name || f.cf}</p>
                              <p className="text-[10px] text-[#4a5568] font-mono">Points: {standing.points} · Pen: {standing.penalty}</p>
                            </div>
                            <span className="px-2 py-1 rounded bg-[#10b981] text-white text-xs font-mono font-extrabold shadow-sm">
                              Rank #{standing.rank}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-[#065f46]/80 font-mono">
                      No tracked friends currently participating in this active round.
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Upcoming Contests Grid */
          <div className="space-y-2">
            <div className="flex items-center justify-between text-[11px] font-mono text-[#4a5568]">
              <span>No live contest active right now. Next official rounds:</span>
              <span className="text-[10px] text-[#ff4757] font-bold">UPDATES AUTOMATICALLY</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {(contestsData.upcoming || []).slice(0, 3).map((uc) => {
                const startTime = uc.startTimeSeconds ? new Date(uc.startTimeSeconds * 1000) : null;
                const hoursAway = uc.startTimeSeconds ? Math.round((uc.startTimeSeconds - Date.now() / 1000) / 3600) : null;

                return (
                  <div
                    key={uc.id}
                    className="p-3 rounded-xl bg-[#f0f2f5] border border-white/60 shadow-[2px_2px_4px_#babecc,-2px_-2px_4px_#ffffff] flex flex-col justify-between gap-2"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="px-1.5 py-0.5 rounded bg-[#d8e0ea] text-[#2d3436] text-[10px] font-mono font-bold">
                          {uc.platform}
                        </span>
                        <span className="text-[10px] font-mono text-[#ff4757] font-bold">
                          {hoursAway && hoursAway > 0 ? `in ~${hoursAway}h` : 'Upcoming'}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-[#2d3436] mt-1.5 line-clamp-1 font-mono" title={uc.name}>
                        {uc.name}
                      </h4>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-[#babecc]/30 text-[10px] font-mono text-[#4a5568]">
                      <span>{startTime ? startTime.toLocaleDateString() : 'Scheduled'}</span>
                      <a
                        href={uc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#ff4757] hover:underline flex items-center gap-0.5 font-bold"
                      >
                        <span>Register</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Search Bar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#4a5568]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter friends by name, Codeforces handle, or LeetCode username..."
            className="input-industrial w-full py-2.5 pl-9 pr-3.5 text-xs"
          />
        </div>
      </div>

      {/* Friends Cards Grid */}
      {filteredFriends.length === 0 ? (
        <div className="industrial-card corner-screws p-10 text-center border border-white/60">
          <Users className="h-8 w-8 text-[#a3b1c6] mx-auto mb-2" />
          <p className="text-xs text-[#4a5568] font-mono">
            {searchQuery ? 'No friends match your search query.' : 'No friends added yet. Click [Add Friend] to track ratings and duels.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFriends.map((f) => {
            const isHovered = hoveredFriendId === f.id;
            const cfRating = f.cfRating || '—';
            const lcRating = f.lcRating || '—';
            const initial = (f.name || f.cf || f.lc || 'F').charAt(0).toUpperCase();

            // Total solved questions count (NOT easy/medium/hard bifurcation)
            const cfTotalSolved = f.cfSolved ?? 0;
            const lcTotalSolved = f.lcSolved ?? 0;
            const combinedQuestions = (Number(cfTotalSolved) || 0) + (Number(lcTotalSolved) || 0);

            // Live contest standing check for this friend
            const liveStanding = f.cf ? contestsData.live_standings?.[f.cf.toLowerCase()] : null;

            return (
              <div
                key={f.id}
                onMouseEnter={() => setHoveredFriendId(f.id)}
                onMouseLeave={() => setHoveredFriendId(null)}
                className={`industrial-card corner-screws p-5 flex flex-col justify-between transition-all relative ${
                  liveStanding ? 'border-[#10b981]/60 bg-[#f4fdf8]' : ''
                }`}
              >
                <div className="space-y-3.5">
                  {/* Top Header Card Info */}
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-[#babecc]/50">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-[#d8e0ea] text-[#ff4757] font-extrabold font-mono flex items-center justify-center shadow-[inset_1px_1px_2px_#babecc] flex-shrink-0">
                        {initial}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-[#2d3436] truncate font-mono" title={f.name}>
                          {f.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-[#4a5568] font-mono truncate">
                          {f.cf && <span>CF: <strong>@{f.cf}</strong></span>}
                          {f.lc && <span>LC: <strong>@{f.lc}</strong></span>}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteFriend(f.id)}
                      className="p-1 rounded text-[#a3b1c6] hover:text-[#ff4757] hover:bg-[#ffebee] transition-colors"
                      title="Remove Friend"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Dual Platform Ratings Badges */}
                  <div className="grid grid-cols-2 gap-2 font-mono">
                    {/* Codeforces Rating */}
                    <div className="industrial-panel p-2.5 text-center">
                      <div className="text-[10px] font-bold text-[#4a5568] uppercase flex items-center justify-center gap-1">
                        <Code2 className="h-3 w-3 text-[#2d3436]" />
                        <span>CF ELO</span>
                      </div>
                      <div className="text-sm font-extrabold text-[#2d3436] mt-0.5">
                        {cfRating}
                      </div>
                      <div className="text-[9px] text-[#ff4757] font-semibold truncate mt-0.5">
                        {f.cfRank || 'unrated'}
                      </div>
                    </div>

                    {/* LeetCode Rating */}
                    <div className="industrial-panel p-2.5 text-center">
                      <div className="text-[10px] font-bold text-[#4a5568] uppercase flex items-center justify-center gap-1">
                        <User className="h-3 w-3 text-[#ff4757]" />
                        <span>LC RATING</span>
                      </div>
                      <div className="text-sm font-extrabold text-[#ff4757] mt-0.5">
                        {lcRating}
                      </div>
                      <div className="text-[9px] text-[#4a5568] truncate mt-0.5">
                        Contest
                      </div>
                    </div>
                  </div>

                  {/* ═══════ ON HOVER: TOTAL QUESTIONS ON BOTH PLATFORMS ═══════ */}
                  {/* Clean total question counts on both platforms (NO easy/medium/hard bifurcation) */}
                  <div className={`p-2.5 rounded-xl border transition-all ${
                    isHovered
                      ? 'bg-[#d8e0ea] border-[#ff4757]/40 shadow-[inset_1.5px_1.5px_3px_#babecc]'
                      : 'bg-[#f0f2f5] border-white/60 shadow-sm'
                  }`}>
                    <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                      <span className="font-bold text-[#2d3436] flex items-center gap-1">
                        <Award className="h-3 w-3 text-[#ff4757]" />
                        <span>Total Questions Solved:</span>
                      </span>
                      <span className="font-extrabold text-[#ff4757]">{combinedQuestions}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1 border-t border-[#babecc]/30">
                      <div>
                        <span className="text-[#4a5568]">Codeforces: </span>
                        <strong className="text-[#2d3436]">{cfTotalSolved} solved</strong>
                      </div>
                      <div>
                        <span className="text-[#4a5568]">LeetCode: </span>
                        <strong className="text-[#2d3436]">{lcTotalSolved} solved</strong>
                      </div>
                    </div>
                  </div>

                  {/* Live Contest Badge if active */}
                  {liveStanding && (
                    <div className="p-2 rounded-lg bg-[#ecfdf5] border border-[#10b981]/50 text-xs font-mono text-[#065f46] flex items-center justify-between">
                      <span className="font-bold">⚡ Active in CF Round:</span>
                      <span className="font-extrabold bg-[#10b981] text-white px-1.5 py-0.5 rounded text-[10px]">
                        Rank #{liveStanding.rank}
                      </span>
                    </div>
                  )}
                </div>

                {/* 1-Click Launch Peer Duel Button */}
                <div className="mt-4 pt-3 border-t border-[#babecc]/40 flex justify-end">
                  <button
                    type="button"
                    onClick={() => onLaunchDuel && onLaunchDuel(f)}
                    className="btn-industrial-primary py-2 px-4 text-xs w-full flex items-center justify-center gap-2"
                  >
                    <Swords className="h-3.5 w-3.5" />
                    <span>Launch 1-Click Peer Duel</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
