import React, { useState, useEffect } from 'react';
import { getRejectionPresets } from '../services/settingsService';

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  promoterName: string;
}

const RejectionModal: React.FC<RejectionModalProps> = ({ isOpen, onClose, onSubmit, promoterName }) => {
  const [reason, setReason] = useState('');
  const [presets, setPresets] = useState<string[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setReason(''); // Reset reason when modal opens
      
      const fetchPresets = async () => {
          setIsLoadingPresets(true);
          const fetchedPresets = await getRejectionPresets();
          setPresets(fetchedPresets);
          setIsLoadingPresets(false);
      };
      fetchPresets();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!reason.trim()) {
        alert('Por favor, insira um motivo para a rejeição.');
        return;
    }
    setIsSubmitting(true);
    await onSubmit(reason);
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Rejeitar Cadastro</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-4">Você está rejeitando o cadastro de <span className="font-bold">{promoterName}</span>. Por favor, forneça um motivo.</p>
        
        <div className="mb-4">
            <label htmlFor="rejectionReason" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Motivo da Rejeição</label>
            <textarea
              id="rejectionReason"
              rows={4}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary resize-y"
              placeholder="Ex: As fotos enviadas não atendem aos nossos padrões de qualidade."
            />
        </div>

        <div className="mb-6">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Ou use uma mensagem rápida:</p>
            <div className="flex flex-wrap gap-2">
                {isLoadingPresets ? <p className="text-xs text-gray-500">Carregando mensagens...</p> : (
                    presets.map(preset => (
                        <button key={preset} onClick={() => setReason(preset)} className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-sm rounded-full hover:bg-gray-200 dark:hover:bg-gray-600">
                            {preset}
                        </button>
                    ))
                )}
            </div>
        </div>

        <div className="flex justify-end space-x-3">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Cancelar
          </button>
          <button type="button" onClick={handleSubmit} disabled={isSubmitting || !reason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-red-300 dark:disabled:bg-red-800 disabled:cursor-not-allowed">
            {isSubmitting ? 'Rejeitando...' : 'Confirmar Rejeição'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectionModal;
