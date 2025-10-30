import React from 'react';
import { Promoter, PromoterStatus, Timestamp } from '../types';

interface PromoterLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  results: Promoter[] | null;
  onGoToPromoter: (promoter: Promoter) => void;
  organizationsMap: Record<string, string>;
}

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR');
};

const getStatusBadge = (status: PromoterStatus) => {
    // FIX: Added 'removed' to the styles record to match the PromoterStatus type.
    const styles: Record<PromoterStatus, string> = {
        pending: "bg-yellow-900/50 text-yellow-300",
        approved: "bg-green-900/50 text-green-300",
        rejected: "bg-red-900/50 text-red-300",
        rejected_editable: "bg-orange-900/50 text-orange-300",
        removed: "bg-gray-700 text-gray-400",
    };
    // FIX: Added 'removed' to the text record to match the PromoterStatus type.
    const text: Record<PromoterStatus, string> = { 
        pending: "Pendente", 
        approved: "Aprovado", 
        rejected: "Rejeitado", 
        rejected_editable: "Correção Solicitada",
        removed: "Removida",
    };
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
};

const PromoterLookupModal: React.FC<PromoterLookupModalProps> = ({
  isOpen,
  onClose,
  isLoading,
  error,
  results,
  onGoToPromoter,
  organizationsMap
}) => {
  if (!isOpen) return null;

  const renderContent = () => {
    if (isLoading) return <div className="flex justify-center items-center h-24"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>;
    if (error) return <p className="text-red-400 text-center">{error}</p>;
    if (!results || results.length === 0) return <p className="text-gray-400 text-center">Nenhum cadastro encontrado para este e-mail.</p>;

    return (
        <div className="space-y-3">
            {results.map(promoter => (
                <div key={promoter.id} className="bg-dark/70 p-3 rounded-lg">
                    <div className="flex justify-between items-start">
                        <div>
                            <p className="font-semibold text-white">{promoter.name}</p>
                            <p className="text-sm text-gray-300">{organizationsMap[promoter.organizationId] || promoter.organizationId}</p>
                            <p className="text-sm text-primary">{promoter.campaignName || 'Sem evento específico'}</p>
                        </div>
                        {getStatusBadge(promoter.status)}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                        Cadastrado em: {formatDate(promoter.createdAt as Timestamp)}
                    </div>
                    <div className="text-right mt-2">
                        <button 
                            onClick={() => onGoToPromoter(promoter)}
                            className="text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                        >
                            Ver na Lista &rarr;
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Resultado da Busca por E-mail</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default PromoterLookupModal;
