import React from 'react';
import { Activity, Sparkles, Zap, Shield, Users } from 'lucide-react';

export default function Navbar({ health, activeTab, setActiveTab }) {
  const isOnline = health?.status === 'online';

  const tabs = [
    { id: 'report', code: '01', label: 'Report', icon: Activity },
    { id: 'plan', code: '02', label: 'Study Plan', icon: Sparkles },
    { id: 'problems', code: '03', label: 'Problems', icon: Zap },
    { id: 'friends', code: '04', label: 'Friends', icon: Users },
  ];

  return (
    <header className="sticky top-0 z-50 bg-[#e0e5ec] border-b border-[#babecc]/50 px-4 sm:px-8 py-3 shadow-[0_4px_12px_rgba(186,190,204,0.4)] backdrop-blur-md">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Brand Console Badge */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#e0e5ec] shadow-[inset_2px_2px_5px_#babecc,inset_-2px_-2px_5px_#ffffff] flex items-center justify-center border border-white/60">
            <Shield className="h-5 w-5 text-[#ff4757]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-extrabold tracking-tight text-[#2d3436] text-embossed">
                UPSOLVER
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#d1d9e6] text-[#4a5568] shadow-[inset_1px_1px_2px_#babecc] font-mono uppercase">
                v2.0 CONSOLE
              </span>
            </div>
            <p className="text-xs text-[#4a5568] font-medium tracking-tight">
              Tactile Competitive Programming Intelligence
            </p>
          </div>
        </div>

        {/* Tactile Key Switch Navigation */}
        <nav className="flex items-center flex-wrap gap-2 p-1.5 bg-[#d8e0ea] rounded-xl shadow-[inset_2px_2px_5px_#babecc,inset_-2px_-2px_5px_#ffffff]">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#e0e5ec] text-[#ff4757] shadow-[inset_2px_2px_4px_#babecc,inset_-2px_-2px_4px_#ffffff]'
                    : 'text-[#4a5568] hover:text-[#2d3436] hover:bg-[#e0e5ec]/60 shadow-[3px_3px_6px_#babecc,-3px_-3px_6px_#ffffff]'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#ff4757]' : 'text-[#4a5568]'}`} />
                <span className="font-mono text-[10px] opacity-60">[{tab.code}]</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Hardware Status LED Diode */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-[#e0e5ec] shadow-[inset_2px_2px_4px_#babecc,inset_-2px_-2px_4px_#ffffff] border border-white/60">
            <span
              className={isOnline ? 'led-indicator-green animate-pulse' : 'led-indicator-red'}
              title={isOnline ? `Server Online (${health?.active_provider || 'Active'})` : 'Server Offline'}
            />
            <span className="text-[11px] font-bold font-mono text-[#2d3436] tracking-wider uppercase">
              Server
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}


