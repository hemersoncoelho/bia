import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTenant } from '../contexts/TenantContext';
import type { Role } from '../types';

export const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  allowedRoles?: Role[];
}> = ({ children, allowedRoles }) => {
  const { sessionState, user } = useAuth();
  const { currentCompany, tenantLoading, isSupportMode } = useTenant();
  const location = useLocation();

  if (sessionState === 'loading') {
    return (
      <div className="flex-center w-full h-screen bg-[#0A0A0B] text-stone-400 font-mono text-sm">
        Autenticando...
      </div>
    );
  }

  if (sessionState === 'unauthenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Role verification for explicit role-restricted routes
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Redirect system_admin to /admin ONLY when NOT in support mode
  // In support mode, system_admin operates as a regular user on operational routes
  const isAdminPage = location.pathname.startsWith('/admin');
  const isSelectCompanyPage = location.pathname === '/select-company';

  if ((user.role === 'system_admin' || user.role === 'platform_admin') && !isSupportMode && !isAdminPage && !isSelectCompanyPage) {
    return <Navigate to="/admin" replace />;
  }

  // Wait for tenant data to load before making routing decisions
  if (tenantLoading) {
    return (
      <div className="flex-center w-full h-screen bg-[#0A0A0B] text-stone-400 font-mono text-sm">
        Carregando contexto...
      </div>
    );
  }

  // Tenant Verification - users must select a company first (evita tela em branco)
  if (!currentCompany && !isSelectCompanyPage && !isAdminPage) {
    return <Navigate to="/select-company" replace />;
  }

  return <>{children}</>;
};

export const PublicRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { sessionState, profileLoading, user } = useAuth();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  // Wait for profile to load before redirecting so we know the correct destination
  if (sessionState === 'loading' || profileLoading) {
    return (
      <div className="flex-center w-full h-screen bg-[#0A0A0B] text-stone-400 font-mono text-sm">
        Autenticando...
      </div>
    );
  }

  if (sessionState === 'authenticated') {
    const redirectTo = (user?.role === 'system_admin' || user?.role === 'platform_admin') ? '/admin' : from;
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
};
