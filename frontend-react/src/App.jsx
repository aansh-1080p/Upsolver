import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import HandleHeader from './components/HandleHeader';
import ReportTab from './components/ReportTab';
import PlanTab from './components/PlanTab';
import ProblemsTab from './components/ProblemsTab';
import FriendsTab from './components/FriendsTab';
import {
  checkHealth,
  generateReport,
  generatePlan,
  revisePlan,
  approvePlan,
  searchProblems,
  comparePeers,
  getSavedPlans
} from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('report');
  const [health, setHealth] = useState(null);

  // User handles with initial state
  const [cfHandle, setCfHandle] = useState('Moderator');
  const [lcHandle, setLcHandle] = useState('doomscrollerfinalboss');

  // Tab Data States
  const [reportData, setReportData] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [problemsData, setProblemsData] = useState(null);

  // Loading States
  const [reportLoading, setReportLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [problemsLoading, setProblemsLoading] = useState(false);

  // Options
  const [difficulty, setDifficulty] = useState('medium');
  const [errorToast, setErrorToast] = useState(null);

  // Parse URL query parameters & localStorage on initial mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cfParam = params.get('cf');
      const lcParam = params.get('lc');
      const tabParam = params.get('tab');

      let currentCf = 'Moderator';
      let currentLc = 'doomscrollerfinalboss';

      if (cfParam !== null) {
        currentCf = cfParam;
        setCfHandle(cfParam);
        localStorage.setItem('upsolver_cf_handle', cfParam);
      } else {
        const savedCf = localStorage.getItem('upsolver_cf_handle');
        if (savedCf) {
          currentCf = savedCf;
          setCfHandle(savedCf);
        }
      }

      if (lcParam !== null) {
        currentLc = lcParam;
        setLcHandle(lcParam);
        localStorage.setItem('upsolver_lc_handle', lcParam);
      } else {
        const savedLc = localStorage.getItem('upsolver_lc_handle');
        if (savedLc) {
          currentLc = savedLc;
          setLcHandle(savedLc);
        }
      }

      if (tabParam && ['report', 'plan', 'problems', 'friends'].includes(tabParam.toLowerCase())) {
        setActiveTab(tabParam.toLowerCase());
      }
    } catch (e) {
      console.error('Error parsing URL parameters:', e);
    }
  }, []);

  // Persist handle updates
  const handleUpdateCf = (val) => {
    setCfHandle(val);
    try {
      localStorage.setItem('upsolver_cf_handle', val);
    } catch (e) {}
  };

  const handleUpdateLc = (val) => {
    setLcHandle(val);
    try {
      localStorage.setItem('upsolver_lc_handle', val);
    } catch (e) {}
  };

  // Attempt to restore active saved plan when handles change
  const restoreActivePlan = useCallback(async (cf, lc) => {
    const key = `plan_${(cf || '').trim()}_${(lc || '').trim()}`;
    // 1. Try local storage first for speed
    try {
      const localProgressRaw = localStorage.getItem(`upsolver_progress_${key}`);
      const localProgress = localProgressRaw ? JSON.parse(localProgressRaw) : null;

      const rawSavedPlans = localStorage.getItem('upsolver_saved_plans');
      if (rawSavedPlans) {
        const all = JSON.parse(rawSavedPlans);
        if (all[key]?.plan) {
          setPlanData({
            plan: all[key].plan,
            progress: localProgress || all[key].progress || { completedSubtopics: {}, completedDays: {}, weekStatus: {}, notes: {} }
          });
          return;
        }
      }
    } catch (e) {
      console.error('Error restoring local plan:', e);
    }

    // 2. Query backend
    try {
      if (cf || lc) {
        const res = await getSavedPlans(cf, lc);
        const match = (res.plans || []).find((p) => p.key === key || (p.cf.toLowerCase() === cf.toLowerCase() && p.lc.toLowerCase() === lc.toLowerCase()));
        if (match?.plan) {
          setPlanData({
            plan: match.plan,
            progress: match.progress || { completedSubtopics: {}, completedDays: {}, weekStatus: {}, notes: {} }
          });
        }
      }
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    restoreActivePlan(cfHandle, lcHandle);
  }, [cfHandle, lcHandle, restoreActivePlan]);

  // Attempt to restore cached report when handles change
  useEffect(() => {
    try {
      const key = `upsolver_report_${(cfHandle || '').trim()}_${(lcHandle || '').trim()}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        setReportData(JSON.parse(saved));
      }
    } catch (e) {}
  }, [cfHandle, lcHandle]);

  // Fetch initial health status
  useEffect(() => {
    async function loadHealth() {
      const res = await checkHealth();
      setHealth(res);
    }
    loadHealth();
  }, []);

  const showError = (msg) => {
    setErrorToast(msg);
    setTimeout(() => setErrorToast(null), 5000);
  };

  // 1. Generate Report
  const handleGenerateReport = async () => {
    if (!cfHandle.trim() && !lcHandle.trim()) {
      showError('Please enter at least one handle (Codeforces or LeetCode).');
      return;
    }
    setReportLoading(true);
    try {
      const res = await generateReport({ cf_username: cfHandle.trim(), lc_username: lcHandle.trim() });
      setReportData(res);
      try {
        const key = `upsolver_report_${cfHandle.trim()}_${lcHandle.trim()}`;
        localStorage.setItem(key, JSON.stringify(res));
      } catch (e) {}
    } catch (err) {
      showError(err.message || 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  // 2. Study Plan (HITL)
  const handleGeneratePlan = async (params) => {
    if (!cfHandle.trim() && !lcHandle.trim()) {
      showError('Please enter at least one handle.');
      return;
    }
    setPlanLoading(true);
    try {
      const res = await generatePlan({
        cf_username: cfHandle,
        lc_username: lcHandle,
        ...params,
      });
      setPlanData(res);
    } catch (err) {
      showError(err.message || 'Failed to generate study plan');
    } finally {
      setPlanLoading(false);
    }
  };

  const handleRevisePlan = async (feedback) => {
    setPlanActionLoading(true);
    try {
      const res = await revisePlan({
        cf_username: cfHandle,
        lc_username: lcHandle,
        feedback,
      });
      setPlanData(res);
    } catch (err) {
      showError(err.message || 'Failed to revise plan');
    } finally {
      setPlanActionLoading(false);
    }
  };

  const handleApprovePlan = async () => {
    setPlanActionLoading(true);
    try {
      const res = await approvePlan({
        cf_username: cfHandle,
        lc_username: lcHandle,
      });
      setPlanData(res);
    } catch (err) {
      showError(err.message || 'Failed to approve plan');
    } finally {
      setPlanActionLoading(false);
    }
  };

  // 3. Search Practice Problems
  const handleSearchProblems = async () => {
    if (!cfHandle.trim() && !lcHandle.trim()) {
      showError('Please enter at least one handle.');
      return;
    }
    setProblemsLoading(true);
    try {
      const res = await searchProblems({
        cf_username: cfHandle,
        lc_username: lcHandle,
        difficulty,
      });
      setProblemsData(res);
    } catch (err) {
      showError(err.message || 'Failed to search practice problems');
    } finally {
      setProblemsLoading(false);
    }
  };

  // 4. Peer Comparison (called from Friends tab inline)
  const handleCompare = async (params = {}) => {
    const targetPeerCf = (params.peer_cf ?? '').trim();
    const targetPeerLc = (params.peer_lc ?? '').trim();

    if (!cfHandle.trim() && !lcHandle.trim()) {
      showError('Please enter your primary handles first.');
      return null;
    }
    if (!targetPeerCf && !targetPeerLc) {
      showError("Please enter your peer's Codeforces or LeetCode handle.");
      return null;
    }
    try {
      const res = await comparePeers({
        cf_username: cfHandle.trim(),
        lc_username: lcHandle.trim(),
        peer_cf: targetPeerCf,
        peer_lc: targetPeerLc,
      });
      return res;
    } catch (err) {
      showError(err.message || 'Failed to compare profiles');
      return null;
    }
  };

  return (
    <div className="min-h-screen bg-[#e0e5ec] text-[#2d3436] flex flex-col font-sans">
      {/* Toast Notification */}
      {errorToast && (
        <div className="fixed bottom-5 right-5 z-50 p-4 industrial-card border border-[#ff4757]/40 bg-[#fff1f2] text-[#2d3436] text-xs font-mono shadow-[6px_6px_14px_#babecc,-6px_-6px_14px_#ffffff] flex items-center gap-2.5 max-w-md">
          <span className="led-indicator-orange flex-shrink-0" />
          <span className="font-bold text-[#ff4757]">ALERT:</span>
          <span>{errorToast}</span>
        </div>
      )}

      {/* Navbar */}
      <Navbar health={health} activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Handle Inputs (Shown on Report, Plan, and Problems tabs; Friends has integrated arena) */}
        {activeTab !== 'friends' && (
          <HandleHeader
            cfHandle={cfHandle}
            setCfHandle={handleUpdateCf}
            lcHandle={lcHandle}
            setLcHandle={handleUpdateLc}
            difficulty={activeTab === 'problems' ? difficulty : undefined}
            setDifficulty={activeTab === 'problems' ? setDifficulty : undefined}
            onRun={
              activeTab === 'report'
                ? handleGenerateReport
                : activeTab === 'plan'
                ? () => handleGeneratePlan({ goal: 'Improve competitive programming skills' })
                : activeTab === 'problems'
                ? handleSearchProblems
                : undefined
            }
            loading={reportLoading || planLoading || problemsLoading}
            actionText={
              activeTab === 'report'
                ? 'Execute Report'
                : activeTab === 'plan'
                ? 'Synthesize Plan'
                : activeTab === 'problems'
                ? 'Discover Problems'
                : 'Execute Pipeline'
            }
          />
        )}

        {/* Tab Content */}
        <div>
          {activeTab === 'report' && (
            <ReportTab
              data={reportData}
              loading={reportLoading}
              onGenerateReport={handleGenerateReport}
              cfHandle={cfHandle}
              lcHandle={lcHandle}
            />
          )}

          {activeTab === 'plan' && (
            <PlanTab
              planData={planData}
              setPlanData={setPlanData}
              loading={planLoading}
              onGeneratePlan={handleGeneratePlan}
              onRevisePlan={handleRevisePlan}
              onApprovePlan={handleApprovePlan}
              actionLoading={planActionLoading}
              cfHandle={cfHandle}
              lcHandle={lcHandle}
            />
          )}

          {activeTab === 'problems' && (
            <ProblemsTab
              problemsData={problemsData}
              loading={problemsLoading}
            />
          )}

          {activeTab === 'friends' && (
            <FriendsTab
              onCompare={handleCompare}
              cfHandle={cfHandle}
              lcHandle={lcHandle}
            />
          )}
        </div>
      </main>

      {/* Industrial Engraved Chassis Footer */}
      <footer className="border-t border-[#babecc]/50 py-5 text-center text-xs text-[#4a5568] bg-[#e0e5ec]">
        <div className="flex items-center justify-center gap-2 font-mono">
          <span className="font-bold text-[#2d3436]">UPSOLVER</span>
          <span>// INDUSTRIAL CP INTELLIGENCE CONSOLE</span>
          <span>·</span>
          <span>POWERED BY LANGGRAPH & FASTAPI</span>
        </div>
      </footer>
    </div>
  );
}
