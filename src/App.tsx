/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, PageId } from './components/layout/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { UploadReportsPage } from './pages/UploadReportsPage';
import { InventoryAnalysisPage } from './pages/InventoryAnalysisPage';
import { ConsumptionAnalysisPage } from './pages/ConsumptionAnalysisPage';
import { ExpiryManagementPage } from './pages/ExpiryManagementPage';
import { ReceivingAnalysisPage } from './pages/ReceivingAnalysisPage';
import { StockRiskRecommendationsPage } from './pages/StockRiskRecommendationsPage';
import { ReportsCenterPage } from './pages/ReportsCenterPage';
import { UploadHistoryPage } from './pages/UploadHistoryPage';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { storageService } from './services/storageService';

export default function App() {
  const [currentPage, setCurrentPage] = useState<PageId>('dashboard');
  const [customPageTitle, setCustomPageTitle] = useState<string | null>(storageService.getCustomPageTitle());

  useEffect(() => {
    const update = () => {
      setCustomPageTitle(storageService.getCustomPageTitle());
    };
    const unsub = storageService.subscribe(update);
    return unsub;
  }, []);

  const getPageTitle = (page: PageId) => {
    switch (page) {
      case 'dashboard':
        return 'Executive Dashboard';
      case 'upload':
        return 'Upload Reports';
      case 'inventory':
        return 'Inventory Analysis';
      case 'consumption':
        return 'Consumption Analysis';
      case 'expiry':
        return 'Expiry Management';
      case 'receiving':
        return 'Receiving Analysis';
      case 'risks':
        return 'Stock Risk & Recommendations';
      case 'reports':
        return 'Reports Center';
      case 'history':
        return 'Upload History';
      case 'admin':
        return 'Admin & Supabase Control';
      default:
        return 'Inventra';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased selection:bg-teal-500 selection:text-white">
      {/* Top Navbar */}
      <Navbar
        onNavigateToUpload={() => {
          storageService.setCustomPageTitle(null);
          setCurrentPage('upload');
        }}
        activePageTitle={customPageTitle || getPageTitle(currentPage)}
      />

      {/* Main Workspace Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Enterprise Navigation Sidebar */}
        <Sidebar
          currentPage={currentPage}
          onSelectPage={(page) => {
            storageService.setCustomPageTitle(null);
            setCurrentPage(page);
          }}
        />

        {/* Content Viewport */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {currentPage === 'dashboard' && (
            <DashboardPage onNavigate={(page) => setCurrentPage(page as PageId)} />
          )}

          {currentPage === 'upload' && (
            <UploadReportsPage onImportSuccess={() => setCurrentPage('dashboard')} />
          )}

          {currentPage === 'inventory' && <InventoryAnalysisPage />}

          {currentPage === 'consumption' && <ConsumptionAnalysisPage />}

          {currentPage === 'expiry' && <ExpiryManagementPage />}

          {currentPage === 'receiving' && <ReceivingAnalysisPage />}

          {currentPage === 'risks' && <StockRiskRecommendationsPage />}

          {currentPage === 'reports' && <ReportsCenterPage />}

          {currentPage === 'history' && (
            <UploadHistoryPage onNavigateToUpload={() => setCurrentPage('upload')} />
          )}

          {currentPage === 'admin' && <AdminPanelPage />}
        </main>
      </div>
    </div>
  );
}
