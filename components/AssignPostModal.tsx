import React, { useState, useEffect } from 'react';
import { Post, PostAssignment, Promoter } from '../types';
import { getApprovedPromoters } from '../services/promoterService';
import { addAssignmentsToPost } from '../services/postService';

interface AssignPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: Post | null;
    existingAssignments: PostAssignment[];
    onSuccess: () => void;
}

const AssignPostModal: React.FC<AssignPostModalProps> = ({ isOpen, onClose, post, existingAssignments, onSuccess }) => {
    const [assignable, setAssignable] = useState<Promoter[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [isLoading, setIsLoading] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen || !post) {
            setAssignable([]);
            setSelected(new Set());
            return;
        }

        const fetchAssignablePromoters = async () => {
            setIsLoading(true);
            setError('');
            try {
                const allApproved = await getApprovedPromoters(post.organizationId, post.stateAbbr, post.campaignName);
                const assignedIds = new Set(existingAssignments.map(a => a.promoterId));
                const filtered = allApproved.filter(p => !assignedIds.has(p.id));
                
                // Sort promoters: those who joined the group first, then alphabetically.
                filtered.sort((a, b) => {
                    const aJoined = a.hasJoinedGroup ? 1 : 0;
                    const bJoined = b.hasJoinedGroup ? 1 : 0;
                    if (bJoined !== aJoined) {
                        return bJoined - aJoined; // Promoters in group come first
                    }
                    return a.name.localeCompare(b.name); // Then sort by name
                });

                setAssignable(filtered);
            } catch (err: any) {
                setError(err.message || "Falha ao buscar divulgadoras.");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAssignablePromoters();
    }, [isOpen, post, existingAssignments]);

    const handleToggle = (id: string) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelected(new Set(assignable.map(p => p.id)));
        } else {
            setSelected(new Set());
        }
    };

    const handleSubmit = async () => {
        if (!post || selected.size === 0) return;
        setIsSubmitting(true);
        setError('');
        try {
            await addAssignmentsToPost(post.id, Array.from(selected));
            onSuccess();
            onClose();
        } catch (err: any) {
            setError(err.message || 'Falha ao atribuir.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">Atribuir a Novas Divulgadoras</h2>
                <p className="text-sm text-gray-400 mb-4">Selecione as divulgadoras aprovadas para <span className="font-semibold text-primary">{post?.campaignName}</span> que ainda não receberam esta publicação.</p>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

                <div className="flex-grow overflow-y-auto border border-gray-700 rounded-lg p-2">
                    {isLoading ? <p>Carregando...</p> : assignable.length > 0 ? (
                        <>
                            <label className="flex items-center space-x-2 p-2 font-semibold">
                                <input type="checkbox" onChange={handleSelectAll} checked={selected.size === assignable.length && assignable.length > 0} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                <span>Selecionar Todas ({selected.size}/{assignable.length})</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {assignable.map(p => (
                                    <label key={p.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-700/50 cursor-pointer">
                                        <input type="checkbox" checked={selected.has(p.id)} onChange={() => handleToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded flex-shrink-0" />
                                        <span 
                                            className={`truncate ${p.hasJoinedGroup ? 'text-green-400 font-semibold' : ''}`}
                                            title={`${p.name} (${p.instagram})${p.hasJoinedGroup ? ' - no grupo' : ''}`}
                                        >
                                            {p.instagram || p.name}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-center text-gray-400 p-6">Nenhuma nova divulgadora encontrada para atribuir.</p>
                    )}
                </div>

                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>
                    <button type="button" onClick={handleSubmit} disabled={isSubmitting || selected.size === 0} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">
                        {isSubmitting ? 'Atribuindo...' : `Atribuir e Notificar (${selected.size})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssignPostModal;