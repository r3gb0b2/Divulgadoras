
import React, { useState, useEffect } from 'react';
import { PostAssignment, Promoter } from '../types';
import { getStatsForPromoterByEmail } from '../services/postService';
import { Timestamp } from 'firebase/firestore';

interface PromoterPublicStatsModalProps {
    isOpen: boolean;
    onClose: () => void;
    promoter: Promoter | null;
}

interface Stats {
    assigned: number;
    completed: number;
    missed: number;
    justifications: number;
    acceptedJustifications: number;
    pending: number;
}

// Helper to safely convert various date formats to a Date object
const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) {
        return null;
    }
    // Firestore Timestamp
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    // Serialized Timestamp object
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
        return new Date(timestamp.seconds * 1000);
    }
    // ISO string or number (milliseconds)
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return null;
};

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleDateString('pt-BR');
};

const getStatusInfo = (assignment: PostAssignment): { text: string; color: string } => {
    // 1. Proof submitted is always "Concluído"
    if (assignment.proofSubmittedAt) {
        return { text: 'Concluído', color: 'bg-green-900/50 text-green-300' };
    }

    // 2. Handle justifications - Check status FIRST
    if (assignment.justificationStatus === 'accepted') {
        return { text: 'Concluído (Justificado)', color: 'bg-green-900/50 text-green-300' };
    }
    if (assignment.justificationStatus === 'rejected') {
        return { text: 'Perdido (Justificativa Rejeitada)', color: 'bg-red-900/50 text-red-300' };
    }
    if (assignment.justificationStatus === 'pending' || assignment.justification) {
        return { text: 'Justificativa Pendente', color: 'bg-yellow-900/50 text-yellow-300' };
    }
    
    // 3. Handle posts without proof or justification
    const now = new Date();
    let isMissed = false;

    if (!assignment.post?.allowLateSubmissions) {
        const expiresAt = toDateSafe(assignment.post?.expiresAt);
        const confirmedAt = toDateSafe(assignment.confirmedAt);

        // Check against 24h proof window if confirmed
        if (assignment.status === 'confirmed' && confirmedAt) {
            const proofDeadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
            if (now > proofDeadline) {
                isMissed = true;
            }
        }
        // If not yet confirmed, check against post expiration
        else if (expiresAt && now > expiresAt) {
            isMissed = true;
        }
    }

    if (isMissed) {
        return { text: 'Perdido', color: 'bg-red-900/50 text-red-300' };
    }

    // 4. Default to pending if not missed and not completed
    return { text: 'Pendente', color: 'bg-yellow-900/50 text-yellow-300' };
};

const PromoterPublicStatsModal: React.FC<PromoterPublicStatsModalProps> = ({ isOpen, onClose, promoter }) => {
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
                    const result = await getStatsForPromoterByEmail(promoter.email);
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

    const successfulOutcomes = stats ? stats.completed + stats.acceptedJustifications : 0;
    const completionPercentage = stats && stats.assigned > 0
        ? ((successfulOutcomes / stats.assigned) * 100).toFixed(0)
        : '0';


    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Minhas Estatísticas: <span className="text-primary">{promoter.name}</span></h2>
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
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 mb-6">
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Designadas</h3><p className="text-2xl font-bold text-white">{stats.assigned}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Concluídas</h3><p className="text-2xl font-bold text-green-400">{stats.completed}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Justificativas</h3><p className="text-2xl font-bold text-yellow-400">{stats.justifications}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Perdidas</h3><p className="text-2xl font-bold text-red-400">{stats.missed}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Pendentes</h3><p className="text-2xl font-bold text-yellow-400">{stats.pending}</p></div>
                                <div className="bg-dark/70 p-4 rounded-lg text-center"><h3 className="text-gray-400 text-sm">Aproveitamento</h3><p className="text-2xl font-bold text-blue-400">{completionPercentage}%</p></div>
                            </div>
                            
                            {/* Assignments List */}
                            <h3 className="text-xl font-semibold text-white mb-3">Histórico de Publicações</h3>
                            <div className="space-y-3">
                                {assignments.map(assignment => {
                                    const statusInfo = getStatusInfo(assignment);
                                    return (
                                        <div key={assignment.id} className="bg-gray-800/50 p-3 rounded-md flex justify-between items-center">
                                            <div>
                                                {/* FIX: Add optional chaining for safety */}
                                                <p className="font-semibold text-gray-200">{assignment.post?.campaignName}</p>
                                                {assignment.post?.eventName && <p className="text-sm text-gray-300 -mt-1">{assignment.post.eventName}</p>}
                                                <p className="text-xs text-gray-500">Criado em: {formatDate(assignment.post?.createdAt)}</p>
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
                 <div className="mt-6 flex justify-end border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark">
                        Fechar
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PromoterPublicStatsModal;
