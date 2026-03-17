import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Company, UserProfile, Role } from '../types';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface TenantContextType {
  currentCompany: Company | null;
  availableCompanies: Company[];
  companyRole: Role | null; // role_in_company na empresa atual (company_admin, manager, agent)
  isSupportMode: boolean;
  tenantLoading: boolean;
  setCompany: (companyId: string) => void;
  impersonatedUser: UserProfile | null;
  enableSupportMode: (companyId: string, simulateUser?: UserProfile) => Promise<void>;
  disableSupportMode: () => void;
  refreshCompanies: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

const STORAGE_KEY = 'salesia-current-company';

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, _setImpersonatedUser } = useAuth();
  const [currentCompany, setCurrentCompany] = useState<Company | null>(() => {
    // Restore from localStorage on mount (used on page refresh / INITIAL_SESSION)
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch { return null; }
  });
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);
  const [companyRole, setCompanyRole] = useState<Role | null>(null);
  const [isSupportMode, setIsSupportMode] = useState(false);
  const [impersonatedUser, setImpersonatedUser] = useState<UserProfile | null>(null);
  const [tenantLoading, setTenantLoading] = useState(true);

  // On a fresh login (SIGNED_IN), always clear the stored company so the user
  // is forced through /select-company. On page refresh (INITIAL_SESSION), the
  // localStorage value is kept and the user lands directly on the dashboard.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        setCurrentCompany(null);
        setIsSupportMode(false);
        setImpersonatedUser(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchCompanies = useCallback(async () => {
    if (!user) {
      setAvailableCompanies([]);
      setCurrentCompany(null);
      localStorage.removeItem(STORAGE_KEY);
      setIsSupportMode(false);
      setTenantLoading(false);
      return;
    }
    setTenantLoading(true);
    try {
      let companies: Company[] = [];

      if (user.role === 'system_admin' || user.role === 'platform_admin') {
        const { data, error } = await supabase
          .from('companies')
          .select('id, name')
          .eq('is_active', true);
        
        if (!error && data) companies = data as Company[];
      } else {
        const { data, error } = await supabase
          .from('user_companies')
          .select(`company_id, companies (id, name)`)
          .eq('user_id', user.id);
          
        if (!error && data) {
          companies = data.map((row: any) => row.companies).filter(Boolean) as Company[];
        }
      }

      setAvailableCompanies(companies);
      setCurrentCompany(prev => {
        if (!prev) return null;
        const stillValid = companies.some(c => c.id === prev.id);
        if (!stillValid) {
          localStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return prev;
      });
    } catch (err) {
      console.error('[Tenant] Error fetching companies:', err);
    } finally {
      setTenantLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // Busca role do usuário efetivo na empresa atual (company_admin, manager, agent)
  // Em modo suporte, usa o usuário impersonado; senão, o usuário logado
  useEffect(() => {
    const effectiveUserId = impersonatedUser?.id ?? user?.id;
    if (!effectiveUserId || !currentCompany) {
      setCompanyRole(null);
      return;
    }
    // system_admin fora do suporte não precisa de companyRole (está no backoffice)
    if ((user?.role === 'system_admin' || user?.role === 'platform_admin') && !impersonatedUser) {
      setCompanyRole(null);
      return;
    }
    const fetchCompanyRole = async () => {
      const { data } = await supabase
        .from('user_companies')
        .select('role_in_company')
        .eq('user_id', effectiveUserId)
        .eq('company_id', currentCompany.id)
        .maybeSingle();
      setCompanyRole((data?.role_in_company as Role) ?? null);
    };
    fetchCompanyRole();
  }, [user, currentCompany, impersonatedUser]);

  const setCompany = useCallback((companyId: string) => {
    const company = availableCompanies.find(c => c.id === companyId);
    if (company) {
      setCurrentCompany(company);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(company));
      setIsSupportMode(false);
      setImpersonatedUser(null);
      _setImpersonatedUser(null);
    }
  }, [availableCompanies, _setImpersonatedUser]);

  const enableSupportMode = useCallback(async (companyId: string, simulateUser?: UserProfile) => {
    if (user?.role !== 'system_admin' && user?.role !== 'platform_admin') return;
    
    const company = availableCompanies.find(c => c.id === companyId);
    if (company) {
      // Create Audit Log
      await supabase.from('audit_logs').insert({
          actor_id: user.id,
          impersonated_user_id: simulateUser?.id || null,
          company_id: company.id,
          action: 'ENTER_SUPPORT_MODE'
      });

      setCurrentCompany(company);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(company));
      setIsSupportMode(true);
      
      if (simulateUser) {
         setImpersonatedUser(simulateUser);
         _setImpersonatedUser(simulateUser);
      }
    }
  }, [user, availableCompanies]);

  const disableSupportMode = useCallback(() => {
    setIsSupportMode(false);
    setImpersonatedUser(null);
    _setImpersonatedUser(null);
    setCurrentCompany(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [_setImpersonatedUser]);

  const value = useMemo(() => ({
    currentCompany,
    availableCompanies,
    companyRole,
    setCompany,
    isSupportMode,
    tenantLoading,
    impersonatedUser,
    enableSupportMode,
    disableSupportMode,
    refreshCompanies: fetchCompanies,
  }), [
    currentCompany,
    availableCompanies,
    companyRole,
    setCompany,
    isSupportMode,
    tenantLoading,
    impersonatedUser,
    enableSupportMode,
    disableSupportMode,
    fetchCompanies,
  ]);

  return (
    <TenantContext.Provider value={value}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = () => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
