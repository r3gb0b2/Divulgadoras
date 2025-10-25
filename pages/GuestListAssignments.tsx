import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { GuestList, Promoter, PostAssignment } from '../types';
import { getGuestListById, updateGuestList } from '../services/guestListService';
import { getApprovedPromoters } from '../services/promoterService';
import { getAssignmentsForOrganization } from '../services/postService';
import { ArrowLeftIcon, SearchIcon } from '../components/Icons';

const getPerformanceColor = (rate: number): string => {
    if (rate < 0) return 'text-gray-300';
    if (rate > 60) return 'text-green-400';
    if (rate > 30) return 'text-yellow-400';
    return 'text-red-400';
};

const GuestListAssignments: React.FC = () => {
    const { listId } = useParams<{ listId: string }>();
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    const [list, setList] = useState<GuestList | null>(null);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [postAssignments, setPostAssignments] = useState<PostAssignment[]>([]);
    const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'yellow' | 'red'>('all');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        if (!listId || !adminData) return;
        setIsLoading(true);
        setError(null);
        try {
            const listData = await getGuestListById(listId);
            if (!listData) throw new Error("Lista de convidados não encontrada.");
            
            const [approvedPromoters, orgAssignments] = await Promise.all([
                getApprovedPromoters(listData.organizationId, listData.campaignName, listData.campaignName),
                getAssignmentsForOrganization(listData.organizationId)
            ]);

            setList(listData);
            approvedPromoters.sort((a, b) => (a.instagram || a.name).localeCompare(b.instagram || b.name));
            setPromoters(approvedPromoters);
            setPostAssignments(orgAssignments);
            setAssignedIds(new Set(listData.assignedPromoterIds || []));

        } catch (err: any) {
            setError(err.message || "Falha ao carregar dados.");
        } finally {
            setIsLoading(false);
        }
    }, [listId, adminData]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const promotersWithStats = useMemo(() => {
        if (postAssignments.length === 0) {
            return promoters.map(p => ({ ...p, completionRate: -1 }));
        }
        const statsMap = new Map<string, { assigned: number; completed: number }>();
        postAssignments.forEach(a => {
            const stat = statsMap.get(a.promoterId) || { assigned: 0, completed: 0 };
            stat.assigned++;
            if (a.proofSubmittedAt) stat.completed++;
            statsMap.set(a.promoterId, stat);
        });
        return promoters.map(p => {
            const stats = statsMap.get(p.id);
            const completionRate = stats && stats.assigned > 0
                ? Math.round((stats.completed / stats.assigned) * 100)
                : -1;
            return { ...p, completionRate };
        });
    }, [promoters, postAssignments]);
    
    const filteredPromoters = useMemo(() => {
        let results = promotersWithStats;
        if (searchQuery.trim()) {
            const lowerQuery = searchQuery.toLowerCase();
            results = results.filter(p => p.name.toLowerCase().includes(lowerQuery) || (p.instagram && p.instagram.toLowerCase().includes(lowerQuery)));
        }
        if (colorFilter !== 'all') {
            results = results.filter(p => {
                const rate = p.completionRate;
                if (rate < 0) return false;
                if (colorFilter === 'green') return rate > 60;
                if (colorFilter === 'yellow') return rate > 30 && rate <= 60;
                if (colorFilter === 'red') return rate >= 0 && rate <= 30;
                return true;
            });
        }
        return results;
    }, [promotersWithStats, searchQuery, colorFilter]);

    const handleToggle = (promoterId: string) => {
        setAssignedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(promoterId)) {
                newSet.delete(promoterId);
            } else {
                newSet.add(promoterId);
            }
            return newSet;
        });
    };

    const handleToggleAll = () => {
        const promoterIds = new Set(filteredPromoters.map(p => p.id));
        const areAllSelected = filteredPromoters.every(p => assignedIds.has(p.id));

        setAssignedIds(prev => {
            const newSet = new Set(prev);
            if (areAllSelected) {
                promoterIds.forEach(id => newSet.delete(id));
            } else {
                promoterIds.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    };

    const handleSave = async () => {
        if (!listId) return;
        setIsSaving(true);
        setError(null);
        try {
            await updateGuestList(listId, { assignedPromoterIds: Array.from(assignedIds) });
            alert("Atribuições salvas com sucesso!");
            navigate('/admin/lists');
        } catch (err: any) {
            setError(err.message || "Falha ao salvar.");
        } finally {
            setIsSaving(false);
        }
    };

    const renderContent = () => {
        if (isLoading) {
            return <div className="flex justify-center items-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
        }
        if (error) {
            return <p className="text-red-400 text-center">{error}</p>;
        }
        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-gray-400">
                        <span className="font-semibold text-gray-300">Aproveitamento:</span>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-400"></div><span>&gt;60%</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-400"></div><span>31-60%</span></div>
                        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div><span>&lt;31%</span></div>
                    </div>
                    <div className="flex items-center gap-x-2">
                        <span className="font-semibold text-gray-300 text-xs">Filtrar:</span>
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
                <div className="relative">
                     <span className="absolute inset-y-0 left-0 flex items-center pl-3"><SearchIcon className="h-5 w-5 text-gray-400" /></span>
                    <input type="text" placeholder="Buscar por nome ou @..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"/>
                </div>
                <div className="border border-gray-700 rounded-lg p-2 max-h-[50vh] overflow-y-auto">
                    {filteredPromoters.length > 0 ? (
                        <>
                            <label className="flex items-center space-x-2 p-2 font-semibold cursor-pointer">
                                <input type="checkbox" onChange={handleToggleAll} checked={filteredPromoters.length > 0 && filteredPromoters.every(p => assignedIds.has(p.id))} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                <span>Marcar/Desmarcar Todos Visíveis ({assignedIds.size} selecionadas)</span>
                            </label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1">
                                {filteredPromoters.map(p => (
                                    <label key={p.id} className="flex items-center space-x-2 p-2 rounded hover:bg-gray-800/50 cursor-pointer">
                                        <input type="checkbox" checked={assignedIds.has(p.id)} onChange={() => handleToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                        <span className={`truncate text-sm font-semibold ${getPerformanceColor(p.completionRate)}`} title={p.name}>{p.instagram || p.name}</span>
                                    </label>
                                ))}
                            </div>
                        </>
                    ) : (
                        <p className="text-gray-400 text-center p-6">Nenhuma divulgadora encontrada.</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
                <div>
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
                    <h1 className="text-3xl font-bold mt-1">Atribuir Divulgadoras</h1>
                    <p className="text-primary font-semibold">{list?.name || 'Carregando...'} para {list?.campaignName}</p>
                </div>
            </div>
            <div className="bg-secondary shadow-lg rounded-lg p-6">
                {renderContent()}
                <div className="mt-6 border-t border-gray-700 pt-4 flex justify-end">
                    <button onClick={handleSave} disabled={isSaving || isLoading} className="px-6 py-2 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Atribuições'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GuestListAssignments;