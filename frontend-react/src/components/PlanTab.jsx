import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  Target,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  BookOpen,
  Sparkles,
  ArrowRight
} from 'lucide-react';
import confetti from 'canvas-confetti';

export default function PlanTab({
  planData,
  loading,
  onGeneratePlan,
  onRevisePlan,
  onApprovePlan,
  actionLoading
}) {
  const [goal, setGoal] = useState('Improve competitive programming skills');
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [feedback, setFeedback] = useState('');

  const plan = planData?.plan || {};
  const weeks = plan?.weeks || [];
  const isApproved = plan?.status === 'approved';
  const hasPlan = weeks.length > 0;

  const handleApprove = async () => {
    await onApprovePlan();
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 }
    });
  };

  const handleRevise = async () => {
    if (!feedback.trim()) return;
    await onRevisePlan(feedback);
    setFeedback('');
  };

  return (
    <div className="space-y-6">
      {/* Plan Configuration Console Panel */}
      <div className="industrial-card corner-screws p-6 border border-white/60">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#babecc]/50">
          <div className="flex items-center gap-2 text-xs font-bold text-[#2d3436] uppercase tracking-wider font-mono">
            <Sparkles className="h-4 w-4 text-[#ff4757]" />
            <span>Curriculum Synthesis Parameters</span>
          </div>
          <span className="text-[11px] text-[#4a5568] font-mono">HITL WORKFLOW</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Goal Input */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono">
              Target Goal / Focus
            </label>
            <input
              type="text"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Reach Expert on Codeforces / Master Graph Algorithms"
              className="input-industrial w-full py-2.5 px-3.5"
            />
          </div>

          {/* Duration */}
          <div>
            <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono">
              Duration
            </label>
            <select
              value={durationWeeks}
              onChange={(e) => setDurationWeeks(Number(e.target.value))}
              className="input-industrial w-full py-2.5 px-3.5 font-mono cursor-pointer"
            >
              <option value={2}>2 Weeks (Sprint)</option>
              <option value={4}>4 Weeks (Standard)</option>
              <option value={6}>6 Weeks (Deep Dive)</option>
              <option value={8}>8 Weeks (Mastery)</option>
            </select>
          </div>

          {/* Daily Commitment */}
          <div>
            <label className="block text-xs font-bold text-[#4a5568] mb-1.5 uppercase tracking-wider font-mono">
              Daily Hours
            </label>
            <select
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              className="input-industrial w-full py-2.5 px-3.5 font-mono cursor-pointer"
            >
              <option value={1}>1 Hour / Day</option>
              <option value={2}>2 Hours / Day</option>
              <option value={3}>3 Hours / Day</option>
              <option value={4}>4+ Hours / Day</option>
            </select>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-[#babecc]/40 flex justify-end">
          <button
            onClick={() => onGeneratePlan({ goal, duration_weeks: durationWeeks, hours_per_day: hoursPerDay })}
            disabled={loading || actionLoading}
            className="btn-industrial-primary py-2.5 px-6"
          >
            {loading ? (
              <>
                <span className="animate-spin">⟳</span>
                <span>Synthesizing Curriculum...</span>
              </>
            ) : (
              <>
                <span>Generate Tailored Plan</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Plan Status Banner */}
      {hasPlan && (
        <div
          className={`industrial-panel p-4 flex items-center justify-between gap-4 ${
            isApproved
              ? 'bg-[#ecfdf5] border-[#10b981]/50 text-[#065f46]'
              : 'bg-[#f0f2f5] border-white/60 text-[#2d3436]'
          }`}
        >
          <div className="flex items-center gap-3">
            {isApproved ? (
              <CheckCircle2 className="h-6 w-6 text-[#10b981] flex-shrink-0" />
            ) : (
              <Sparkles className="h-6 w-6 text-[#ff4757] flex-shrink-0" />
            )}
            <div>
              <p className="font-bold text-sm">
                {isApproved ? 'Study Plan Approved & Locked into Execution' : 'Draft Study Plan Ready for Human-in-the-Loop Review'}
              </p>
              <p className="text-xs text-[#4a5568] mt-0.5">
                {isApproved
                  ? 'Weekly curriculum targets, milestones, and practice sets are locked.'
                  : 'Inspect the weekly roadmap below. You may request revisions via prompt or approve immediately.'}
              </p>
            </div>
          </div>

          <span className="px-3 py-1 text-xs font-bold font-mono rounded-lg bg-[#e0e5ec] text-[#2d3436] shadow-[inset_1px_1px_2px_#babecc] uppercase">
            {plan.status || 'DRAFT'}
          </span>
        </div>
      )}

      {/* Weekly Plan Roadmap Modules */}
      {hasPlan && (
        <div className="space-y-4">
          <div className="text-sm font-bold text-[#2d3436] tracking-tight flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#ff4757]" />
            <span>Weekly Curriculum Roadmap [{weeks.length} Weeks]</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weeks.map((w, idx) => (
              <div
                key={idx}
                className="industrial-card corner-screws p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between pb-2 mb-3 border-b border-[#babecc]/50">
                    <span className="px-2.5 py-1 bg-[#d8e0ea] text-[#2d3436] rounded-md text-xs font-bold font-mono shadow-[inset_1px_1px_2px_#babecc]">
                      WEEK {String(w.week || idx + 1).padStart(2, '0')}
                    </span>
                    <span className="text-xs font-bold font-mono text-[#4a5568]">
                      Target: {w.problems_per_day || 3} probs / day
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-[#2d3436] mb-2 text-embossed">
                    {w.topic || 'Algorithmic Topic'}
                  </h4>

                  {/* Subtopics */}
                  {(w.subtopics || []).length > 0 && (
                    <div className="mb-3">
                      <p className="text-[11px] font-bold text-[#4a5568] uppercase font-mono mb-1.5">
                        Key Subtopics:
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {w.subtopics.map((s, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 rounded-md bg-[#d8e0ea] text-[#2d3436] text-[11px] font-mono shadow-[inset_1px_1px_2px_#babecc]"
                          >
                            #{s}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Resources */}
                  {(w.resources || []).length > 0 && (
                    <div>
                      <p className="text-[11px] font-bold text-[#4a5568] uppercase font-mono mb-1.5">
                        Verified Resources & Practice Sets:
                      </p>
                      <div className="space-y-1.5">
                        {w.resources.map((r, rIdx) => (
                          <a
                            key={rIdx}
                            href={r.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-2 rounded-lg bg-[#f0f2f5] hover:bg-[#ffffff] text-xs text-[#2d3436] hover:text-[#ff4757] shadow-[2px_2px_5px_#babecc,-2px_-2px_5px_#ffffff] transition-all group"
                          >
                            <span className="truncate pr-2 font-medium">{r.name || 'Practice Resource'}</span>
                            <ExternalLink className="h-3 w-3 text-[#a3b1c6] group-hover:text-[#ff4757] flex-shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* HITL Interactive Revision Bar (When in draft stage) */}
      {hasPlan && !isApproved && (
        <div className="industrial-card corner-screws p-6 border border-white/60 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-[#babecc]/50">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2d3436] uppercase tracking-wider font-mono">
              <MessageSquare className="h-4 w-4 text-[#ff4757]" />
              <span>Human-in-the-Loop (HITL) Refinement Interface</span>
            </div>
            <span className="text-xs text-[#4a5568] font-mono">STATUS: AWAITING_FEEDBACK</span>
          </div>

          <p className="text-xs text-[#4a5568]">
            Instruct the planner agent to modify modules (e.g. "Focus Week 2 on Segment Trees & Range Queries"):
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Enter revision instructions..."
              className="input-industrial flex-1 py-2.5 px-3.5 text-xs"
            />

            <button
              onClick={handleRevise}
              disabled={actionLoading || !feedback.trim()}
              className="btn-industrial-secondary py-2.5 px-5 text-xs"
            >
              {actionLoading ? <span>⟳ Revising...</span> : <span>Revise Plan</span>}
            </button>

            <button
              onClick={handleApprove}
              disabled={actionLoading}
              className="btn-industrial-primary py-2.5 px-6 text-xs"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>Approve & Lock In</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


