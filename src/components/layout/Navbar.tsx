import React, { useState, useEffect } from 'react';
import {
  Building2,
  Calendar,
  Layers,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  ShieldAlert,
  Search,
} from 'lucide-react';
import { storageService } from '../../services/storageService';

interface NavbarProps {
  onNavigateToUpload: () => void;
  activePageTitle: string;
}

export const Navbar: React.FC<NavbarProps> = ({ onNavigateToUpload, activePageTitle }) => {
  const [isDemoMode, setIsDemoMode] = useState(storageService.getIsDemoMode());
  const [selectedWarehouse, setSelectedWarehouse] = useState(storageService.getSelectedWarehouse());
  const [selectedPeriod, setSelectedPeriod] = useState(storageService.getSelectedPeriod());
  const [warehouses, setWarehouses] = useState(storageService.getWarehouses());

  useEffect(() => {
    const unsub = storageService.subscribe(() => {
      setIsDemoMode(storageService.getIsDemoMode());
      setSelectedWarehouse(storageService.getSelectedWarehouse());
      setSelectedPeriod(storageService.getSelectedPeriod());
      setWarehouses(storageService.getWarehouses());
    });
    return unsub;
  }, []);

  const handleWarehouseChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    storageService.setSelectedWarehouse(e.target.value);
  };

  const handlePeriodChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    storageService.setSelectedPeriod(e.target.value);
  };

  const handleToggleDemo = () => {
    if (isDemoMode) {
      if (confirm('Clear sample demo data? Your dashboard will switch to clean Live Mode for your imported ERP reports.')) {
        storageService.clearAllData();
        onNavigateToUpload();
      }
    } else {
      if (confirm('Reload fictional sample medical warehouse data for demonstration?')) {
        storageService.loadDemoData();
      }
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-slate-900 border-b border-slate-800 text-white shadow-sm">
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Branding & Current Context */}
        <div className="flex items-center space-x-3.5">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-teal-400 to-emerald-400 rounded-xl blur-xs opacity-75 group-hover:opacity-100 transition duration-300"></div>
            <div className="relative w-10 h-10 rounded-xl bg-slate-950 border border-teal-500/40 flex items-center justify-center font-brand font-black text-xl tracking-tight shadow-md">
              <span className="bg-gradient-to-tr from-teal-400 via-teal-200 to-white bg-clip-text text-transparent">
                I
              </span>
            </div>
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="font-brand font-extrabold text-xl tracking-tight brand-gradient">
                Inventra
              </span>
              <span className="text-teal-400 font-normal text-xs px-2 py-0.5 rounded-full bg-teal-950/70 border border-teal-500/30 tracking-wide uppercase">
                Platform
              </span>
              <span className="bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 rounded-full border border-slate-700 font-semibold tracking-wider">
                SAR
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-normal tracking-tight">
              Hospital Supply Chain & Stock Control Analytics • ERP Integration
            </p>
          </div>
        </div>

        {/* Center: Global Scope Selectors */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* Warehouse Selector */}
          <div className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
            <Layers className="w-3.5 h-3.5 text-teal-400 mr-1.5" />
            <select
              value={selectedWarehouse}
              onChange={handleWarehouseChange}
              className="bg-transparent border-none text-xs text-slate-200 focus:outline-none focus:ring-0 cursor-pointer pr-2 font-medium"
            >
              <option value="ALL" className="bg-slate-900 text-white">All Warehouses (Consolidated)</option>
              {warehouses.map((wh) => (
                <option key={wh.code} value={wh.code} className="bg-slate-900 text-white">
                  {wh.code} - {wh.name}
                </option>
              ))}
            </select>
          </div>

          {/* Reporting Period Selector */}
          <div className="flex items-center bg-slate-800/90 border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-slate-200">
            <Calendar className="w-3.5 h-3.5 text-teal-400 mr-1.5" />
            <select
              value={selectedPeriod}
              onChange={handlePeriodChange}
              className="bg-transparent border-none text-xs text-slate-200 focus:outline-none focus:ring-0 cursor-pointer pr-2 font-medium"
            >
              <option value="2026-10" className="bg-slate-900 text-white">Period: Oct 2026 (Active)</option>
              <option value="2026-09" className="bg-slate-900 text-white">Period: Sep 2026</option>
              <option value="2026-08" className="bg-slate-900 text-white">Period: Aug 2026</option>
              <option value="2026-Q3" className="bg-slate-900 text-white">Period: Q3 2026 Consolidated</option>
              <option value="ALL" className="bg-slate-900 text-white">All Available Periods</option>
            </select>
          </div>
        </div>

        {/* Right: Demo Mode indicator & Upload button */}
        <div className="flex items-center space-x-3">
          {/* Demo Data Pill */}
          {isDemoMode ? (
            <div className="flex items-center bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs px-3 py-1.5 rounded-lg">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse mr-2"></span>
              <span className="font-semibold mr-2">Sample Medical Data</span>
              <button
                onClick={handleToggleDemo}
                title="Switch to actual imported data or clear sample data"
                className="text-amber-200 hover:text-white underline text-[11px] font-medium"
              >
                Clear / Live Mode
              </button>
            </div>
          ) : (
            <div className="flex items-center bg-teal-500/15 border border-teal-500/30 text-teal-300 text-xs px-3 py-1.5 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 mr-1.5" />
              <span className="font-semibold mr-2">Imported ERP Data</span>
              <button
                onClick={handleToggleDemo}
                title="Reload fictional sample data for testing"
                className="text-teal-200 hover:text-white underline text-[11px] font-medium flex items-center"
              >
                <RotateCcw className="w-3 h-3 mr-1" /> Load Demo
              </button>
            </div>
          )}

          {/* Quick Upload CTA */}
          <button
            onClick={onNavigateToUpload}
            className="flex items-center space-x-2 bg-gradient-to-r from-teal-500 to-teal-600 hover:from-teal-600 hover:to-teal-700 text-slate-950 font-bold px-3.5 py-1.5 rounded-lg text-xs transition shadow-sm"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Import Report</span>
          </button>
        </div>
      </div>
    </header>
  );
};
