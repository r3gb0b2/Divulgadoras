import React, { useState, useEffect } from 'react';
import { PostAssignment } from '../types';
import { getStatsForPromoter } from '../services/postService';
import firebase from '../firebase/config';

interface PromoterPostStatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    promoter: PostAssignment | null; // We pass the whole assignment to get promoterId and name
}

interface Stats {
    assigned: number;
    completed: number;
    missed: number;
    proofDeadlineMissed: number;
    pending: number;
}

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleDateString('pt-BR');
};

const getStatusInfo = (assignment: PostAssignment): { text: string; color: string } => {
    if (assignment.proofSubmittedAt) {
        return { text: 'Concluído', color: 'bg-green-900/50 text-green-300' };
    }
    const expiresAt = assignment.post.expiresAt;
    if (expiresAt && (expiresAt as firebase.firestore.Timestamp).toDate() < new Date()) {
        return { text: 'Perdido', color: 'bg-red-900/50 text-red-300' };
    }
    return { text: 'Pendente', color: 'bg-yellow-900/50 text-yellow-300' };
};

const PromoterPostStatsModal: React.FC<PromoterPostStatsModalProps> = ({ isOpen, onClose, promoter }) => {
    const [stats, setStats] = useState<Stats | null>(null);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && promoter) {
            const fetchStats = async () => {
                setIsLoading(true);
                setError(null);
                try {
                    const result = await getStatsForPromoter(promoter.promoterId);
                    setStats(result.stats);
                    setAssignments(result.assignments);
                } catch (err: any) {
                    setError(err.message);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchStats();
        }
    }, [isOpen, promoter]);

    if (!isOpen || !promoter) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Estatísticas de Posts: <span className="text-primary">{promoter.promoterName}</span></h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
                </div>
                
                <div className="flex-grow overflow-y-auto pr-2">
                    {isLoading ? (
                        <div className="flex justify-center items-center py-10">
                            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        </div>
                    ) : error ? (
                        <div className="text-red-400 text-center py-10">{error}</div>
                    ) : stats && (
                        <>
                            {/* Stats Cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Designadas</h3><p className="text-2xl font-bold text-white">{stats.assigned}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Concluídas</h3><p className="text-2xl font-bold text-green-400">{stats.completed}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Prazo Perdido</h3><p className="text-2xl font-bold text-orange-400">{stats.proofDeadlineMissed}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Perdidas</h3><p className="text-2xl font-bold text-red-400">{stats.missed}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Pendentes</h3><p className="text-2xl font-bold text-yellow-400">{stats.pending}</p></div>
                            </div>
                            
                            {/* Assignments List */}
                            <h3 className="text-xl font-semibold text-white mb-3">Histórico de Publicações</h3>
                            <div className="space-y-3">
                                {assignments.map(assignment => {
                                    const statusInfo = getStatusInfo(assignment);
                                    return (
                                        <div key={assignment.id} className="bg-gray-800/50 p-3 rounded-md flex justify-between items-center">
                                            <div>
                                                <p className="font-semibold text-gray-200">{assignment.post.campaignName}</p>
                                                <p className="text-xs text-gray-500">Criado em: {formatDate(assignment.post.createdAt)}</p>
                                            </div>
                                            <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${statusInfo.color}`}>
                                                {statusInfo.text}
                                            </span>
                                        </div>
                                    );
                                })}
                                {assignments.length === 0 && (
                                    <p className="text-gray-400 text-center py-4">Nenhuma publicação encontrada.</p>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PromoterPostStatsModal;