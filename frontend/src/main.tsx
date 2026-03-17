import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthContext'
import { TenantProvider } from './contexts/TenantContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AppRoutes } from './routes/AppRoutes'
import './index.css'

// Fallback para erros assíncronos — evita tela preta
window.addEventListener('unhandledrejection', (e) => {
  console.error('[Unhandled Rejection]', e.reason);
  const msg = (e.reason?.message || String(e.reason)).slice(0, 200);
  const el = document.getElementById('root');
  if (el && !el.querySelector('[data-error-overlay]')) {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-error-overlay', '');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(10,10,11,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;font-family:system-ui;color:#fafafa;text-align:center;';
    const p = document.createElement('p');
    p.textContent = `Algo deu errado: ${msg}`;
    p.style.cssText = 'font-size:14px;margin-bottom:16px;max-width:400px;';
    const btn = document.createElement('button');
    btn.textContent = 'Recarregar página';
    btn.style.cssText = 'padding:10px 20px;background:#fff;color:#000;border:none;border-radius:8px;cursor:pointer;font-weight:600;';
    btn.onclick = () => { overlay.remove(); location.reload(); };
    overlay.append(p, btn);
    el.appendChild(overlay);
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <TenantProvider>
            <AppRoutes />
          </TenantProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
