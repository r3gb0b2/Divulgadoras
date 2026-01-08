
import React, { useState, useMemo } from 'react';
import { RejectionReason } from '../types';
import { SparklesIcon } from './Icons';

interface RejectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reason: string, allowEdit: boolean, offerVip: boolean) => void;
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
  const [allowEdit, setAllowEdit] = useState(false);
  const [offerVip, setOfferVip] = useState(false);

  const combinedReasons = useMemo(() => {
    const reasonMap = new Map<string, RejectionReason>();
    
    reasons.forEach(reason => {
        reasonMap.set(reason.text.trim().toLowerCase(), reason);
    });

    defaultRejectionReasons.forEach(defaultReason => {
        const key = defaultReason.text.trim().toLowerCase();
        if (!reasonMap.has(key)) {
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
    const baseReasons = [
        ...Array.from(selectedReasons),
        ...(customReason.trim() ? [customReason.trim()] : [])
    ];
    
    let reasonMessage = baseReasons.length > 0 
        ? `- ${baseReasons.join('\n- ')}` 
        : 'Agradecemos o seu interesse, mas no momento as vagas da equipe foram preenchidas e seu perfil não foi selecionado.';

    // Se oferecer VIP estiver marcado, adicionamos o gancho de vendas
    if (offerVip) {
        reasonMessage += "\n\n🎁 OPORTUNIDADE ESPECIAL: Notamos seu grande interesse em estar conosco e, como agradecimento, liberamos um acesso promocional exclusivo para o nosso CLUBE VIP com valor diferenciado. Não fique de fora da festa! Reserve agora: https://divulgadoras.vercel.app/#/clubvip";
    }

    onConfirm(reasonMessage, allowEdit, offerVip);
    
    // Reset state
    setSelectedReasons(new Set());
    setCustomReason('');
    setAllowEdit(false);
    setOfferVip(false);
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex justify-center items-center z-[150] p-4" onClick={onClose}>
      <div className="bg-secondary rounded-[2.5rem] shadow-2xl p-8 w-full max-w-lg max-h-[90vh] flex flex-col border border-white/10" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Finalizar Recusa</h2>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">&times;</button>
        </div>
        
        <div className="flex-grow overflow-y-auto space-y-6 pr-2 custom-scrollbar">
            <div className="space-y-3">
                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Motivos da Rejeição:</h3>
                <div className="space-y-2">
                    {combinedReasons.map(reason => (
                        <label key={reason.id} className={`flex items-center p-3 rounded-2xl border transition-all cursor-pointer ${selectedReasons.has(reason.text) ? 'bg-primary/10 border-primary/50 text-white' : 'bg-dark/50 border-white/5 text-gray-400 hover:bg-gray-800'}`}>
                            <input
                                type="checkbox"
                                checked={selectedReasons.has(reason.text)}
                                onChange={() => handleReasonToggle(reason.text)}
                                className="h-4 w-4 text-primary bg-dark border-gray-700 focus:ring-0 rounded"
                            />
                            <span className="ml-3 text-xs font-bold">{reason.text}</span>
                        </label>
                    ))}
                </div>
            </div>

            <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Observação Adicional:</label>
                <textarea
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Algo mais que deseja dizer?"
                    className="w-full px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm outline-none focus:ring-1 focus:ring-primary min-h-[100px]"
                />
            </div>
            
            <div className="space-y-3 pt-2 border-t border-white/5">
                <label className="flex items-center p-4 bg-orange-900/10 rounded-2xl border border-orange-500/20 cursor-pointer group">
                    <input
                        type="checkbox"
                        checked={allowEdit}
                        onChange={(e) => setAllowEdit(e.target.checked)}
                        className="h-5 w-5 text-orange-500 bg-dark border-gray-700 focus:ring-0 rounded"
                    />
                    <div className="ml-4">
                        <span className="block text-xs font-black text-orange-400 uppercase tracking-tight">Permitir Correção</span>
                        <span className="block text-[10px] text-gray-500">Ela poderá editar as fotos e enviar de novo.</span>
                    </div>
                </label>

                {/* NOVO CAMPO: OFERECER CLUB VIP */}
                <label className="flex items-center p-4 bg-primary/10 rounded-2xl border border-primary/20 cursor-pointer group relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-all">
                        <SparklesIcon className="w-12 h-12 text-primary" />
                    </div>
                    <input
                        type="checkbox"
                        checked={offerVip}
                        onChange={(e) => setOfferVip(e.target.checked)}
                        className="h-5 w-5 text-primary bg-dark border-gray-700 focus:ring-0 rounded z-10"
                    />
                    <div className="ml-4 z-10">
                        <span className="block text-xs font-black text-white uppercase tracking-tight flex items-center gap-2">
                            Oferecer CLUB VIP <SparklesIcon className="w-3 h-3 text-primary" />
                        </span>
                        <span className="block text-[10px] text-gray-400">Envia convite com valor promocional.</span>
                    </div>
                </label>
            </div>
        </div>

        <div className="mt-8 flex gap-3 border-t border-white/5 pt-6">
          <button type="button" onClick={onClose} className="flex-1 py-4 bg-gray-800 text-gray-400 font-black rounded-2xl uppercase text-xs tracking-widest transition-all">
            Cancelar
          </button>
          <button 
            type="button" 
            onClick={handleConfirm} 
            className="flex-[2] py-4 bg-red-600 text-white font-black rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-red-900/20 hover:bg-red-500 transition-all transform active:scale-95"
          >
            Confirmar Rejeição
          </button>
        </div>
      </div>
    </div>
  );
};

export default RejectionModal;
