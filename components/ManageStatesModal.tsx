import React, { useState, useEffect, useCallback } from 'react';
import { getStatesConfig, setStatesConfig, StatesConfig } from '../services/settingsService';
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
    }
  }, [isOpen, fetchConfig]);

  if (!isOpen) {
    return null;
  }

  const handleToggleState = (abbr: string) => {
    setStatesConfig(prev => ({
      ...prev,
      [abbr]: !prev[abbr],
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
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-white">Gerenciar Localidades de Cadastro</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>

        <div className="flex-grow overflow-y-auto border-t border-b border-gray-700 py-4">
          <p className="text-sm text-gray-400 mb-4">
            Ative ou desative as localidades disponíveis para novas inscrições.
          </p>
          {isLoading ? (
            <p>Carregando...</p>
          ) : error ? (
            <p className="text-red-500">{error}</p>
          ) : (
            <div className="space-y-2">
              {allStates.map(state => (
                <label key={state.abbr} className="flex items-center p-3 bg-gray-700/50 rounded-md cursor-pointer hover:bg-gray-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={!!statesConfig[state.abbr]}
                    onChange={() => handleToggleState(state.abbr)}
                    className="h-5 w-5 text-primary bg-gray-800 border-gray-600 focus:ring-primary rounded-sm"
                  />
                  <span className="ml-4 text-gray-200 font-medium">{state.name} ({state.abbr})</span>
                  <span className={`ml-auto text-xs font-bold ${statesConfig[state.abbr] ? 'text-green-400' : 'text-red-400'}`}>
                    {statesConfig[state.abbr] ? 'ATIVO' : 'INATIVO'}
                  </span>
                </label>
              ))}
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