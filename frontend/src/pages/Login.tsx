import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import { ArrowRight, Box } from 'lucide-react';

export const Login: React.FC = () => {
  const { sessionState, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (sessionState === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoggingIn(true);
    setErrorMsg('');
    
    try {
      const result = await login(email, password);
      if (result.error) {
        setErrorMsg(result.error.message || 'Erro ao autenticar.');
        setIsLoggingIn(false);
      }
      // If success + password login, the onAuthStateChange listener will fire and redirect.
      // If success + OTP, the button resets after a moment.
      if (result.success && !password) {
        setErrorMsg('Link mágico enviado! Verifique seu email.');
        setIsLoggingIn(false);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Erro inesperado.');
      setIsLoggingIn(false);
    }
    
    // Safety fallback: if still logging in after 5 seconds, reset
    setTimeout(() => {
      setIsLoggingIn(false);
    }, 5000);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 selection:bg-stone-700 selection:text-white">
      
      {/* Background Decor */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
         <div className="absolute -top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-white/5 blur-[120px]"></div>
         <div className="absolute -bottom-[20%] -left-[10%] w-[60%] h-[60%] rounded-full bg-stone-500/5 blur-[120px]"></div>
      </div>

      <div className="w-full max-w-sm z-10 reveal active">
        {/* Brand */}
        <div className="flex flex-col items-center mb-10">
          <div className="w-16 h-16 rounded-xl bg-surface border border-border flex-center mb-6 shadow-2xl relative overflow-hidden group">
             <div className="absolute inset-0 bg-primary/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500"></div>
             <Box size={32} className="text-primary z-10" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-primary">SalesIA</h1>
          <p className="text-sm font-mono uppercase text-text-muted mt-2 tracking-widest text-center">
            Digital Architecture <br/> for Sales
          </p>
        </div>

        {/* Login Form */}
        <div className="glass-panel p-8 rounded-2xl">
          <h2 className="text-xl font-medium text-primary mb-6">Acesso à Plataforma</h2>
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="email" className="block text-xs font-mono uppercase text-text-muted mb-2 tracking-wide">
                Email
              </label>
              <input 
                id="email"
                type="email" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nome@empresa.com"
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-primary placeholder:text-stone-600 focus:outline-none focus:border-stone-500 transition-colors"
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-mono uppercase text-text-muted mb-2 tracking-wide">
                Senha
              </label>
              <input 
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Sua senha securizada"
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-sm text-primary placeholder:text-stone-600 focus:outline-none focus:border-stone-500 transition-colors"
              />
            </div>

            <button 
              type="submit"
              disabled={isLoggingIn || !email}
              className="w-full bg-primary text-background rounded-lg px-4 py-3 text-sm font-medium hover:bg-stone-200 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              {isLoggingIn ? (
                <span className="font-mono uppercase tracking-widest text-xs">Autenticando...</span>
              ) : (
                <>
                  Entrar no sistema
                  <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>

            {errorMsg && (
              <div className={`mt-3 text-center text-xs font-mono p-2 rounded ${
                errorMsg.includes('enviado') 
                  ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' 
                  : 'text-red-400 bg-red-500/10 border border-red-500/20'
              }`}>
                {errorMsg}
              </div>
            )}
          </form>
          
          <div className="mt-8 text-center border-t border-border pt-6">
            <span className="text-[10px] font-mono uppercase text-stone-600 tracking-widest">
              SalesIA © 2026
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
