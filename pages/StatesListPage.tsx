import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getStatesConfig } from '../services/settingsService';
import { states as allStatesList } from '../constants/states';
import { StatesConfig } from '../types';

const StatesListPage: React.FC = () => {
  const [statesConfig, setStatesConfig] = useState<StatesConfig>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const config = await getStatesConfig();
        setStatesConfig(config);
      } catch (err: any) {
        setError(err.message || "Não foi possível carregar as localidades.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchConfig();
  }, []);
  
  const sortedStates = [...allStatesList].sort((a,b) => a.name.localeCompare(b.name));

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center py-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return <p className="text-red-400 text-center">{error}</p>;
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortedStates.map(state => {
          const config = statesConfig[state.abbr];
          const isActive = config?.isActive ?? true;

          return (
            <Link
              key={state.abbr}
              to={`/admin/state/${state.abbr}`}
              className="group block p-4 bg-gray-700/50 rounded-lg hover:bg-gray-700 transition-all duration-300"
            >
              <div className="flex justify-between items-center">
                <div className="font-semibold text-gray-100">{state.name} ({state.abbr})</div>
                <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${isActive ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
                  {isActive ? 'ATIVO' : 'INATIVO'}
                </span>
              </div>
              <div className="text-sm text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                Gerenciar &rarr;
              </div>
            </Link>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Gerenciar Localidades</h1>
        <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
          &larr; Voltar ao Painel
        </Link>
      </div>
      <div className="bg-secondary shadow-lg rounded-lg p-6">
        <p className="text-gray-400 mb-6">
          Selecione uma localidade para ver estatísticas, gerenciar divulgadoras e editar as configurações de inscrição.
        </p>
        {renderContent()}
      </div>
    </div>
  );
};

export default StatesListPage;
