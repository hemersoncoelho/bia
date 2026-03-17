import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PublicRoute } from './Guards';
import { AgentRestrictedRoute, IndexRedirect } from '../components/RouteGuardForAgent';
import { AppShell } from '../components/Layout/AppShell';

// Critical path — carregados imediatamente
import { Login } from '../pages/Login';
import { SelectCompany } from '../pages/SelectCompany';
import { CompanyHome } from '../pages/company/Home';

// Lazy load — páginas pesadas (Recharts, listas grandes, etc.)
const Dashboard = lazy(() => import('../pages/Dashboard').then(m => ({ default: m.Dashboard })));
const InboxPage = lazy(() => import('../pages/Inbox').then(m => ({ default: m.Inbox })));
const Deals = lazy(() => import('../pages/Deals').then(m => ({ default: m.Deals })));
const Tasks = lazy(() => import('../pages/Tasks').then(m => ({ default: m.Tasks })));
const AiAgents = lazy(() => import('../pages/AiAgents').then(m => ({ default: m.AiAgents })));
const AiAgentDetail = lazy(() => import('../pages/AiAgentDetail').then(m => ({ default: m.AiAgentDetail })));
const Contacts = lazy(() => import('../pages/Contacts').then(m => ({ default: m.Contacts })));
const CompanySettings = lazy(() => import('../pages/CompanySettings').then(m => ({ default: m.CompanySettings })));
const MembersPage = lazy(() => import('../pages/company/Members').then(m => ({ default: m.MembersPage })));
const TeamsPage = lazy(() => import('../pages/company/Teams').then(m => ({ default: m.TeamsPage })));
const IntegrationsPage = lazy(() => import('../pages/company/Integrations').then(m => ({ default: m.IntegrationsPage })));

const PageSkeleton = () => (
  <div className="max-w-7xl mx-auto space-y-8 animate-pulse">
    <div className="h-10 bg-white/5 rounded w-1/3 mb-8" />
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[1, 2, 3].map(i => <div key={i} className="h-28 bg-white/5 rounded-xl" />)}
    </div>
    <div className="h-64 bg-white/5 rounded-xl" />
  </div>
);

// Admin Pages
import { AdminShell } from '../components/admin/AdminShell';
import { CompaniesList } from '../pages/admin/CompaniesList';
import { CompanyDetails } from '../pages/admin/CompanyDetails';
import { UsersList, ModulesList, SupportPanel } from '../pages/admin/OtherAdminPages';
import { Unauthorized } from '../pages/Unauthorized';

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />

      <Route
        path="/select-company"
        element={
          <ProtectedRoute>
            <SelectCompany />
          </ProtectedRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell />
          </ProtectedRoute>
        }
      >
        {/* Redireciona / para home ou dashboard (agent vai para dashboard) */}
        <Route index element={<IndexRedirect />} />
        <Route path="home" element={<AgentRestrictedRoute><CompanyHome /></AgentRestrictedRoute>} />
        <Route path="dashboard" element={<Suspense fallback={<PageSkeleton />}><Dashboard /></Suspense>} />
        <Route path="inbox/*" element={<Suspense fallback={<PageSkeleton />}><InboxPage /></Suspense>} />
        <Route path="tasks" element={<Suspense fallback={<PageSkeleton />}><Tasks /></Suspense>} />
        <Route path="contacts" element={<Suspense fallback={<PageSkeleton />}><Contacts /></Suspense>} />
        <Route path="companies" element={<div className="text-stone-400 p-8">Companies Module</div>} />
        <Route path="deals" element={<Suspense fallback={<PageSkeleton />}><Deals /></Suspense>} />
        <Route path="ai-agents" element={<Suspense fallback={<PageSkeleton />}><AiAgents /></Suspense>} />
        <Route path="ai-agents/:agentId" element={<Suspense fallback={<PageSkeleton />}><AiAgentDetail /></Suspense>} />
        <Route path="members" element={<Suspense fallback={<PageSkeleton />}><MembersPage /></Suspense>} />
        <Route path="teams" element={<Suspense fallback={<PageSkeleton />}><TeamsPage /></Suspense>} />
        <Route path="integrations" element={<AgentRestrictedRoute><Suspense fallback={<PageSkeleton />}><IntegrationsPage /></Suspense></AgentRestrictedRoute>} />
        <Route path="settings" element={<div className="text-stone-400 p-8">Configurações gerais em breve.</div>} />
        <Route path="settings/team" element={<Suspense fallback={<PageSkeleton />}><CompanySettings /></Suspense>} />
      </Route>

      {/* Admin Backoffice */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute allowedRoles={['system_admin', 'platform_admin']}>
            <AdminShell />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="companies" replace />} />
        <Route path="companies" element={<CompaniesList />} />
        <Route path="companies/:id" element={<CompanyDetails />} />
        <Route path="users" element={<UsersList />} />
        <Route path="modules" element={<ModulesList />} />
        <Route path="support" element={<SupportPanel />} />
        <Route path="settings" element={<div className="text-stone-400 p-8">Platform Settings</div>} />
      </Route>

      {/* Access denied */}
      <Route path="/unauthorized" element={<Unauthorized />} />

      {/* Fallback */}
      <Route path="*" element={<div className="flex-center h-screen bg-background text-primary text-xl">404 - Not Found</div>} />
    </Routes>
  );
};
