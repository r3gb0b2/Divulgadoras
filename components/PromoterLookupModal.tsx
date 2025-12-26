
import React from 'react';
import { Promoter, PromoterStatus, Timestamp } from '../types';
import { PencilIcon, TrashIcon, UserIcon } from './Icons';

interface PromoterLookupModalProps {
  isOpen: boolean;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
  results: Promoter[] | null;
  onGoToPromoter: (promoter: Promoter) => void;
  onEdit: (promoter: Promoter) => void;
  onDelete: (promoter: Promoter) => void;
  organizationsMap: Record<string, string>;
}

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR');
};

const getStatusBadge = (status: PromoterStatus) => {
    const styles: Record<PromoterStatus, string> = {
        pending: "bg-blue-900/40 text-blue-400 border-blue-800",
        approved: "bg-green-900/40 text-green-400 border-green-800",
        rejected: "bg-red-900/40 text-red-400 border-red-800",
        rejected_editable: "bg-orange-900/40 text-orange-400 border-orange-800",
        removed: "bg-gray-800 text-gray-500 border-gray-700",
    };
    const text: Record<PromoterStatus, string> = { 
        pending: "Pendente", 
        approved: "Aprovado", 
        rejected: "Rejeitado", 
        rejected_editable: "Corrigir",
        removed: "Removida",
    };
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${styles[status]}`}>{text[status]}</span>;
};

const PromoterLookupModal: React.FC<PromoterLookupModalProps> = ({
  isOpen,
  onClose,
  isLoading,
  error,
  results,
  onGoToPromoter,
  onEdit,
  onDelete,
  organizationsMap
}) => {
  if (!isOpen) return null;

  const getPhotoUrl = (p: Promoter) => {
    if (!p) return null;
    if (p.facePhotoUrl) return p.facePhotoUrl;
    if (p.photoUrls && Array.isArray(p.photoUrls) && p.photoUrls.length > 0) return p.photoUrls[0];
    return null;
  };

  const renderContent = () => {
    if (isLoading) return <div className="flex justify-center items-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div></div>;
    if (error) return <p className="text-red-400 text-center py-10 font-bold uppercase tracking-widest">{error}</p>;
    if (!results || results.length === 0) return <p className="text-gray-500 text-center py-10 font-bold uppercase tracking-widest">Nenhum cadastro encontrado.</p>;

    return (
        <div className="space-y-4">
            {results.map(promoter => {
                if (!promoter) return null;
                const photo = getPhotoUrl(promoter);
                return (
                    <div key={promoter.id} className="bg-dark/50 border border-white/5 p-5 rounded-3xl hover:bg-white/[0.02] transition-colors group">
                        <div className="flex justify-between items-start gap-4">
                            <div className="flex items-center gap-4 min-w-0">
                                <div className="w-12 h-12 rounded-xl overflow-hidden border border-gray-700 flex-shrink-0 bg-gray-800 flex items-center justify-center">
                                    {photo ? (
                                        <img src={photo} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <UserIcon className="w-6 h-6 text-gray-600" />
                                    )}
                                </div>
                                <div className="min-w-0">
                                    <p className="font-black text-white uppercase tracking-tight truncate">{promoter.name || 'Sem Nome'}</p>
                                    <p className="text-[10px] text-primary font-black uppercase tracking-widest truncate">{organizationsMap[promoter.organizationId] || 'Produtora'}</p>
                                    <p className="text-[9px] text-gray-500 font-mono truncate">{promoter.campaignName || 'Geral'}</p>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                {getStatusBadge(promoter.status)}
                                <p className="text-[8px] text-gray-600 font-bold uppercase">{formatDate(promoter.createdAt as Timestamp)}</p>
                            </div>
                        </div>
                        
                        <div className="mt-5 flex items-center justify-between gap-2 border-t border-white/5 pt-4">
                            <button 
                                onClick={() => onGoToPromoter(promoter)}
                                className="text-[9px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors"
                            >
                                Ver na Lista &rarr;
                            </button>
                            
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => onEdit(promoter)}
                                    className="p-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-primary hover:text-white transition-all"
                                    title="Editar Cadastro"
                                >
                                    <PencilIcon className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => onDelete(promoter)}
                                    className="p-2 bg-red-900/20 text-red-500 rounded-lg hover:bg-red-600 hover:text-white transition-all"
                                    title="Excluir Permanentemente"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex justify-center items-center z-[100] p-4" onClick={onClose}>
      <div className="bg-secondary rounded-[2.5rem] shadow-2xl p-8 w-full max-w-xl max-h-[85vh] flex flex-col border border-white/5" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter">Busca Global</h2>
            <button onClick={onClose} className="p-2 text-gray-500 hover:text-white transition-colors">&times;</button>
        </div>
        <div className="flex-grow overflow-y-auto pr-2 -mr-2">
            {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default PromoterLookupModal;
