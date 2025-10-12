import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { states as allStates } from '../constants/states';
import { getStatesConfig } from '../services/settingsService';

const StateSelection: React.FC = () => {
  const [activeStates, setActiveStates] = useState<{ abbr: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActiveStates = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const config = await getStatesConfig();
        const enabledStates = allStates.filter(state => config[state.abbr]?.isActive);
        setActiveStates(enabledStates);
      } catch (err: any) {
        setError(err.message || "Não foi possível carregar as localidades. Tente novamente mais tarde.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchActiveStates();
  }, []);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return <p className="text-red-400 text-center">{error}</p>;
    }
    
    if (activeStates.length === 0) {
        return <p className="text-gray-400 text-center">Nenhuma localidade com inscrições abertas no momento.</p>;
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {activeStates.map(state => (
          <Link
            key={state.abbr}
            to={`/register/${state.abbr}`}
            className="block p-4 bg-gray-700 rounded-lg text-center font-semibold text-gray-200 hover:bg-primary hover:text-white transition-all duration-300 transform hover:scale-105"
          >
            <span className="text-2xl">{state.abbr}</span>
            <span className="block text-xs mt-1">{state.name}</span>
          </Link>
        ))}
      </div>
    );
  };

  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="bg-secondary shadow-2xl rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">
          Seja uma Divulgadora
        </h1>
        <p className="text-gray-400 mb-8">
          Selecione a sua localidade para iniciar o cadastro.
        </p>
        {renderContent()}
      </div>
    </div>
  );
};

export default StateSelection;
