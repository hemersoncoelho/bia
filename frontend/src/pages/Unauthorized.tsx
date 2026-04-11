import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldX } from 'lucide-react';

export const Unauthorized: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#0A0A0B] text-stone-300 gap-6">
      <ShieldX className="w-16 h-16 text-red-500" />
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-white mb-2">Acesso Negado</h1>
        <p className="text-stone-400 text-sm max-w-sm">
          Voce nao tem permissao para acessar esta pagina. Contate o administrador caso acredite que isso e um erro.
        </p>
      </div>
      <div className="flex gap-3">
        <button
          onClick={() => navigate(-1)}
          className="px-4 py-2 text-sm rounded-md bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors"
        >
          Voltar
        </button>
        <button
          onClick={() => navigate('/dashboard')}
          className="px-4 py-2 text-sm rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
        >
          Ir para o Dashboard
        </button>
      </div>
    </div>
  );
};
