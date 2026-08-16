import React from 'react';
import { Sliders, Play, Code2, User, Sparkles } from 'lucide-react';

export default function HandleHeader({
  cfHandle,
  setCfHandle,
  lcHandle,
  setLcHandle,
  difficulty,
  setDifficulty,
  onRun,
  loading,
  actionText = 'Execute Pipeline',
}) {
  const presets = [
    { label: 'Sample 1', cf: 'Moderator', lc: 'doomscrollerfinalboss' },
    { label: 'Sample 2', cf: 'tourist', lc: 'neal_wu' },
    { label: 'Sample 3', cf: 'Ravindra19', lc: 'Ravindra056' },
  ];

  return (
    <div className="industrial-card corner-screws p-6 mb-8 border border-white/60">
      {/* Top Header Label & Vent Slots */}
      <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#babecc]/50">
        <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wider text-[#2d3436] font-mono">
          <Sliders className="h-3.5 w-3.5 text-[#ff4757]" />
          <span>Profile Target Inputs</span>
        </div>
        
        {/* Decorative Industrial Vent Slots */}
        <div className="flex items-center gap-1">
          <div className="vent-slot" />
          <div className="vent-slot" />
          <div className="vent-slot" />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
        {/* Recessed Input Wells & Optional Difficulty Switch */}
        <div className={`grid grid-cols-1 ${difficulty ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4 flex-1`}>
          {/* Codeforces Input */}
          <div>
            <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-[#2d3436]" />
              Codeforces Handle
            </label>
            <div className="relative">
              <input
                type="text"
                value={cfHandle}
                onChange={(e) => setCfHandle(e.target.value)}
                placeholder="e.g. tourist, Moderator"
                className="input-industrial w-full py-2.5 px-3.5"
              />
            </div>
          </div>

          {/* LeetCode Input */}
          <div>
            <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-[#ff4757]" />
              LeetCode Handle
            </label>
            <div className="relative">
              <input
                type="text"
                value={lcHandle}
                onChange={(e) => setLcHandle(e.target.value)}
                placeholder="e.g. neal_wu, doomscrollerfinalboss"
                className="input-industrial w-full py-2.5 px-3.5"
              />
            </div>
          </div>

          {/* Blended Difficulty Switch (when on problems tab) */}
          {difficulty && setDifficulty && (
            <div>
              <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-[#ff4757]" />
                Difficulty Tier
              </label>
              <div className="flex p-1 bg-[#d8e0ea] rounded-xl shadow-[inset_2px_2px_4px_#babecc,inset_-2px_-2px_4px_#ffffff] h-[42px] items-center">
                {['easy', 'medium', 'hard'].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDifficulty(d)}
                    className={`flex-1 py-1.5 text-xs font-bold uppercase transition-all duration-150 cursor-pointer rounded-lg font-mono ${
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
          )}
        </div>

        {/* Primary Safety-Orange Push Button */}
        {onRun && (
          <div className="flex items-center">
            <button
              onClick={onRun}
              disabled={loading || (!cfHandle.trim() && !lcHandle.trim())}
              className="btn-industrial-primary w-full sm:w-auto h-[44px] px-7"
            >
              {loading ? (
                <>
                  <span className="inline-block animate-spin">⟳</span>
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-white" />
                  <span>{actionText}</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Preset Profiles Bar */}
      <div className="mt-4 pt-3 border-t border-[#babecc]/40 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[#4a5568] text-xs font-bold font-mono uppercase tracking-wide">
          Quick Load:
        </span>
        {presets.map((p, idx) => (
          <button
            key={idx}
            onClick={() => {
              setCfHandle(p.cf);
              setLcHandle(p.lc);
            }}
            className="btn-industrial-secondary py-1 px-2.5 text-[11px] font-mono"
          >
            {p.cf} / {p.lc}
          </button>
        ))}
      </div>
    </div>
  );
}


