import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  Boxes,
  TrendingDown,
  ClockAlert,
  Truck,
  ShieldAlert,
  FileSpreadsheet,
  History,
  Activity,
  Hospital,
  ChevronRight,
  Info,
  Database,
} from 'lucide-react';
import { storageService } from '../../services/storageService';

export type PageId =
  | 'dashboard'
  | 'upload'
  | 'inventory'
  | 'consumption'
  | 'expiry'
  | 'receiving'
  | 'risks'
  | 'reports'
  | 'history'
  | 'admin';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onSelectPage }) => {
  const [lowStockCount, setLowStockCount] = useState(0);
  const [nearExpiryCount, setNearExpiryCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);

  useEffect(() => {
    const updateCounts = () => {
      const kpi = storageService.getKPISummary();
      setLowStockCount(kpi.lowStockItemsCount);
      setNearExpiryCount(kpi.nearExpiryItemsCount);
      setReportCount(storageService.getUploadedReports().length);
    };

    updateCounts();
    const unsub = storageService.subscribe(updateCounts);
    return unsub;
  }, []);

  const navItems: {
    id: PageId;
    label: string;
    icon: React.ElementType;
    badge?: number;
    badgeColor?: string;
    description: string;
  }[] = [
    {
      id: 'dashboard',
      label: 'Executive Dashboard',
      icon: LayoutDashboard,
      description: 'KPI summary & flow overview',
    },
    {
      id: 'upload',
      label: 'Upload Reports',
      icon: UploadCloud,
      badge: undefined,
      description: 'Excel import & column mapping',
    },
    {
      id: 'inventory',
      label: 'Inventory Analysis',
      icon: Boxes,
      description: 'Stock balance & warehouse comparison',
    },
    {
      id: 'consumption',
      label: 'Consumption Analysis',
      icon: TrendingDown,
      description: 'Monthly trends & top 10 items',
    },
    {
      id: 'expiry',
      label: 'Expiry Management',
      icon: ClockAlert,
      badge: nearExpiryCount > 0 ? nearExpiryCount : undefined,
      badgeColor: 'bg-rose-500 text-white',
      description: 'FEFO & 30/60/90 days risk',
    },
    {
      id: 'receiving',
      label: 'Receiving Analysis',
      icon: Truck,
      description: 'GRNs, suppliers & PR flows',
    },
    {
      id: 'risks',
      label: 'Stock Risk & Recs',
      icon: ShieldAlert,
      badge: lowStockCount > 0 ? lowStockCount : undefined,
      badgeColor: 'bg-amber-500 text-slate-950 font-bold',
      description: 'Stockout alerts & reorders',
    },
    {
      id: 'reports',
      label: 'Reports Center',
      icon: FileSpreadsheet,
      description: 'Excel, PDF & AI management brief',
    },
    {
      id: 'history',
      label: 'Upload History',
      icon: History,
      badge: reportCount > 0 ? reportCount : undefined,
      badgeColor: 'bg-slate-700 text-slate-200',
      description: 'Imported audit logs & files',
    },
    {
      id: 'admin',
      label: 'Admin & Supabase',
      icon: Database,
      description: 'Cloud sync & analytical store',
    },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 min-h-[calc(100vh-61px)]">
      {/* Navigation list */}
      <div className="py-4 px-3 space-y-1">
        <div className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">
          Analytics Navigation
        </div>

        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all group ${
                isActive
                  ? 'bg-teal-500/15 text-teal-300 border border-teal-500/30'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <div className="flex items-center space-x-3 text-left">
                <Icon
                  className={`w-4 h-4 transition ${
                    isActive ? 'text-teal-400' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <div>
                  <div className="leading-tight">{item.label}</div>
                  <div className="text-[10px] text-slate-400 leading-none mt-0.5 font-normal">
                    {item.description}
                  </div>
                </div>
              </div>

              {item.badge !== undefined && (
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold ${
                    item.badgeColor || 'bg-slate-700 text-slate-200'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Hospital Stock Controller Identity / Context Box */}
      <div className="p-3 m-3 bg-slate-800/60 border border-slate-700/60 rounded-xl text-xs text-slate-300">
        <div className="flex items-center space-x-2 text-teal-400 font-semibold mb-1">
          <Hospital className="w-4 h-4" />
          <span>Warehouse Operations</span>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Integrated with Hospital ERP. Data snapshot source: Historical Excel Exports.
        </p>
        <div className="mt-2 pt-2 border-t border-slate-700/50 flex items-center justify-between text-[11px] text-slate-400">
          <span>Currency: <strong className="text-white">SAR</strong></span>
          <span className="flex items-center text-teal-400">
            <Activity className="w-3 h-3 mr-1" /> Ready
          </span>
        </div>
      </div>
    </aside>
  );
};
