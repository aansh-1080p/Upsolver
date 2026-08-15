import React, { useState } from 'react';
import {
  ExternalLink,
  Search,
  Zap,
  Tag,
  SlidersHorizontal,
  Code
} from 'lucide-react';

export default function ProblemsTab({
  problemsData,
  loading,
  onSearchProblems,
  difficulty,
  setDifficulty
}) {
  const [platformFilter, setPlatformFilter] = useState('all');
  const [tagQuery, setTagQuery] = useState('');

  const problems = problemsData?.problems || [];
  const weakTopics = problemsData?.weak_topics || [];

  // Filter problems by platform and tag
  const filteredProblems = problems.filter((p) => {
    const matchPlat = platformFilter === 'all' || p.platform?.toLowerCase() === platformFilter;
    const matchTag =
      !tagQuery.trim() ||
      (p.tags || []).some((t) => t.toLowerCase().includes(tagQuery.toLowerCase())) ||
      (p.title || '').toLowerCase().includes(tagQuery.toLowerCase());
    return matchPlat && matchTag;
  });

  const getDifficultyBadge = (diff) => {
    switch (diff?.toLowerCase()) {
      case 'easy':
        return 'text-[#10b981] bg-[#ecfdf5] border border-[#10b981]/30';
      case 'medium':
        return 'text-[#f59e0b] bg-[#fffbeb] border border-[#f59e0b]/30';
      case 'hard':
        return 'text-[#ff4757] bg-[#fff1f2] border border-[#ff4757]/30';
      default:
        return 'text-[#4a5568] bg-[#d8e0ea] border border-[#babecc]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Control Bar: Difficulty, Query, and Search Trigger */}
      <div className="industrial-card corner-screws p-6 border border-white/60">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* 3-Position Tactile Difficulty Switch */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-[#4a5568] uppercase tracking-wider font-mono flex items-center gap-1.5">
              <SlidersHorizontal className="h-3.5 w-3.5 text-[#ff4757]" />
              Target Difficulty:
            </span>
            <div className="flex p-1 bg-[#d8e0ea] rounded-xl shadow-[inset_2px_2px_4px_#babecc,inset_-2px_-2px_4px_#ffffff]">
              {['easy', 'medium', 'hard'].map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficulty(d)}
                  className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-all duration-150 cursor-pointer rounded-lg font-mono ${
                    difficulty === d
                      ? 'bg-[#e0e5ec] text-[#ff4757] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff]'
                      : 'text-[#4a5568] hover:text-[#2d3436]'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          {/* Trigger Button */}
          <button
            onClick={onSearchProblems}
            disabled={loading}
            className="btn-industrial-primary py-2.5 px-6"
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span>
                <span>Scanning Problem Banks...</span>
              </>
            ) : (
              <>
                <Zap className="h-4 w-4" />
                <span>Discover Practice Problems</span>
              </>
            )}
          </button>
        </div>

        {/* Weak Topic Chips Banner */}
        {weakTopics.length > 0 && (
          <div className="mt-4 pt-3 border-t border-[#babecc]/40 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-[#4a5568] text-xs font-bold font-mono uppercase tracking-wide">
              Target Gap Topics:
            </span>
            {weakTopics.slice(0, 6).map((t, idx) => (
              <button
                key={idx}
                onClick={() => setTagQuery(t.tag)}
                className="btn-industrial-secondary py-1 px-2.5 text-[11px] font-mono"
              >
                #{t.tag} ({t.fail_rate}% fail)
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Filter / Search Bar */}
      {problems.length > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {/* Platform Tabs */}
          <div className="flex items-center flex-wrap gap-1.5 p-1 bg-[#d8e0ea] rounded-xl shadow-[inset_2px_2px_4px_#babecc,inset_-2px_-2px_4px_#ffffff] w-full sm:w-auto">
            {['all', 'codeforces', 'cses', 'leetcode'].map((plat) => (
              <button
                key={plat}
                onClick={() => setPlatformFilter(plat)}
                className={`px-3.5 py-1.5 text-xs font-bold uppercase transition-all duration-150 cursor-pointer rounded-lg font-mono ${
                  platformFilter === plat
                    ? 'bg-[#e0e5ec] text-[#ff4757] shadow-[inset_1px_1px_3px_#babecc,inset_-1px_-1px_3px_#ffffff]'
                    : 'text-[#4a5568] hover:text-[#2d3436]'
                }`}
              >
                {plat === 'all' ? `All (${problems.length})` : plat}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="Filter by tag (dp, graph...)"
              className="input-industrial w-full py-2 px-3.5 text-xs"
            />
          </div>
        </div>
      )}

      {/* Problems Grid */}
      {loading ? (
        <div className="industrial-card corner-screws p-10 text-center border border-white/60">
          <p className="text-xs font-bold text-[#2d3436] uppercase font-mono">
            Scanning Codeforces, CSES, and LeetCode problem banks...
          </p>
        </div>
      ) : filteredProblems.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProblems.map((p, idx) => (
            <div
              key={idx}
              className="industrial-card corner-screws p-4 flex flex-col justify-between"
            >
              <div>
                {/* Platform & Difficulty Badges */}
                <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[#babecc]/40">
                  <span className="px-2 py-0.5 bg-[#d8e0ea] text-[#2d3436] rounded-md text-[10px] font-bold font-mono shadow-[inset_1px_1px_2px_#babecc] uppercase">
                    {p.platform}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {p.rating && (
                      <span className="px-2 py-0.5 text-[10px] font-bold bg-[#d8e0ea] text-[#2d3436] rounded-md shadow-[inset_1px_1px_2px_#babecc] font-mono">
                        CF:{p.rating}
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded-md uppercase font-mono ${getDifficultyBadge(
                        p.difficulty
                      )}`}
                    >
                      {p.difficulty || 'MEDIUM'}
                    </span>
                  </div>
                </div>

                {/* Problem Title */}
                <h4 className="text-xs font-bold text-[#2d3436] hover:text-[#ff4757] transition-colors line-clamp-1 mb-2">
                  {p.title}
                </h4>

                {/* Problem Tags */}
                <div className="flex flex-wrap gap-1 mb-3">
                  {(p.tags || []).slice(0, 3).map((t, tIdx) => (
                    <span
                      key={tIdx}
                      className="px-1.5 py-0.5 text-[10px] text-[#4a5568] bg-[#f0f2f5] rounded-md shadow-[1px_1px_2px_#babecc,-1px_-1px_2px_#ffffff] font-mono"
                    >
                      #{t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Solve Link */}
              <div className="pt-2.5 border-t border-[#babecc]/40 flex items-center justify-between text-xs">
                {p.relevance ? (
                  <span className="text-[10px] text-[#ff4757] font-mono font-bold">
                    [{p.relevance} MATCH]
                  </span>
                ) : (
                  <span className="text-[10px] text-[#4a5568] font-mono">Practice item</span>
                )}

                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-industrial-secondary py-1 px-3 text-[11px] font-mono flex items-center gap-1"
                >
                  <span>Solve Task</span>
                  <ExternalLink className="h-3 w-3 text-[#ff4757]" />
                </a>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="industrial-card corner-screws p-12 text-center border border-white/60">
          <Zap className="h-10 w-10 text-[#a3b1c6] mx-auto mb-3" />
          <h3 className="text-base font-bold text-[#2d3436] text-embossed">No Problems Loaded</h3>
          <p className="text-xs text-[#4a5568] mt-1 max-w-sm mx-auto">
            Click <strong>[Discover Practice Problems]</strong> to scan Codeforces, CSES, and LeetCode for your gap areas.
          </p>
        </div>
      )}
    </div>
  );
}


