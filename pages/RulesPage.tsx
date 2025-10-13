import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { getStateConfig } from '../services/settingsService';
import { StateConfig } from '../types';
import { WhatsAppIcon } from '../components/Icons';

const RulesPage: React.FC = () => {
  const { state } = useParams<{ state: string }>();
  const [config, setConfig] = useState<StateConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (state) {
      const fetchConfig = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const stateConfig = await getStateConfig(state);
          if (stateConfig) {
            setConfig(stateConfig);
          } else {
            setError(`Regras para a localidade "${state}" não encontradas.`);
          }
        } catch (err: any) {
          setError(err.message || 'Ocorreu um erro ao carregar as regras.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchConfig();
    } else {
      setError("Nenhuma localidade especificada.");
      setIsLoading(false);
    }
  }, [state]);

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

    if (config) {
      return (
        <>
          <div 
            className="prose prose-invert prose-p:text-gray-300 prose-li:text-gray-300 prose-headings:text-primary prose-strong:text-primary max-w-none space-y-6"
            dangerouslySetInnerHTML={{ __html: config.rules.replace(/\n/g, '<br />') || '<p>Nenhuma regra específica cadastrada para esta localidade.</p>' }}
          />
        </>
      );
    }
    
    return null;
  }


  return (
    <div className="max-w-3xl mx-auto">
      <div className="bg-secondary shadow-2xl rounded-lg p-8">
        <h1 className="text-3xl font-bold text-center text-gray-100 mb-4">Regras para Divulgadoras - {state?.toUpperCase()}</h1>
        <p className="text-center text-gray-400 mb-8">Leia com atenção para garantir uma boa parceria.</p>
        {renderContent()}
      </div>
    </div>
  );
};

export default RulesPage;