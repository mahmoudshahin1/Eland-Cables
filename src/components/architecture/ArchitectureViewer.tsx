import React, { useState } from 'react';
import {
  Server,
  Layers,
  Database,
  Cpu,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Code2,
  GitBranch,
  Cloud,
} from 'lucide-react';

export const ArchitectureViewer: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'phase1_2' | 'vibe_coding' | 'security'>('overview');

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-950 rounded-2xl p-6 text-white shadow-xl border border-indigo-900/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest bg-indigo-900/60 px-2.5 py-1 rounded-md border border-indigo-700/50">
              ENTERPRISE SOLUTION ARCHITECTURE SPECIFICATION
            </span>
            <h1 className="text-2xl font-extrabold tracking-tight mt-1">
              Energya Connect Architecture & Dynamics 365 Integration Roadmap
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              Designed by Enterprise Solution Architects, Dynamics 365 Leads, and AI Platform Architects.
            </p>
          </div>
        </div>
      </div>

      {/* Secondary Navigation Tabs */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 shadow-lg border border-slate-200 dark:border-slate-800 flex items-center space-x-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
            activeTab === 'overview'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Layers className="h-4 w-4" />
          <span>System Topology & Clean Architecture</span>
        </button>

        <button
          onClick={() => setActiveTab('phase1_2')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
            activeTab === 'phase1_2'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <GitBranch className="h-4 w-4" />
          <span>Phase 1 (Standalone) vs Phase 2 (D365)</span>
        </button>

        <button
          onClick={() => setActiveTab('vibe_coding')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
            activeTab === 'vibe_coding'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Code2 className="h-4 w-4" />
          <span>Vibe Coding Framework</span>
        </button>

        <button
          onClick={() => setActiveTab('security')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 ${
            activeTab === 'security'
              ? 'bg-blue-600 text-white shadow'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <ShieldCheck className="h-4 w-4" />
          <span>Security & ISO Compliance</span>
        </button>
      </div>

      {/* Main Tab Views */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <Server className="h-5 w-5 text-blue-600" />
              <span>Target Modular Monolith & Clean Architecture Architecture</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-blue-600 dark:text-blue-400 block uppercase">
                  1. Domain & Engineering Rules
                </span>
                <p className="text-slate-600 dark:text-slate-300">
                  Pure domain entities for Cable Construction (IEC 60502), Drum Fill factors, LME Commodity calculations, and Pricing margins with zero external dependencies.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-emerald-600 dark:text-emerald-400 block uppercase">
                  2. Application & CQRS Layer
                </span>
                <p className="text-slate-600 dark:text-slate-300">
                  MediatR command handlers for Quotation Generation, Drum Optimization, and AI Assistant intent routing.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <span className="font-bold text-purple-600 dark:text-purple-400 block uppercase">
                  3. Infrastructure & Azure Cloud
                </span>
                <p className="text-slate-600 dark:text-slate-300">
                  Azure App Services, EF Core / Dapper persistence, Redis Caching for LME metal rates, and Gemini AI Proxy integration.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'phase1_2' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Evolution Roadmap: Standalone MVP to Full Dynamics 365 F&O Integration
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-5 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-800 space-y-3">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-600 text-white">
                Phase 1: Standalone Platform (Current)
              </span>
              <ul className="space-y-2 text-slate-700 dark:text-slate-300 list-disc pl-4">
                <li>Zero hard dependencies on Dynamics 365 ERP.</li>
                <li>Master Data imported via Excel / CSV drag-and-drop seeder engine.</li>
                <li>Local database persistence for Cable Specs, Customers, and Inquiries.</li>
                <li>Instant response time for cable configuration and LME pricing calculations.</li>
              </ul>
            </div>

            <div className="p-5 bg-purple-50 dark:bg-purple-950/40 rounded-2xl border border-purple-200 dark:border-purple-800 space-y-3">
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-600 text-white">
                Phase 2: Dynamics 365 F&O Dual-Write Integration
              </span>
              <ul className="space-y-2 text-slate-700 dark:text-slate-300 list-disc pl-4">
                <li>Bi-directional Dataverse & OData integration.</li>
                <li>Real-time sync of Sales Orders directly into D365 Sales Order Headers.</li>
                <li>Live Advaris MES shop floor telemetry feeding D365 Production Orders.</li>
                <li>Customer Credit Limit validation directly against D365 Finance AR module.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'vibe_coding' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <Code2 className="h-5 w-5 text-indigo-600" />
            <span>Vibe Coding Guidelines & Multi-AI Development Standard</span>
          </h3>

          <p className="text-slate-600 dark:text-slate-400">
            Energya Connect is engineered to maintain crisp design language, consistent TypeScript types, and pristine Clean Architecture principles across any AI assistant (Gemini, Claude, GPT, Cursor, Windsurf).
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl font-mono text-[11px] text-slate-700 dark:text-slate-300">
              <span className="font-bold text-blue-600 block mb-1">1. Strict Domain Types</span>
              All entities declared centrally in <code>/src/types.ts</code> to prevent interface drift.
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl font-mono text-[11px] text-slate-700 dark:text-slate-300">
              <span className="font-bold text-emerald-600 block mb-1">2. Zero Hardcoding</span>
              Engineering rules parameters stored in domain data models to allow instant tuning.
            </div>
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl font-mono text-[11px] text-slate-700 dark:text-slate-300">
              <span className="font-bold text-purple-600 block mb-1">3. Modular Components</span>
              Single-responsibility UI sub-components separated cleanly from layout shells.
            </div>
          </div>
        </div>
      )}

      {activeTab === 'security' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-xl border border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Cybersecurity Architecture & Data Compliance
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-2">
              <span className="font-bold text-slate-900 dark:text-white block">Encryption at Rest & In Transit</span>
              <p className="text-slate-600 dark:text-slate-400">
                AES-256 encryption for database columns and TLS 1.3 enforced across all API endpoints.
              </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl space-y-2">
              <span className="font-bold text-slate-900 dark:text-white block">Role-Based Access Control (RBAC)</span>
              <p className="text-slate-600 dark:text-slate-400">
                Granular permissions matrix for Customer Portal vs Technical Office vs Costing vs Production.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
