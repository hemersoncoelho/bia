import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTenant } from '../contexts/TenantContext';

/** Redireciona agentes para /dashboard. Apenas company_admin e manager podem acessar. */
export const AgentRestrictedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { companyRole } = useTenant();

  if (companyRole === 'agent') {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

/** Redireciona / para home (admin/gerente) ou dashboard (agent) */
export const IndexRedirect: React.FC = () => {
  const { companyRole } = useTenant();
  return <Navigate to={companyRole === 'agent' ? '/dashboard' : '/home'} replace />;
};
