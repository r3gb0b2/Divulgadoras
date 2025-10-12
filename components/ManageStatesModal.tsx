import React, { useState, useEffect, useCallback } from 'react';
import { getStatesConfig, setStatesConfig } from '../services/settingsService';
import { StatesConfig } from '../types';
import { states } from '../constants/states';

interface ManageStatesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ManageStatesModal: React.FC<ManageStatesModalProps> = ({ isOpen, onClose }) => {
  const [statesConfig, setStatesConfig] = useState<StatesConfig>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [expandedState, setExpandedState] = useState<string | null>(null);

  const fetchConfig = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const config = await getStatesConfig();
      setStatesConfig(config);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar a configuração.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      setExpandedState(null);
    }
  }, [isOpen, fetchConfig]);

  if (!isOpen) {
    return null;
  }

  const handleStateConfigChange = (abbr: string, field: string, value: string | boolean) => {
    setStatesConfig(prev => ({
      ...prev,
      [abbr]: {
        ...prev[abbr],
        [field]: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError('');
    try {
      await setStatesConfig(statesConfig);
      onClose(); // Close modal on successful save
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar as alterações.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const allStates = states.sort((a,b) => a.name.localeCompare(b.name));

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Gerenciar Localidades</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto border-t border-b border-gray-700 py-4">
          <p className="text-sm text-gray-400 mb-4">
            Clique em uma localidade para expandir e editar suas configurações. Todas as alterações são salvas ao clicar em "Salvar Alterações".
          </p>
          {isLoading ? (
            <p>Carregando...</p>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : (
            <div className="space-y-2">
              {allStates.map(state => {
                const config = statesConfig[state.abbr];
                const isExpanded = expandedState === state.abbr;
                if (!config) return null;

                return (
                    <div key={state.abbr} className="bg-gray-700/50 rounded-md transition-all">
                        <button 
                            onClick={() => setExpandedState(isExpanded ? null : state.abbr)}
                            className="flex items-center justify-between w-full p-3 text-left"
                        >
                            <span className="font-medium">{state.name} ({state.abbr})</span>
                            <div className="flex items-center gap-4">
                                <span className={`text-xs font-bold ${config.isActive ? 'text-green-400' : 'text-red-400'}`}>
                                    {config.isActive ? 'ATIVO' : 'INATIVO'}
                                </span>
                                <svg className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </button>
                        
                        {isExpanded && (
                            <div className="p-4 border-t border-gray-600 space-y-4">
                                <label className="flex items-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={config.isActive}
                                    onChange={(e) => handleStateConfigChange(state.abbr, 'isActive', e.target.checked)}
                                    className="h-5 w-5 text-primary bg-gray-800 border-gray-600 focus:ring-primary rounded-sm"
                                  />
                                  <span className="ml-3 font-medium text-gray-200">Inscrições Ativas</span>
                                </label>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Link do Grupo WhatsApp</label>
                                    <input 
                                        type="text"
                                        value={config.whatsappLink || ''}
                                        onChange={(e) => handleStateConfigChange(state.abbr, 'whatsappLink', e.target.value)}
                                        placeholder="https://chat.whatsapp.com/..."
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-300 mb-1">Regras da Localidade</label>
                                    <textarea 
                                        value={config.rules || ''}
                                        onChange={(e) => handleStateConfigChange(state.abbr, 'rules', e.target.value)}
                                        placeholder="Digite as regras aqui. Use a tecla Enter para criar novas linhas."
                                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 min-h-[150px]"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
            Cancelar
          </button>
          <button 
            type="button" 
            onClick={handleSave}
            disabled={isSaving || isLoading}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-primary/50"
          >
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ManageStatesModal;