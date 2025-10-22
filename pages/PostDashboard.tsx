import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAssignmentsForOrganization } from '../services/postService';
import { getAllPromoters } from '../services/promoterService';
import { getAllCampaigns } from '../services/settingsService';
import { PostAssignment, Promoter, Campaign, PromoterStats } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

type SortKey = keyof Omit<PromoterStats, 'id' | 'photoUrls' | 'createdAt' | 'state' | 'campaignName' | 'associatedCampaigns' | 'allCampaigns' | 'organizationId' | 'rejectionReason' | 'hasJoinedGroup' | 'actionTakenByUid' | 'actionTakenByEmail' | 'statusChangedAt' | 'observation' | 'lastManualNotificationAt' | 'status' | 'tiktok' | 'dateOfBirth'> | 'name';
type SortDirection = 'asc' | 'desc';

const getPerformanceColor = (rate: number): string => {
    if (rate > 60) return 'text-green-400';
    if (rate > 30) return 'text-yellow-400';
    return 'text-red-400';
};

const PostDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();

    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);

    // Filtering and sorting state
    const [filterCampaign, setFilterCampaign] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

    const fetchData = useCallback(async () => {
        if (!selectedOrgId) {
            setError("Nenhuma organização selecionada.");
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const [promotersData, assignmentsData, campaignsData] = await Promise.all([
                getAllPromoters({ organizationId: selectedOrgId, status: 'approved', selectedCampaign: 'all', filterOrgId: 'all', filterState: 'all' }),
                getAssignmentsForOrganization(selectedOrgId),
                getAllCampaigns(selectedOrgId),
            ]);
            setPromoters(promotersData);
            setAssignments(assignmentsData);
            setCampaigns(campaignsData.sort((a,b) => a.name.localeCompare(b.name)));
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);
    
    const processedStats = useMemo(() => {
        type PromoterStatsWithAccepted = PromoterStats & { acceptedJustifications: number };
        const statsMap = new Map<string, PromoterStatsWithAccepted>();
        
        promoters.forEach(p => {
            statsMap.set(p.id, { ...p, assigned: 0, completed: 0, justifications: 0, missed: 0, completionRate: 0, acceptedJustifications: 0 });
        });

        const now = new Date();
        const relevantAssignments = filterCampaign === 'all'
            ? assignments
            : assignments.filter(a => a.post.campaignName === filterCampaign);

        relevantAssignments.forEach(a => {
            const stat = statsMap.get(a.promoterId);
            if (stat) {
                stat.assigned++;
                if (a.proofSubmittedAt) {
                    stat.completed++;
                } else if (a.justification) {
                    stat.justifications++;
                    if (a.justificationStatus === 'accepted') {
                        stat.acceptedJustifications++;
                    } else if (a.justificationStatus === 'rejected') {
                        stat.missed++;
                    }
                } else {
                    let isMissed = false;
                    const postExpiresAt = a.post.expiresAt ? (a.post.expiresAt as Timestamp).toDate() : null;
                    const confirmedAt = a.confirmedAt ? (a.confirmedAt as Timestamp).toDate() : null;

                    if (!a.post.allowLateSubmissions) {
                         if (confirmedAt) {
                            const proofDeadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                            if (now > proofDeadline) isMissed = true;
                        } else if (postExpiresAt && now > postExpiresAt) {
                            isMissed = true;
                        }
                    }
                    if (isMissed) stat.missed++;
                }
            }
        });
        
        const finalStats = Array.from(statsMap.values()).map(stat => {
             const effectiveAssigned = stat.assigned - stat.acceptedJustifications;
             if (effectiveAssigned > 0) {
                stat.completionRate = Math.round((stat.completed / effectiveAssigned) * 100);
            } else if (stat.assigned > 0) { // All assignments were excused
                stat.completionRate = 100;
            } else { // No assignments at all
                stat.completionRate = 0;
            }
            return stat;
        }).filter(stat => stat.assigned > 0); // Only show promoters with at least one assignment

        // Search Filter
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        let searched = lowercasedQuery
            ? finalStats.filter(s => s.name.toLowerCase().includes(lowercasedQuery) || s.email.toLowerCase().includes(lowercasedQuery))
            : finalStats;

        if (colorFilter !== 'all') {
            searched = searched.filter(s => {
                const rate = s.completionRate;
                if (rate < 0) return false;
                if (colorFilter === 'green') return rate > 60;
                if (colorFilter === 'yellow') return rate > 30 && rate <= 60;
                if (colorFilter === 'red') return rate >= 0 && rate <= 30;
                return true;
            });
        }

        // Sorting
        searched.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return searched;

    }, [promoters, assignments, filterCampaign, searchQuery, sortConfig, colorFilter]);

    const requestSort = (key: SortKey) => {
        let direction: SortDirection = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        } else if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIndicator = (key: SortKey) => {
        if (sortConfig.key !== key) return '↕';
        if (sortConfig.direction === 'asc') return '↑';
        return '↓';
    };

     const handleRemovePromoter = async (promoter: Promoter) => {
        if (window.confirm(`Tem certeza que deseja remover ${promoter.name} da equipe? Esta ação mudará seu status para 'Removida', a removerá da lista de aprovadas e de todas as publicações ativas. Ela precisará fazer um novo cadastro para participar futuramente.`)) {
            setIsProcessing(promoter.id);
            setError('');
            try {
                const setPromoterStatusToRemoved = httpsCallable(functions, 'setPromoterStatusToRemoved');
                await setPromoterStatusToRemoved({ promoterId: promoter.id });
                alert(`${promoter.name} foi removida com sucesso.`);
                await fetchData(); // Refresh all data
            } catch (err: any) {
                const message = err.message || 'Falha ao remover divulgadora.';
                setError(message);
                alert(message);
            } finally {
                setIsProcessing(null);
            }
        }
    };
    
    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Desempenho de Postagens</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                 <div className="flex flex-col sm:flex-row gap-4 mb-4">
                    <select
                        value={filterCampaign}
                        onChange={e => setFilterCampaign(e.target.value)}
                        className="w-full sm:w-auto px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                    >
                        <option value="all">Todos Eventos</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input
                        type="text"
                        placeholder="Buscar por nome ou email..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full sm:flex-grow px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                    />
                 </div>
                 <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-gray-400 mb-4">
                    <div className="flex items-center gap-x-4">
                        <span className="font-semibold text-gray-300">Legenda de Aproveitamento:</span>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-400"></div><span>61% - 100%</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-400"></div><span>31% - 60%</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div><span>0% - 30%</span></div>
                    </div>
                    <div className="flex items-center gap-x-2">
                        <span className="font-semibold text-gray-300">Filtrar por Cor:</span>
                        <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                            {(['all', 'green', 'yellow', 'red'] as const).map(f => (
                                <button key={f} onClick={() => setColorFilter(f)} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${colorFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                    {f !== 'all' && <div className={`w-2.5 h-2.5 rounded-full ${f === 'green' ? 'bg-green-400' : f === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>}
                                    <span>{{'all': 'Todos', 'green': 'Verde', 'yellow': 'Amarelo', 'red': 'Vermelho'}[f]}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
                 {error && <p className="text-red-400 mb-4">{error}</p>}
                 {isLoading ? <p className="text-center py-8">Carregando estatísticas...</p> : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-700">
                            <thead className="bg-gray-700/50">
                                <tr>
                                    { (
                                        [
                                            {key: 'name', label: 'Divulgadora'},
                                            {key: 'assigned', label: 'Designadas'},
                                            {key: 'completed', label: 'Concluídas'},
                                            {key: 'justifications', label: 'Justificativas'},
                                            {key: 'missed', label: 'Perdidas'},
                                            {key: 'completionRate', label: 'Aproveitamento'},
                                        ] as {key: SortKey, label: string}[]
                                    ).map(({key, label}) => (
                                        <th key={key} onClick={() => requestSort(key)} className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer">
                                            {label} {getSortIndicator(key)}
                                        </th>
                                    ))}
                                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {processedStats.map(stat => (
                                    <tr key={stat.id} className="hover:bg-gray-700/40">
                                        <td className="px-4 py-3 whitespace-nowrap"><div className={`font-medium ${getPerformanceColor(stat.completionRate)}`}>{stat.name}</div><div className="text-xs text-gray-400">{stat.email}</div></td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center font-semibold">{stat.assigned}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center font-semibold text-green-400">{stat.completed}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center font-semibold text-yellow-400">{stat.justifications}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center font-semibold text-red-400">{stat.missed}</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-center font-bold text-blue-400">{stat.completionRate}%</td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                            <button 
                                                onClick={() => handleRemovePromoter(stat)}
                                                disabled={isProcessing === stat.id}
                                                className="text-red-400 hover:text-red-300 disabled:opacity-50"
                                            >
                                                {isProcessing === stat.id ? '...' : 'Remover da Equipe'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {processedStats.length === 0 && <p className="text-center text-gray-400 py-8">Nenhuma divulgadora encontrada com os filtros atuais.</p>}
                    </div>
                 )}
            </div>
        </div>
    );
};

export default PostDashboard;