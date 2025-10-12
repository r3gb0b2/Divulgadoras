import React, { useState, useEffect, useCallback } from 'react';
import { getRejectionReasons, addRejectionReason, updateRejectionReason, deleteRejectionReason } from '../services/promoterService';
import { RejectionReason } from '../types';

interface ManageReasonsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReasonsUpdated: () => void;
}

const ManageReasonsModal: React.FC<ManageReasonsModalProps> = ({ isOpen, onClose, onReasonsUpdated }) => {
  const [reasons, setReasons] = useState<RejectionReason[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [newReasonText, setNewReasonText] = useState('');
  const [editingReason, setEditingReason] = useState<RejectionReason | null>(null);

  const fetchReasons = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const data = await getRejectionReasons();
      setReasons(data);
    } catch (err) {
      setError('Falha ao carregar os motivos.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchReasons();
    }
  }, [isOpen, fetchReasons]);

  if (!isOpen) {
    return null;
  }

  const handleAddReason = async () => {
    if (!newReasonText.trim()) return;
    try {
      await addRejectionReason(newReasonText);
      setNewReasonText('');
      await fetchReasons();
      onReasonsUpdated();
    } catch (err) {
      setError('Falha ao adicionar motivo.');
    }
  };

  const handleUpdateReason = async () => {
    if (!editingReason || !editingReason.text.trim()) return;
    try {
      await updateRejectionReason(editingReason.id, editingReason.text);
      setEditingReason(null);
      await fetchReasons();
      onReasonsUpdated();
    } catch (err) {
      setError('Falha ao atualizar motivo.');
    }
  };

  const handleDeleteReason = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este motivo?')) {
      try {
        await deleteRejectionReason(id);
        await fetchReasons();
        onReasonsUpdated();
      } catch (err) {
        setError('Falha ao remover motivo.');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-light">Gerenciar Motivos de Rejeição</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        </div>

        <div className="space-y-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-200">Adicionar Novo Motivo</h3>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newReasonText}
                    onChange={(e) => setNewReasonText(e.target.value)}
                    placeholder="Digite o novo motivo..."
                    className="flex-grow mt-1 w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                />
                <button onClick={handleAddReason} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark self-start mt-1">Adicionar</button>
            </div>
        </div>

        <div className="flex-grow overflow-y-auto border-t border-b border-gray-700 py-4">
            <h3 className="text-lg font-semibold text-gray-200 mb-2">Motivos Existentes</h3>
            {isLoading && <p>Carregando...</p>}
            {error && <p className="text-red-500">{error}</p>}
            <ul className="space-y-2">
                {reasons.map(reason => (
                    <li key={reason.id} className="flex items-center justify-between p-2 bg-gray-700/50 rounded-md">
                        {editingReason?.id === reason.id ? (
                            <input
                                type="text"
                                value={editingReason.text}
                                onChange={(e) => setEditingReason({ ...editingReason, text: e.target.value })}
                                className="flex-grow px-2 py-1 border border-gray-600 rounded-md bg-gray-800"
                            />
                        ) : (
                            <p className="text-gray-200">{reason.text}</p>
                        )}
                        <div className="flex gap-2 ml-4">
                            {editingReason?.id === reason.id ? (
                                <>
                                    <button onClick={handleUpdateReason} className="text-green-400 hover:text-green-300">Salvar</button>
                                    <button onClick={() => setEditingReason(null)} className="text-gray-400 hover:text-gray-300">Cancelar</button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => setEditingReason(reason)} className="text-indigo-400 hover:text-indigo-300">Editar</button>
                                    <button onClick={() => handleDeleteReason(reason.id)} className="text-red-400 hover:text-red-300">Excluir</button>
                                </>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
        <div className="mt-6 flex justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
              Fechar
            </button>
        </div>
      </div>
    </div>
  );
};

export default ManageReasonsModal;