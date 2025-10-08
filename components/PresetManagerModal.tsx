import React, { useState, useEffect } from 'react';
import { getRejectionPresets, updateRejectionPresets } from '../services/settingsService';
import { PencilIcon, TrashIcon, CheckIcon } from './Icons';

interface PresetManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PresetManagerModal: React.FC<PresetManagerModalProps> = ({ isOpen, onClose }) => {
  const [presets, setPresets] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newPreset, setNewPreset] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    if (isOpen) {
      const fetchPresets = async () => {
        setIsLoading(true);
        setError(null);
        try {
          const fetchedPresets = await getRejectionPresets();
          setPresets(fetchedPresets);
        } catch (err) {
          setError('Falha ao carregar as mensagens.');
        } finally {
          setIsLoading(false);
        }
      };
      fetchPresets();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddPreset = () => {
    if (newPreset.trim()) {
      setPresets(prev => [...prev, newPreset.trim()]);
      setNewPreset('');
    }
  };
  
  const handleRemovePreset = (indexToRemove: number) => {
    setPresets(prev => prev.filter((_, index) => index !== indexToRemove));
  };
  
  const handleStartEditing = (index: number, text: string) => {
    setEditingIndex(index);
    setEditingText(text);
  };

  const handleCancelEditing = () => {
    setEditingIndex(null);
    setEditingText('');
  };
  
  const handleSaveEdit = () => {
    if (editingIndex !== null && editingText.trim()) {
      setPresets(prev => {
          const updatedPresets = [...prev];
          updatedPresets[editingIndex] = editingText.trim();
          return updatedPresets;
      });
      handleCancelEditing();
    }
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await updateRejectionPresets(presets);
      onClose();
    } catch (err) {
      setError('Falha ao salvar as alterações.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Gerenciar Mensagens de Rejeição</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        </div>
        
        {error && <p className="text-red-500 text-center mb-4">{error}</p>}
        
        <div className="space-y-4 mb-6">
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Adicionar Nova Mensagem</h3>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newPreset}
                    onChange={(e) => setNewPreset(e.target.value)}
                    placeholder="Escreva uma nova mensagem rápida..."
                    className="flex-grow px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                />
                <button onClick={handleAddPreset} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">Adicionar</button>
            </div>
        </div>

        <div className="flex-grow overflow-y-auto pr-2 space-y-3">
            <h3 className="text-lg font-medium text-gray-800 dark:text-gray-200">Mensagens Atuais</h3>
            {isLoading ? <p>Carregando...</p> : (
                presets.length > 0 ? (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {presets.map((preset, index) => (
                            <li key={index} className="py-3 flex items-center justify-between gap-4">
                                {editingIndex === index ? (
                                    <div className="flex-grow flex items-center gap-2">
                                        <input
                                            type="text"
                                            value={editingText}
                                            onChange={(e) => setEditingText(e.target.value)}
                                            className="flex-grow px-3 py-1 border border-primary rounded-md bg-white dark:bg-gray-900"
                                            autoFocus
                                        />
                                        <button onClick={handleSaveEdit} className="text-green-500 hover:text-green-700"><CheckIcon className="w-5 h-5"/></button>
                                        <button onClick={handleCancelEditing} className="text-gray-500 hover:text-gray-700 text-xl">&times;</button>
                                    </div>
                                ) : (
                                    <>
                                        <p className="flex-grow text-gray-700 dark:text-gray-300">{preset}</p>
                                        <div className="flex-shrink-0 flex items-center gap-4">
                                            <button onClick={() => handleStartEditing(index, preset)} className="text-blue-500 hover:text-blue-700"><PencilIcon className="w-5 h-5"/></button>
                                            <button onClick={() => handleRemovePreset(index)} className="text-red-500 hover:text-red-700"><TrashIcon className="w-5 h-5"/></button>
                                        </div>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-gray-500 dark:text-gray-400">Nenhuma mensagem predefinida encontrada. Adicione uma acima.</p>
                )
            )}
        </div>
        
        <div className="mt-6 flex justify-end space-x-3 border-t border-gray-200 dark:border-gray-700 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Cancelar
          </button>
          <button type="button" onClick={handleSaveChanges} disabled={isSaving || isLoading} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-pink-300">
            {isSaving ? 'Salvando...' : 'Salvar e Fechar'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PresetManagerModal;
