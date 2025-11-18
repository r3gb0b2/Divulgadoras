
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllParticipantsForAdmin, toggleParticipantBan } from '../services/followLoopService';
import { getStatsForPromoter } from '../services/postService';
import { FollowLoopParticipant } from '../types';
import { ArrowLeftIcon, SearchIcon, InstagramIcon } from '../components/Icons';

interface ParticipantWithStats extends FollowLoopParticipant {
    taskCompletionRate: number;
}

const AdminFollowLoopPage: React.FC = () => {
    const navigate = useNavigate();
    const { selectedOrgId } = useAdminAuth();
    
    const [participants, setParticipants] = useState<ParticipantWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [processingId, setProcessingId] = useState<string | null>(null);
    const [filterType, setFilterType] = useState<'all' | 'active' | 'banned' | 'high_rejection'>('all');

    useEffect(() => {
        const fetchData = async () => {
            if (!selectedOrgId) return;
            setIsLoading(true);
            setError('');
            try {
                const loopParticipants = await getAllParticipantsForAdmin(selectedOrgId);
                
                // Parallel fetch for task stats to enrich the data
                const enriched = await Promise.all(loopParticipants.map(async (p) => {
                    try {
                        // We need promoter stats. Using the existing service.
                        // Ideally we would have this in the loop participant doc, but fetching is safer for accuracy.
                        const { stats } = await getStatsForPromoter(p.promoterId);
                        const successful = stats.completed + stats.acceptedJustifications;
                        const rate = stats.assigned > 0 ? Math.round((successful / stats.assigned) * 100) : -1;
                        return { ...p, taskCompletionRate: rate };
                    } catch (e) {
                        return { ...p, taskCompletionRate: -1 };
                    }
                }));

                setParticipants(enriched);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [selectedOrgId]);

    const handleToggleBan = async (p: ParticipantWithStats) => {
        const action = p.isBanned ? 'remover o banimento de' : 'banir';
        if (!window.confirm(`Tem certeza que deseja ${action} ${p.promoterName}?`)) return;
        
        setProcessingId(p.id);
        try {
            await toggleParticipantBan(p.id, !p.isBanned);
            setParticipants(prev => prev.map(item => 
                item.id === p.id ? { ...item, isBanned: !p.isBanned, isActive: !p.isBanned } : item
            ));
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    };

    const filteredParticipants = useMemo(() => {
        let result = participants;

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            result = result.filter(p => 
                p.promoterName.toLowerCase().includes(q) || 
                p.instagram.toLowerCase().includes(q)
            );
        }

        if (filterType === 'active') result = result.filter(p => p.isActive && !p.isBanned);
        if (filterType === 'banned') result = result.filter(p => p.isBanned);
        if (filterType === 'high_rejection') result = result.filter(p => (p.rejectedCount || 0) > 2);

        // Sort: High rejection first, then active
        result.sort((a, b) => (b.rejectedCount || 0) - (a.rejectedCount || 0));

        return result;
    }, [participants, searchQuery, filterType]);

    const getPerformanceColor = (rate: number) => {
        if (rate < 0) return 'text-gray-400';
        if (rate === 100) return 'text-green-400';
        if (rate >= 60) return 'text-blue-400';
        return 'text-red-400';
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Gerenciar Conexão Divulgadoras</h1>
                <button onClick={() => navigate('/admin/settings')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <p className="text-gray-400 mb-6">
                    Monitore a dinâmica de seguidores. Identifique e remova participantes que não estão seguindo de volta (muitas negativas) ou que possuem baixo desempenho nas tarefas.
                </p>

                <div className="flex flex-col md:flex-row gap-4 mb-6">
                    <div className="relative flex-grow">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" /></span>
                        <input 
                            type="text" 
                            placeholder="Buscar nome ou instagram..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        />
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        <button onClick={() => setFilterType('all')} className={`px-4 py-2 rounded-md whitespace-nowrap ${filterType === 'all' ? 'bg-primary' : 'bg-gray-700'}`}>Todos</button>
                        <button onClick={() => setFilterType('active')} className={`px-4 py-2 rounded-md whitespace-nowrap ${filterType === 'active' ? 'bg-primary' : 'bg-gray-700'}`}>Ativos</button>
                        <button onClick={() => setFilterType('high_rejection')} className={`px-4 py-2 rounded-md whitespace-nowrap ${filterType === 'high_rejection' ? 'bg-primary' : 'bg-gray-700'}`}>Alerta de Negativas</button>
                        <button onClick={() => setFilterType('banned')} className={`px-4 py-2 rounded-md whitespace-nowrap ${filterType === 'banned' ? 'bg-primary' : 'bg-gray-700'}`}>Banidos</button>
                    </div>
                </div>

                {isLoading ? <p className="text-center py-8">Carregando...</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Participante</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Seguiu (Diz)</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Ganhou</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-red-400 uppercase" title="Vezes que alguém disse que ela NÃO seguiu">Negativas</th>
                                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-300 uppercase">Taxa Tarefas</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {filteredParticipants.map(p => (
                                    <tr key={p.id} className={`hover:bg-gray-700/40 ${p.isBanned ? 'opacity-50' : ''}`}>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <div className="flex items-center">
                                                <img src={p.photoUrl || 'https://via.placeholder.com/40'} alt="" className="w-10 h-10 rounded-full object-cover mr-3 border border-gray-600"/>
                                                <div>
                                                    <div className="font-medium text-white">{p.promoterName}</div>
                                                    <div className="text-xs text-gray-400 flex items-center gap-1"><InstagramIcon className="w-3 h-3"/> {p.instagram}</div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-300">{p.followingCount}</td>
                                        <td className="px-4 py-3 text-center text-sm text-gray-300">{p.followersCount}</td>
                                        <td className="px-4 py-3 text-center">
                                            {(p.rejectedCount || 0) > 0 ? (
                                                <span className="px-2 py-1 rounded-full bg-red-900/50 text-red-300 font-bold text-xs">{p.rejectedCount}</span>
                                            ) : <span className="text-gray-500">-</span>}
                                        </td>
                                        <td className="px-4 py-3 text-center font-bold text-sm">
                                            <span className={getPerformanceColor(p.taskCompletionRate)}>{p.taskCompletionRate >= 0 ? `${p.taskCompletionRate}%` : 'N/A'}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            <button 
                                                onClick={() => handleToggleBan(p)}
                                                disabled={processingId === p.id}
                                                className={`px-3 py-1 rounded-md text-xs font-semibold ${p.isBanned ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}
                                            >
                                                {processingId === p.id ? '...' : (p.isBanned ? 'Desbanir' : 'Banir')}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredParticipants.length === 0 && <p className="text-center text-gray-400 py-8">Nenhum participante encontrado.</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminFollowLoopPage;
