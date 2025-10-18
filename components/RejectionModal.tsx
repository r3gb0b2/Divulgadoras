import React, { useState, useMemo } from 'react';
import { RejectionReason } from '../types';

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  reasons: RejectionReason[];
}

const defaultRejectionReasons: Omit<RejectionReason, 'organizationId'>[] = [
    { id: 'default-1', text: "Perfil inadequado para a vaga." },
    { id: 'default-2', text: "Fotos de baixa qualidade ou inadequadas." },
    { id: 'default-3', text: "Informações de contato inválidas." },
    { id: 'default-4', text: "Não cumpre os pré-requisitos da vaga." },
    { id: 'default-5', text: "Vagas preenchidas no momento, tente novamente no futuro." }
];


const RejectionModal: React.FC<RejectionModalProps> = ({ isOpen, onClose, onConfirm, reasons }) => {
  const [selectedReasons, setSelectedReasons] = useState<Set<string>>(new Set());
  const [customReason, setCustomReason] = useState('');

  const combinedReasons = useMemo(() => {
    const reasonMap = new Map<string, RejectionReason>();
    
    // Add custom (DB) reasons first to prioritize them and their IDs
    reasons.forEach(reason => {
        reasonMap.set(reason.text.trim().toLowerCase(), reason);
    });

    // Add default reasons only if a reason with the same text doesn't already exist
    defaultRejectionReasons.forEach(defaultReason => {
        const key = defaultReason.text.trim().toLowerCase();
        if (!reasonMap.has(key)) {
            // Add it with a placeholder orgId to satisfy the type
            reasonMap.set(key, { ...defaultReason, organizationId: 'default' });
        }
    });

    return Array.from(reasonMap.values());
  }, [reasons]);


  if (!isOpen) return null;

  const handleReasonToggle = (reasonText: string) => {
    setSelectedReasons(prev => {
      const newSet = new Set(prev);
      if (newSet.has(reasonText)) {
        newSet.delete(reasonText);
      } else {
        newSet.add(reasonText);
      }
      return newSet;
    });
  };

  const handleConfirm = () => {
    const finalReasons = [
        ...Array.from(selectedReasons),
        ...(customReason.trim() ? [customReason.trim()] : [])
    ];
    
    const reasonMessage = finalReasons.length > 0 
        ? `- ${finalReasons.join('\n- ')}` 
        : 'Agradecemos o seu interesse, mas no momento seu perfil não foi selecionado.';

    onConfirm(reasonMessage);
    // Reset state for next use
    setSelectedReasons(new Set());
    setCustomReason('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Motivo da Rejeição</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>
        
        <div className="flex-grow overflow-y-auto space-y-4">
            <h3 className="text-lg font-semibold text-gray-200">Selecione um ou mais motivos:</h3>
            <div className="space-y-2">
                {combinedReasons.map(reason => (
                    <label key={reason.id} className="flex items-center p-2 bg-gray-700/50 rounded-md cursor-pointer hover:bg-gray-700">
                        <input
                            type="checkbox"
                            checked={selectedReasons.has(reason.text)}
                            onChange={() => handleReasonToggle(reason.text)}
                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 focus:ring-primary rounded"
                        />
                        <span className="ml-3 text-gray-200">{reason.text}</span>
                    </label>
                ))}
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                    Outro motivo (opcional):
                </label>
                <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Adicione uma observação ou motivo personalizado..."
                    className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary min-h-[80px]"
                />
            </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
            Cancelar
          </button>
          <button 
            type="button" 
            onClick={handleConfirm} 
            className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
          >
            Confirmar Rejeição
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectionModal;