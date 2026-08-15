import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import HandleHeader from './components/HandleHeader';
import ReportTab from './components/ReportTab';
import PlanTab from './components/PlanTab';
import ProblemsTab from './components/ProblemsTab';
import CompareTab from './components/CompareTab';
import {
  checkHealth,
  generateReport,
  generatePlan,
  revisePlan,
  approvePlan,
  searchProblems,
  comparePeers
} from './api';

export default function App() {
  const [activeTab, setActiveTab] = useState('report');
  const [health, setHealth] = useState(null);

  // User handles
  const [cfHandle, setCfHandle] = useState('Moderator');
  const [lcHandle, setLcHandle] = useState('doomscrollerfinalboss');

  // Tab Data States
  const [reportData, setReportData] = useState(null);
  const [planData, setPlanData] = useState(null);
  const [problemsData, setProblemsData] = useState(null);
  const [compareData, setCompareData] = useState(null);

  // Loading States
  const [reportLoading, setReportLoading] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const [planActionLoading, setPlanActionLoading] = useState(false);
  const [problemsLoading, setProblemsLoading] = useState(false);
  const [compareLoading, setCompareLoading] = useState(false);

  // Options
  const [difficulty, setDifficulty] = useState('medium');
  const [errorToast, setErrorToast] = useState(null);

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
      const res = await generateReport({ cf_username: cfHandle, lc_username: lcHandle });
      setReportData(res);
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

  // 4. Peer Comparison
  const handleCompare = async ({ peer_cf, peer_lc }) => {
    if (!cfHandle.trim() && !lcHandle.trim()) {
      showError('Please enter your primary handles in the top bar first.');
      return;
    }
    if (!peer_cf.trim() && !peer_lc.trim()) {
      showError("Please enter your peer's Codeforces or LeetCode handle.");
      return;
    }
    setCompareLoading(true);
    try {
      const res = await comparePeers({
        cf_username: cfHandle,
        lc_username: lcHandle,
        peer_cf,
        peer_lc,
      });
      setCompareData(res);
    } catch (err) {
      showError(err.message || 'Failed to compare profiles');
    } finally {
      setCompareLoading(false);
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
        {/* Handle Inputs */}
        <HandleHeader
          cfHandle={cfHandle}
          setCfHandle={setCfHandle}
          lcHandle={lcHandle}
          setLcHandle={setLcHandle}
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

        {/* Tab Content */}
        <div>
          {activeTab === 'report' && (
            <ReportTab data={reportData} loading={reportLoading} />
          )}

          {activeTab === 'plan' && (
            <PlanTab
              planData={planData}
              loading={planLoading}
              onGeneratePlan={handleGeneratePlan}
              onRevisePlan={handleRevisePlan}
              onApprovePlan={handleApprovePlan}
              actionLoading={planActionLoading}
            />
          )}

          {activeTab === 'problems' && (
            <ProblemsTab
              problemsData={problemsData}
              loading={problemsLoading}
              onSearchProblems={handleSearchProblems}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
            />
          )}

          {activeTab === 'compare' && (
            <CompareTab
              compareData={compareData}
              loading={compareLoading}
              onCompare={handleCompare}
              hostCf={cfHandle}
              hostLc={lcHandle}
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


