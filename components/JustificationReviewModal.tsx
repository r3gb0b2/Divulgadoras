
import React from 'react';
import { Post, PostAssignment } from '../types';
import { CheckCircleIcon } from './Icons';

interface JustificationReviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: Post | null;
    assignments: PostAssignment[];
    onAcceptAll: () => void;
    isProcessing: boolean;
}

const JustificationReviewModal: React.FC<JustificationReviewModalProps> = ({ 
    isOpen, 
    onClose, 
    post, 
    assignments, 
    onAcceptAll,
    isProcessing 
}) => {
    if (!isOpen || !post) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Justificativas Pendentes</h2>
                        <p className="text-primary text-sm font-semibold">{post.campaignName}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-2xl leading-none">&times;</button>
                </div>

                <div className="flex-grow overflow-y-auto pr-2 mb-4 space-y-3 bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                    {assignments.length === 0 ? (
                        <p className="text-center text-gray-400 py-8">Nenhuma justificativa pendente.</p>
                    ) : (
                        assignments.map(assignment => (
                            <div key={assignment.id} className="bg-gray-800 p-3 rounded-md border border-gray-700">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-semibold text-white text-sm">{assignment.promoterName}</span>
                                    <span className="text-xs text-gray-500">{assignment.promoterEmail}</span>
                                </div>
                                <div className="bg-black/30 p-2 rounded text-sm text-yellow-100 italic">
                                    "{assignment.justification}"
                                </div>
                                {assignment.justificationImageUrls && assignment.justificationImageUrls.length > 0 && (
                                    <div className="flex gap-2 mt-2">
                                        {assignment.justificationImageUrls.map((url, i) => (
                                            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                                                <img src={url} alt="Print" className="w-10 h-10 object-cover rounded border border-gray-600 hover:border-white transition-colors" />
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-700">
                    <button 
                        onClick={onClose} 
                        className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-medium"
                    >
                        Fechar
                    </button>
                    {assignments.length > 0 && (
                        <button 
                            onClick={onAcceptAll} 
                            disabled={isProcessing}
                            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <CheckCircleIcon className="w-5 h-5" />
                            {isProcessing ? 'Processando...' : `Aceitar Todas (${assignments.length})`}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default JustificationReviewModal;
