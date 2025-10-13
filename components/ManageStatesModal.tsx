import React, { useState, useEffect, useCallback } from 'react';
import { getStatesConfig, setStatesConfig } from '../services/settingsService';
import { StatesConfig } from '../types';
import { states as allStatesList } from '../constants/states';

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
        } catch (err) {
            setError('Falha ao carregar as configurações.');
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

    const handleToggle = (stateAbbr: string) => {
        setStatesConfig(prev => {
            const currentState = prev[stateAbbr] || { isActive: true, rules: '' };
            return {
                ...prev,
                [stateAbbr]: { ...currentState, isActive: !currentState.isActive }
            };
        });
    };
    
    const handleSave = async () => {
        setIsSaving(true);
        setError('');
        try {
            await setStatesConfig(statesConfig);
            onClose();
        } catch(err) {
            setError('Falha ao salvar. Tente novamente.');
        } finally {
            setIsSaving(false);
        }
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Gerenciar Localidades</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
                </div>
                
                <p className="text-sm text-gray-400 mb-4">Ative ou desative os estados disponíveis para cadastro de divulgadoras.</p>

                <div className="flex-grow overflow-y-auto border-t border-b border-gray-700 py-4">
                    {isLoading ? (
                        <p>Carregando...</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            {allStatesList.map(state => {
                                const isActive = statesConfig[state.abbr]?.isActive ?? true;
                                return (
                                    <label key={state.abbr} className="flex items-center space-x-3 p-2 bg-gray-700/50 rounded-md cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={isActive}
                                            onChange={() => handleToggle(state.abbr)}
                                            className="h-5 w-5 text-primary bg-gray-800 border-gray-600 focus:ring-primary rounded"
                                        />
                                        <span className="font-medium text-gray-200">{state.name}</span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>

                 {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}

                <div className="mt-6 flex justify-end space-x-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
                      Cancelar
                    </button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                      {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManageStatesModal;
