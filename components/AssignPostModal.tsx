
import React, { useState, useEffect, useMemo } from 'react';
import { Post, PostAssignment, Promoter } from '../types';
import { getApprovedPromoters } from '../services/promoterService';
import { addAssignmentsToPost } from '../services/postService';
import { FaceIdIcon } from './Icons';

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
    const [filterInGroup, setFilterInGroup] = useState(false);
    const [filterPushOnly, setFilterPushOnly] = useState(false);

    useEffect(() => {
        if (!isOpen || !post) {
            setAssignable([]);
            setSelected(new Set());
            setFilterInGroup(false);
            setFilterPushOnly(false);
            return;
        }

        const fetchAssignablePromoters = async () => {
            setIsLoading(true);
            setError('');
            try {
                const allApproved = await getApprovedPromoters(post.organizationId, post.stateAbbr, post.campaignName);
                const assignedIds = new Set(existingAssignments.map(a => a.promoterId));
                const filtered = allApproved.filter(p => !assignedIds.has(p.id));
                
                // Ordenação: Quem entrou no grupo primeiro, depois alfabético
                filtered.sort((a, b) => {
                    const aJoined = a.hasJoinedGroup ? 1 : 0;
                    const bJoined = b.hasJoinedGroup ? 1 : 0;
                    if (bJoined !== aJoined) {
                        return bJoined - aJoined;
                    }
                    return a.name.localeCompare(b.name);
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

    const filteredAssignable = useMemo(() => {
        let results = assignable;
        if (filterInGroup) {
            results = results.filter(p => p.hasJoinedGroup === true);
        }
        if (filterPushOnly) {
            results = results.filter(p => !!p.fcmToken);
        }
        return results;
    }, [assignable, filterInGroup, filterPushOnly]);

    const handleToggle = (id: string) => {
        setSelected(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const visibleIds = filteredAssignable.map(p => p.id);
        if (e.target.checked) {
            setSelected(prev => new Set([...prev, ...visibleIds]));
        } else {
            setSelected(prev => {
                const newSet = new Set(prev);
                visibleIds.forEach(id => newSet.delete(id));
                return newSet;
            });
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
    
    const selectedCountInFilter = useMemo(() => {
        const visibleIds = new Set(filteredAssignable.map(p => p.id));
        let count = 0;
        for (const id of selected) {
            if (visibleIds.has(id)) {
                count++;
            }
        }
        return count;
    }, [selected, filteredAssignable]);


    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">Atribuir a Novas Divulgadoras</h2>
                <p className="text-sm text-gray-400 mb-4">Selecione as divulgadoras de <span className="font-semibold text-primary">{post?.campaignName}</span> que receberão esta tarefa.</p>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                
                <div className="flex flex-wrap gap-4 mb-4 bg-dark/50 p-3 rounded-lg border border-gray-700">
                    <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={filterInGroup} 
                            onChange={(e) => setFilterInGroup(e.target.checked)} 
                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                        />
                        <span>Apenas no grupo</span>
                    </label>
                    <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                        <input 
                            type="checkbox" 
                            checked={filterPushOnly} 
                            onChange={(e) => setFilterPushOnly(e.target.checked)} 
                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                        />
                        <span className="flex items-center gap-1.5">
                            <FaceIdIcon className="w-4 h-4 text-green-400" />
                            Apenas com App vinculado
                        </span>
                    </label>
                </div>

                <div className="flex-grow overflow-y-auto border border-gray-700 rounded-lg p-2 bg-dark/30">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                    ) : assignable.length > 0 ? (
                        <>
                            <label className="flex items-center space-x-2 p-2 border-b border-gray-700 mb-2 font-semibold cursor-pointer sticky top-0 bg-secondary/95 backdrop-blur-sm z-10">
                                <input 
                                    type="checkbox" 
                                    onChange={handleSelectAll} 
                                    checked={filteredAssignable.length > 0 && selectedCountInFilter === filteredAssignable.length}
                                    className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" 
                                />
                                <span>Marcar Todas Visíveis ({selectedCountInFilter}/{filteredAssignable.length})</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                                {filteredAssignable.map(p => (
                                    <label key={p.id} className="flex items-center justify-between p-2 rounded hover:bg-gray-700/50 cursor-pointer transition-colors group">
                                        <div className="flex items-center space-x-3 truncate">
                                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => handleToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded flex-shrink-0" />
                                            <div className="flex flex-col truncate">
                                                <span className={`text-sm font-medium truncate ${p.hasJoinedGroup ? 'text-green-400' : 'text-gray-300'}`}>
                                                    {p.name}
                                                </span>
                                                <span className="text-[10px] text-gray-500 font-mono">@{p.instagram}</span>
                                            </div>
                                        </div>
                                        {p.fcmToken && (
                                            <div className="flex-shrink-0 ml-2" title="Possui App instalado (receberá notificação Push)">
                                                <FaceIdIcon className="w-4 h-4 text-green-500 drop-shadow-[0_0_5px_rgba(34,197,94,0.4)]" />
                                            </div>
                                        )}
                                    </label>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-center text-gray-500 p-8 text-sm italic">Nenhuma nova divulgadora disponível para este filtro.</p>
                    )}
                </div>

                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">Cancelar</button>
                    <button type="button" onClick={handleSubmit} disabled={isSubmitting || selected.size === 0} className="px-6 py-2 bg-primary text-white rounded-md font-bold disabled:opacity-50 shadow-lg shadow-primary/20 hover:bg-primary-dark transition-all">
                        {isSubmitting ? 'Atribuindo...' : `Atribuir Selecionadas (${selected.size})`}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AssignPostModal;
