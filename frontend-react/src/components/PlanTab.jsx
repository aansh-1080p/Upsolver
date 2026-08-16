import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Target,
  CheckCircle2,
  Circle,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  BookOpen,
  Sparkles,
  ArrowRight,
  Trash2,
  Download,
  Check,
  ListChecks,
  FolderKanban,
  ChevronDown,
  ChevronUp,
  Award,
  Edit3,
  RotateCcw,
  Sliders,
  Flag
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  getSavedPlans,
  savePlanToServer,
  updatePlanProgress,
  deletePlanFromServer
} from '../api';

export default function PlanTab({
  planData,
  setPlanData,
  loading,
  onGeneratePlan,
  onRevisePlan,
  onApprovePlan,
  actionLoading,
  cfHandle,
  lcHandle
}) {
  const [goal, setGoal] = useState('Improve competitive programming skills');
  const [durationWeeks, setDurationWeeks] = useState(4);
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [feedback, setFeedback] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [showSavedList, setShowSavedList] = useState(false);

  // Saved Plans list state
  const [savedPlans, setSavedPlans] = useState([]);
  const [savedPlansLoading, setSavedPlansLoading] = useState(false);

  // Weekly Progress Tracker State
  // { completedSubtopics: { [subtopicKey]: boolean }, reattempt: { [weekIdx]: boolean }, notes: { [weekIdx]: string } }
  const [progress, setProgress] = useState({
    completedSubtopics: {},
    reattempt: {},
    notes: {}
  });

  const plan = planData?.plan || {};
  const weeks = plan?.weeks || [];
  const isApproved = plan?.status === 'approved';
  const hasPlan = weeks.length > 0;
  const planKey = useMemo(() => `plan_${(cfHandle || '').trim()}_${(lcHandle || '').trim()}`, [cfHandle, lcHandle]);

  // Load saved plans list from backend and localStorage
  const refreshSavedPlans = useCallback(async () => {
    setSavedPlansLoading(true);
    try {
      // 1. Fetch from server
      const serverRes = await getSavedPlans().catch(() => ({ plans: [] }));
      const serverList = serverRes.plans || [];

      // 2. Fetch from localStorage fallback
      let localPlans = [];
      try {
        const raw = localStorage.getItem('upsolver_saved_plans');
        if (raw) localPlans = Object.values(JSON.parse(raw));
      } catch (e) {
        console.error('Error parsing local saved plans:', e);
      }

      // Merge unique by key
      const mergedMap = {};
      serverList.forEach((p) => { mergedMap[p.key] = p; });
      localPlans.forEach((p) => {
        if (!mergedMap[p.key] || new Date(p.updatedAt || p.savedAt) > new Date(mergedMap[p.key].updatedAt || mergedMap[p.key].savedAt)) {
          mergedMap[p.key] = p;
        }
      });

      const list = Object.values(mergedMap);
      list.sort((a, b) => new Date(b.updatedAt || b.savedAt || 0) - new Date(a.updatedAt || a.savedAt || 0));
      setSavedPlans(list);
    } catch (err) {
      console.error('Failed to load saved plans:', err);
    } finally {
      setSavedPlansLoading(false);
    }
  }, []);

  // Initial load of saved plans & active plan on handle change
  useEffect(() => {
    refreshSavedPlans();
  }, [refreshSavedPlans]);

  // Sync plan and progress when planData or handles change
  useEffect(() => {
    if (planData?.progress) {
      setProgress(planData.progress);
    } else {
      // Try to load progress for this plan from localStorage
      try {
        const savedProgress = localStorage.getItem(`upsolver_progress_${planKey}`);
        if (savedProgress) {
          setProgress(JSON.parse(savedProgress));
        } else {
          setProgress({ completedSubtopics: {}, reattempt: {}, notes: {} });
        }
      } catch (e) {
        // ignore
      }
    }

    if (hasPlan && isApproved) {
      setShowConfig(false);
    }
  }, [planData, planKey, hasPlan, isApproved]);

  // Save progress helper (updates localStorage and backend)
  const saveProgressState = useCallback(async (newProgress) => {
    setProgress(newProgress);
    try {
      localStorage.setItem(`upsolver_progress_${planKey}`, JSON.stringify(newProgress));

      // Update in savedPlans local map
      const raw = localStorage.getItem('upsolver_saved_plans');
      const all = raw ? JSON.parse(raw) : {};
      if (all[planKey]) {
        all[planKey].progress = newProgress;
        all[planKey].updatedAt = new Date().toISOString();
        localStorage.setItem('upsolver_saved_plans', JSON.stringify(all));
      }

      // Sync with server
      await updatePlanProgress(planKey, newProgress).catch(() => {});
      refreshSavedPlans();
    } catch (err) {
      console.error('Failed to persist progress:', err);
    }
  }, [planKey, refreshSavedPlans]);

  // Compute status automatically for a week based on its subtopics
  const getWeekStatus = useCallback((wIdx) => {
    const subtopics = weeks[wIdx]?.subtopics || [];
    if (subtopics.length === 0) return 'not_started';
    const doneCount = subtopics.filter((s) => progress.completedSubtopics?.[`w${wIdx}_${s}`]).length;
    if (doneCount === 0) return 'not_started';
    if (doneCount === subtopics.length) return 'completed';
    return 'in_progress';
  }, [weeks, progress.completedSubtopics]);

  // Overall Statistics Calculation
  const stats = useMemo(() => {
    let totalSubtopics = 0;
    let completedSubtopicsCount = 0;
    let completedWeeksCount = 0;
    let reattemptCount = 0;

    weeks.forEach((w, wIdx) => {
      const subtopics = w.subtopics || [];
      totalSubtopics += subtopics.length;
      let weekDoneCount = 0;
      subtopics.forEach((s) => {
        const key = `w${wIdx}_${s}`;
        if (progress.completedSubtopics?.[key]) {
          completedSubtopicsCount++;
          weekDoneCount++;
        }
      });

      if (progress.reattempt?.[wIdx]) {
        reattemptCount++;
      }

      const isWeekDone = subtopics.length > 0 && weekDoneCount === subtopics.length;
      if (isWeekDone) completedWeeksCount++;
    });

    const percent = totalSubtopics > 0
      ? Math.round((completedSubtopicsCount / totalSubtopics) * 100)
      : 0;

    return {
      totalSubtopics,
      completedSubtopicsCount,
      reattemptCount,
      totalWeeks: weeks.length,
      completedWeeksCount,
      percent
    };
  }, [weeks, progress]);

  // Toggle Subtopic Completion (Auto updates week status)
  const toggleSubtopic = (wIdx, subtopic) => {
    const key = `w${wIdx}_${subtopic}`;
    const nextCompleted = !progress.completedSubtopics?.[key];
    const newCompletedSubtopics = {
      ...progress.completedSubtopics,
      [key]: nextCompleted
    };

    // Check if this action completes all subtopics in this week
    const currentWeekSubtopics = weeks[wIdx]?.subtopics || [];
    const allWeekDone = currentWeekSubtopics.length > 0 && currentWeekSubtopics.every((s) => `w${wIdx}_${s}` === key ? nextCompleted : progress.completedSubtopics?.[`w${wIdx}_${s}`]);

    if (nextCompleted && allWeekDone) {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.7 }
      });
    }

    const updated = {
      ...progress,
      completedSubtopics: newCompletedSubtopics
    };
    saveProgressState(updated);
  };

  // Toggle Re-attempt Flag for a section / week
  const toggleReattempt = (wIdx) => {
    const updated = {
      ...progress,
      reattempt: {
        ...progress.reattempt,
        [wIdx]: !progress.reattempt?.[wIdx]
      }
    };
    saveProgressState(updated);
  };

  // Update Week Notes
  const setWeekNotes = (wIdx, text) => {
    const updated = {
      ...progress,
      notes: {
        ...progress.notes,
        [wIdx]: text
      }
    };
    saveProgressState(updated);
  };

  // Handle Plan Approval
  const handleApprove = async () => {
    await onApprovePlan();
    confetti({
      particleCount: 100,
      spread: 80,
      origin: { y: 0.6 }
    });

    // Save locally
    const initialProgress = {
      completedSubtopics: {},
      reattempt: {},
      notes: {}
    };
    const now = new Date().toISOString();
    const entry = {
      key: planKey,
      cf: cfHandle.trim(),
      lc: lcHandle.trim(),
      plan: { ...plan, status: 'approved' },
      label: `${cfHandle || '?'}/${lcHandle || '?'} — ${weeks.length} weeks`,
      status: 'approved',
      savedAt: now,
      updatedAt: now,
      progress: initialProgress
    };

    try {
      const raw = localStorage.getItem('upsolver_saved_plans');
      const all = raw ? JSON.parse(raw) : {};
      all[planKey] = entry;
      localStorage.setItem('upsolver_saved_plans', JSON.stringify(all));
      localStorage.setItem(`upsolver_progress_${planKey}`, JSON.stringify(initialProgress));
      await savePlanToServer(entry).catch(() => {});
      refreshSavedPlans();
    } catch (e) {
      console.error('Error saving plan on approve:', e);
    }
  };

  const handleRevise = async () => {
    if (!feedback.trim()) return;
    await onRevisePlan(feedback);
    setFeedback('');
  };

  // Load a Saved Plan from list
  const handleLoadSavedPlan = (entry) => {
    setPlanData({
      plan: entry.plan,
      progress: entry.progress || { completedSubtopics: {}, reattempt: {}, notes: {} }
    });
    setProgress(entry.progress || { completedSubtopics: {}, reattempt: {}, notes: {} });
    setShowConfig(false);
  };

  // Delete a Saved Plan
  const handleDeleteSavedPlan = async (key, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this saved plan?')) return;

    try {
      const raw = localStorage.getItem('upsolver_saved_plans');
      const all = raw ? JSON.parse(raw) : {};
      delete all[key];
      localStorage.setItem('upsolver_saved_plans', JSON.stringify(all));
      localStorage.removeItem(`upsolver_progress_${key}`);

      await deletePlanFromServer(key).catch(() => {});
      refreshSavedPlans();

      if (planKey === key) {
        setPlanData(null);
        setProgress({ completedSubtopics: {}, reattempt: {}, notes: {} });
      }
    } catch (err) {
      console.error('Failed to delete saved plan:', err);
    }
  };

  // Reset Progress for current plan
  const handleResetProgress = () => {
    if (!window.confirm('Reset all checked milestones and flags for this plan?')) return;
    const resetState = { completedSubtopics: {}, reattempt: {}, notes: {} };
    saveProgressState(resetState);
  };

  // Export Plan as Markdown or JSON
  const handleExportPlan = (format = 'markdown') => {
    let content = '';
    let mimeType = 'text/plain';
    let filename = `Upsolver_Plan_${cfHandle || 'user'}_${lcHandle || 'user'}`;

    if (format === 'json') {
      content = JSON.stringify({ plan, progress, stats }, null, 2);
      mimeType = 'application/json';
      filename += '.json';
    } else {
      filename += '.md';
      content = `# Upsolver Competitive Programming Study Plan\n\n`;
      content += `**Profile:** Codeforces: \`${cfHandle || 'N/A'}\` | LeetCode: \`${lcHandle || 'N/A'}\`\n`;
      content += `**Status:** ${plan.status || 'Draft'} (${stats.percent}% Completed)\n`;
      content += `**Duration:** ${weeks.length} Weeks\n\n`;
      content += `## Overall Progress\n`;
      content += `- **Subtopics Mastered:** ${stats.completedSubtopicsCount} / ${stats.totalSubtopics}\n`;
      content += `- **Sections Flagged for Re-attempt:** ${stats.reattemptCount}\n`;
      content += `- **Modules Completed:** ${stats.completedWeeksCount} / ${stats.totalWeeks}\n\n`;
      content += `## Weekly Roadmap\n\n`;

      weeks.forEach((w, idx) => {
        const wIdx = idx;
        const status = getWeekStatus(wIdx);
        const statusLabel = status === 'completed' ? 'Completed' : status === 'in_progress' ? 'In Progress' : 'Not Started';
        const isReattempt = !!progress.reattempt?.[wIdx];
        content += `### Week ${w.week || idx + 1}: ${w.topic || 'Topic'} [${statusLabel}]${isReattempt ? ' 🚩 [Re-attempt Later]' : ''}\n`;
        content += `*Target:* ${w.problems_per_day || 3} problems/day\n\n`;

        if ((w.subtopics || []).length > 0) {
          content += `**Subtopics:**\n`;
          w.subtopics.forEach((s) => {
            const checked = progress.completedSubtopics?.[`w${wIdx}_${s}`] ? '[x]' : '[ ]';
            content += `- ${checked} ${s}\n`;
          });
          content += `\n`;
        }

        if ((w.resources || []).length > 0) {
          content += `**Curated Resources:**\n`;
          w.resources.forEach((r) => {
            content += `- [${r.name}](${r.url})\n`;
          });
          content += `\n`;
        }

        if (progress.notes?.[wIdx]) {
          content += `**Weekly Notes:**\n> ${progress.notes[wIdx]}\n\n`;
        }
      });
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Bar with Saved Plans Drawer Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSavedList(!showSavedList)}
            className="btn-industrial-secondary py-2 px-4 text-xs flex items-center gap-2"
          >
            <FolderKanban className="h-3.5 w-3.5 text-[#ff4757]" />
            <span>Saved Plans ({savedPlans.length})</span>
            {showSavedList ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="btn-industrial-secondary py-2 px-3.5 text-xs flex items-center gap-1.5"
          >
            <Sliders className="h-3.5 w-3.5 text-[#4a5568]" />
            <span>{showConfig ? 'Hide Generator' : 'New Plan Config'}</span>
          </button>
        </div>

        {hasPlan && isApproved && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportPlan('markdown')}
              className="btn-industrial-secondary py-1.5 px-3 text-xs flex items-center gap-1.5"
              title="Download Plan as Markdown"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export .md</span>
            </button>

            <button
              onClick={handleResetProgress}
              className="btn-industrial-secondary py-1.5 px-3 text-xs flex items-center gap-1.5 text-[#e17055]"
              title="Reset checked subtopics and re-attempt flags"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Progress</span>
            </button>
          </div>
        )}
      </div>

      {/* Saved Plans Dropdown / Drawer */}
      {showSavedList && (
        <div className="industrial-card corner-screws p-5 border border-white/60 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#babecc]/50">
            <div className="flex items-center gap-2 text-xs font-bold text-[#2d3436] uppercase font-mono">
              <FolderKanban className="h-4 w-4 text-[#ff4757]" />
              <span>Persistent Saved Plans Archive</span>
            </div>
            <span className="text-[11px] font-mono text-[#4a5568]">Auto-synced local & server</span>
          </div>

          {savedPlansLoading ? (
            <p className="text-xs text-[#4a5568] py-4 text-center">Loading saved plans archive...</p>
          ) : savedPlans.length === 0 ? (
            <p className="text-xs text-[#4a5568] py-3 text-center">
              No saved plans yet. Generate and approve a study plan to archive it here.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto pr-1">
              {savedPlans.map((entry) => {
                const isActive = entry.key === planKey;
                const entryWeeks = entry.plan?.weeks || [];
                const entryProgress = entry.progress || {};
                let entrySubDone = 0;
                let entrySubTotal = 0;
                entryWeeks.forEach((w, wIdx) => {
                  (w.subtopics || []).forEach((s) => {
                    entrySubTotal++;
                    if (entryProgress.completedSubtopics?.[`w${wIdx}_${s}`]) entrySubDone++;
                  });
                });
                const pct = entrySubTotal > 0 ? Math.round((entrySubDone / entrySubTotal) * 100) : 0;

                return (
                  <div
                    key={entry.key}
                    onClick={() => handleLoadSavedPlan(entry)}
                    className={`p-3.5 rounded-xl cursor-pointer transition-all flex items-center justify-between gap-3 ${
                      isActive
                        ? 'bg-[#d8e0ea] border border-[#ff4757]/40 shadow-[inset_2px_2px_4px_#babecc]'
                        : 'bg-[#f0f2f5] hover:bg-[#ffffff] shadow-[3px_3px_7px_#babecc,-3px_-3px_7px_#ffffff]'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#2d3436] truncate">
                          {entry.label || `${entry.cf}/${entry.lc}`}
                        </span>
                        {isActive && (
                          <span className="px-1.5 py-0.5 rounded bg-[#ff4757] text-white text-[10px] font-bold font-mono">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[11px] text-[#4a5568] font-mono">
                        <span>{new Date(entry.savedAt || entry.updatedAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="text-[#10b981] font-bold">{pct}% completed</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={(e) => handleDeleteSavedPlan(entry.key, e)}
                        className="p-1.5 rounded-lg text-[#a3b1c6] hover:text-[#ff4757] hover:bg-[#ffebee] transition-colors"
                        title="Delete Plan"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Plan Configuration Console Panel (Collapsible) */}
      {showConfig && (
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
      )}

      {/* Plan Status & Progress Tracker Hero Banner */}
      {hasPlan && (
        <div
          className={`industrial-panel p-5 space-y-4 ${
            isApproved
              ? 'bg-[#ecfdf5] border-[#10b981]/50 text-[#065f46]'
              : 'bg-[#f0f2f5] border-white/60 text-[#2d3436]'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {isApproved ? (
                <CheckCircle2 className="h-7 w-7 text-[#10b981] flex-shrink-0" />
              ) : (
                <Sparkles className="h-7 w-7 text-[#ff4757] flex-shrink-0" />
              )}
              <div>
                <p className="font-bold text-sm">
                  {isApproved
                    ? 'Interactive Study Plan Active & Tracked'
                    : 'Draft Study Plan Ready for Human-in-the-Loop Review'}
                </p>
                <p className="text-xs text-[#4a5568] mt-0.5">
                  {isApproved
                    ? 'Check off completed subtopics to automatically track progress. Use the toggle to flag sections you want to re-attempt later.'
                    : 'Inspect the weekly roadmap below. You may request revisions via prompt or approve immediately.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="px-3 py-1 text-xs font-bold font-mono rounded-lg bg-[#e0e5ec] text-[#2d3436] shadow-[inset_1px_1px_2px_#babecc] uppercase">
                {plan.status || 'DRAFT'}
              </span>
            </div>
          </div>

          {/* Progress Metrics Overview (Visible when approved) */}
          {isApproved && (
            <div className="pt-3 border-t border-[#10b981]/20 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-white/70 shadow-sm">
                <div className="text-[11px] text-[#4a5568] uppercase font-bold flex items-center gap-1">
                  <Award className="h-3.5 w-3.5 text-[#10b981]" />
                  <span>Completion</span>
                </div>
                <div className="text-base font-extrabold text-[#065f46] mt-0.5">{stats.percent}%</div>
                <div className="w-full bg-[#d1fae5] rounded-full h-1.5 mt-1.5 overflow-hidden">
                  <div
                    className="bg-[#10b981] h-1.5 rounded-full transition-all duration-500"
                    style={{ width: `${stats.percent}%` }}
                  />
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-white/70 shadow-sm">
                <div className="text-[11px] text-[#4a5568] uppercase font-bold flex items-center gap-1">
                  <ListChecks className="h-3.5 w-3.5 text-[#3b82f6]" />
                  <span>Subtopics</span>
                </div>
                <div className="text-base font-extrabold text-[#1e40af] mt-0.5">
                  {stats.completedSubtopicsCount} / {stats.totalSubtopics}
                </div>
                <div className="text-[10px] text-[#6b7280] mt-0.5">mastered</div>
              </div>

              <div className="p-2.5 rounded-lg bg-white/70 shadow-sm">
                <div className="text-[11px] text-[#4a5568] uppercase font-bold flex items-center gap-1">
                  <Flag className="h-3.5 w-3.5 text-[#e11d48]" />
                  <span>Re-attempt</span>
                </div>
                <div className="text-base font-extrabold text-[#be123c] mt-0.5">{stats.reattemptCount} Sections</div>
                <div className="text-[10px] text-[#6b7280] mt-0.5">flagged to revisit</div>
              </div>

              <div className="p-2.5 rounded-lg bg-white/70 shadow-sm">
                <div className="text-[11px] text-[#4a5568] uppercase font-bold flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-[#8b5cf6]" />
                  <span>Weeks Done</span>
                </div>
                <div className="text-base font-extrabold text-[#5b21b6] mt-0.5">
                  {stats.completedWeeksCount} / {stats.totalWeeks}
                </div>
                <div className="text-[10px] text-[#6b7280] mt-0.5">modules completed</div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Weekly Plan Roadmap Modules with Interactive Tracker */}
      {hasPlan && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-bold text-[#2d3436] tracking-tight flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-[#ff4757]" />
              <span>Weekly Curriculum Roadmap & Tracker [{weeks.length} Weeks]</span>
            </div>
            {isApproved && (
              <span className="text-xs font-mono text-[#4a5568]">
                Check subtopics to auto-update status
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {weeks.map((w, idx) => {
              const wIdx = idx;
              const subtopics = w.subtopics || [];
              const currentStatus = getWeekStatus(wIdx);
              const isWeekDone = currentStatus === 'completed';
              const isReattempt = !!progress.reattempt?.[wIdx];

              return (
                <div
                  key={idx}
                  className={`industrial-card corner-screws p-5 flex flex-col justify-between transition-all ${
                    isReattempt
                      ? 'bg-[#f38a93] border border-[#f0717c] text-white shadow-[0_6px_20px_rgba(243,138,147,0.4)]'
                      : isWeekDone
                      ? 'border-[#10b981]/50 bg-[#f4fdf8]'
                      : ''
                  }`}
                >
                  <div className="space-y-3.5">
                    {/* Header */}
                    <div className={`flex items-center justify-between pb-2 border-b ${isReattempt ? 'border-white/30' : 'border-[#babecc]/50'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-bold font-mono ${
                          isReattempt
                            ? 'bg-white/20 text-white shadow-none'
                            : 'bg-[#d8e0ea] text-[#2d3436] shadow-[inset_1px_1px_2px_#babecc]'
                        }`}>
                          WEEK {String(w.week || idx + 1).padStart(2, '0')}
                        </span>

                        {/* Automatic Status Badge (Read-only, auto-handled) */}
                        {isApproved && (
                          <span
                            className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border select-none ${
                              isReattempt
                                ? 'bg-white/25 text-white border-white/40'
                                : currentStatus === 'completed'
                                ? 'bg-[#d1fae5] text-[#065f46] border-[#10b981]'
                                : currentStatus === 'in_progress'
                                ? 'bg-[#fef3c7] text-[#92400e] border-[#f59e0b]'
                                : 'bg-[#e0e5ec] text-[#4a5568] border-[#babecc]'
                            }`}
                          >
                            {currentStatus === 'completed' ? '🟢 Completed' : currentStatus === 'in_progress' ? '🟡 In Progress' : '⚪ Not Started'}
                          </span>
                        )}

                        {/* Re-attempt Flag Toggle */}
                        {isApproved && (
                          <button
                            type="button"
                            onClick={() => toggleReattempt(wIdx)}
                            title={isReattempt ? 'Flagged to re-attempt later (Click to unflag)' : 'Flag this section to re-attempt later'}
                            className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border transition-all flex items-center gap-1.5 cursor-pointer ${
                              isReattempt
                                ? 'bg-white text-[#f38a93] border-white shadow-md'
                                : 'bg-[#f0f2f5] text-[#64748b] border-[#cbd5e1] hover:text-[#0f172a] hover:bg-[#ffffff] shadow-[1px_1px_2px_#babecc]'
                            }`}
                          >
                            <Flag className={`h-3 w-3 ${isReattempt ? 'fill-[#f38a93] text-[#f38a93]' : 'text-[#94a3b8]'}`} />
                            <span>{isReattempt ? 'Re-attempt Flagged' : 'Re-attempt Later'}</span>
                          </button>
                        )}
                      </div>

                      <span className={`text-xs font-bold font-mono ${isReattempt ? 'text-white/90' : 'text-[#4a5568]'}`}>
                        Target: {w.problems_per_day || 3} probs / day
                      </span>
                    </div>

                    {/* Topic Title */}
                    <h4 className={`text-sm font-bold text-embossed ${isReattempt ? 'text-white' : 'text-[#2d3436]'}`}>
                      {w.topic || 'Algorithmic Topic'}
                    </h4>

                    {/* Interactive Subtopics Checklist */}
                    {subtopics.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <p className={`text-[11px] font-bold uppercase font-mono ${isReattempt ? 'text-white/90' : 'text-[#4a5568]'}`}>
                            Subtopic Mastery Checklist:
                          </p>
                          <span className={`text-[10px] font-mono ${isReattempt ? 'text-white/80' : 'text-[#6b7280]'}`}>
                            {subtopics.filter((s) => progress.completedSubtopics?.[`w${wIdx}_${s}`]).length} / {subtopics.length} done
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {subtopics.map((s, sIdx) => {
                            const isChecked = !!progress.completedSubtopics?.[`w${wIdx}_${s}`];
                            return (
                              <div
                                key={sIdx}
                                onClick={() => isApproved && toggleSubtopic(wIdx, s)}
                                className={`flex items-center gap-2.5 p-2 rounded-lg transition-all ${
                                  isApproved ? 'cursor-pointer' : ''
                                } ${
                                  isReattempt
                                    ? isChecked
                                      ? 'bg-white/25 text-white/90'
                                      : 'bg-white/15 text-white hover:bg-white/25'
                                    : isChecked
                                    ? 'bg-[#d8e0ea] text-[#065f46] shadow-[inset_1.5px_1.5px_3px_#babecc]'
                                    : 'bg-[#f0f2f5] text-[#2d3436] shadow-[2px_2px_4px_#babecc,-2px_-2px_4px_#ffffff] hover:bg-[#ffffff]'
                                }`}
                              >
                                {isApproved ? (
                                  <button
                                    type="button"
                                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                                      isReattempt
                                        ? isChecked
                                          ? 'bg-white text-[#f38a93] shadow-sm'
                                          : 'border border-white/70 bg-white/10 text-white'
                                        : isChecked
                                        ? 'bg-[#10b981] text-white shadow-sm'
                                        : 'border border-[#a3b1c6] bg-white'
                                    }`}
                                  >
                                    {isChecked ? <Check className="h-3 w-3" /> : null}
                                  </button>
                                ) : (
                                  <Circle className={`h-3.5 w-3.5 ${isReattempt ? 'text-white/70' : 'text-[#a3b1c6]'}`} />
                                )}
                                <span className={`text-xs font-mono select-none ${isChecked ? 'line-through opacity-75 font-semibold' : 'font-medium'}`}>
                                  {s}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Resources */}
                    {(w.resources || []).length > 0 && (
                      <div className={`pt-2 border-t ${isReattempt ? 'border-white/30' : 'border-[#babecc]/30'}`}>
                        <p className={`text-[11px] font-bold uppercase font-mono mb-1.5 ${isReattempt ? 'text-white/90' : 'text-[#4a5568]'}`}>
                          Verified Resources & Practice Sets:
                        </p>
                        <div className="space-y-1.5">
                          {w.resources.map((r, rIdx) => (
                            <a
                              key={rIdx}
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={`flex items-center justify-between p-2 rounded-lg text-xs transition-all group ${
                                isReattempt
                                  ? 'bg-white/15 hover:bg-white/25 text-white'
                                  : 'bg-[#f0f2f5] hover:bg-[#ffffff] text-[#2d3436] hover:text-[#ff4757] shadow-[2px_2px_5px_#babecc,-2px_-2px_5px_#ffffff]'
                              }`}
                            >
                              <span className="truncate pr-2 font-medium">{r.name || 'Practice Resource'}</span>
                              <ExternalLink className={`h-3 w-3 flex-shrink-0 ${isReattempt ? 'text-white/80 group-hover:text-white' : 'text-[#a3b1c6] group-hover:text-[#ff4757]'}`} />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Week Notes */}
                    {isApproved && (
                      <div className={`pt-2 border-t ${isReattempt ? 'border-white/30' : 'border-[#babecc]/30'}`}>
                        <div className={`flex items-center gap-1 text-[11px] font-bold uppercase font-mono mb-1 ${isReattempt ? 'text-white/90' : 'text-[#4a5568]'}`}>
                          <Edit3 className={`h-3 w-3 ${isReattempt ? 'text-white' : 'text-[#ff4757]'}`} />
                          <span>Notes & Scratchpad:</span>
                        </div>
                        <textarea
                          rows={2}
                          value={progress.notes?.[wIdx] || ''}
                          onChange={(e) => setWeekNotes(wIdx, e.target.value)}
                          placeholder="Log breakthroughs, tricky bugs, or topics to revisit..."
                          className={`w-full py-1.5 px-2.5 text-xs font-sans resize-none rounded-lg transition-all ${
                            isReattempt
                              ? 'bg-white/20 text-white placeholder-white/60 border border-white/30 focus:bg-white/25 focus:outline-none focus:ring-1 focus:ring-white'
                              : 'input-industrial'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
