
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAssignmentsForOrganization } from '../services/postService';
import { getAllPromoters } from '../services/promoterService';
import { getAllCampaigns } from '../services/settingsService';
import { PostAssignment, Promoter, Campaign, PromoterStats } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
// Added RefreshIcon to imports
import { ArrowLeftIcon, WhatsAppIcon, InstagramIcon, TrashIcon, FilterIcon, ClockIcon, SearchIcon, RefreshIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import PromoterFullControlModal from '../components/PromoterFullControlModal';

type SortKey = keyof Omit<PromoterStats, 'id' | 'photoUrls' | 'createdAt' | 'state' | 'campaignName' | 'associatedCampaigns' | 'allCampaigns' | 'organizationId' | 'rejectionReason' | 'hasJoinedGroup' | 'actionTakenByUid' | 'actionTakenByEmail' | 'statusChangedAt' | 'observation' | 'lastManualNotificationAt' | 'status' | 'tiktok' | 'dateOfBirth'> | 'name';
type SortDirection = 'asc' | 'desc';

const getPerformanceColor = (rate: number): string => {
    if (rate === 100) return 'text-green-400';
    if (rate >= 60) return 'text-blue-400';
    if (rate >= 31) return 'text-yellow-400';
    return 'text-red-400';
};

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const calculateTimeInGroup = (createdAt: any): string => {
    const date = toDateSafe(createdAt);
    if (!date) return '';
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Entrou hoje';
    if (diffDays === 1) return 'há 1 dia no grupo';
    return `há ${diffDays} dias no grupo`;
};

interface NumericFilter {
    min: string;
    max: string;
}

const PostDashboard: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();

    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [assignments, setAssignments] = useState<PostAssignment[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState<string | null>(null);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    const [filterCampaign, setFilterCampaign] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: 'name', direction: 'asc' });
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'blue' | 'yellow' | 'red'>('all');
    const [groupFilterStatus, setGroupFilterStatus] = useState<'all' | 'inGroup' | 'notInGroup'>('all');
    const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());
    const [showFilters, setShowFilters] = useState(false);

    // Controle do novo modal 360º
    const [selectedPromoterForControl, setSelectedPromoterForControl] = useState<Promoter | null>(null);

    const [numFilters, setNumFilters] = useState<{
        assigned: NumericFilter;
        completed: NumericFilter;
        missed: NumericFilter;
        justifications: NumericFilter;
        rate: NumericFilter;
    }>({
        assigned: { min: '', max: '' },
        completed: { min: '', max: '' },
        missed: { min: '', max: '' },
        justifications: { min: '', max: '' },
        rate: { min: '', max: '' },
    });

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
    
    useEffect(() => {
        setSelectedPromoterIds(new Set());
    }, [filterCampaign, searchQuery, colorFilter, groupFilterStatus, numFilters]);

    const handleNumFilterChange = (category: keyof typeof numFilters, type: 'min' | 'max', value: string) => {
        setNumFilters(prev => ({
            ...prev,
            [category]: { ...prev[category], [type]: value }
        }));
    };

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
                } else if (a.justificationStatus === 'accepted') {
                    stat.justifications++;
                    stat.acceptedJustifications++;
                } else if (a.justificationStatus === 'rejected') {
                    stat.justifications++;
                    stat.missed++;
                } else if (a.justificationStatus === 'pending' || a.justification) {
                    stat.justifications++;
                } else {
                    let isMissed = false;
                    const postExpiresAt = toDateSafe(a.post.expiresAt);
                    const confirmedAt = toDateSafe(a.confirmedAt);

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
        
        let finalStats = Array.from(statsMap.values()).map(stat => {
            const successfulOutcomes = stat.completed + stat.acceptedJustifications;
            if (stat.assigned > 0) {
               stat.completionRate = Math.round((successfulOutcomes / stat.assigned) * 100);
           } else {
               stat.completionRate = 0;
           }
            return stat;
        }).filter(stat => stat.assigned > 0);

        if (groupFilterStatus === 'inGroup') {
            finalStats = finalStats.filter(s => s.hasJoinedGroup === true);
        } else if (groupFilterStatus === 'notInGroup') {
            finalStats = finalStats.filter(s => s.hasJoinedGroup !== true);
        }

        const lowercasedQuery = searchQuery.toLowerCase().trim();
        if (lowercasedQuery) {
            finalStats = finalStats.filter(s => s.name.toLowerCase().includes(lowercasedQuery) || s.email.toLowerCase().includes(lowercasedQuery));
        }

        if (colorFilter !== 'all') {
            finalStats = finalStats.filter(s => {
                const rate = s.completionRate;
                if (rate < 0) return false;
                if (colorFilter === 'green') return rate === 100;
                if (colorFilter === 'blue') return rate >= 60 && rate < 100;
                if (colorFilter === 'yellow') return rate >= 31 && rate < 60;
                if (colorFilter === 'red') return rate >= 0 && rate <= 30;
                return true;
            });
        }

        const checkRange = (val: number, minStr: string, maxStr: string) => {
            const min = minStr !== '' ? parseInt(minStr, 10) : -Infinity;
            const max = maxStr !== '' ? parseInt(maxStr, 10) : Infinity;
            return val >= min && val <= max;
        };

        finalStats = finalStats.filter(s => {
            if (!checkRange(s.assigned, numFilters.assigned.min, numFilters.assigned.max)) return false;
            if (!checkRange(s.completed, numFilters.completed.min, numFilters.completed.max)) return false;
            if (!checkRange(s.missed, numFilters.missed.min, numFilters.missed.max)) return false;
            if (!checkRange(s.justifications, numFilters.justifications.min, numFilters.justifications.max)) return false;
            if (!checkRange(s.completionRate, numFilters.rate.min, numFilters.rate.max)) return false;
            return true;
        });

        const currentSort = sortConfig || { key: 'name', direction: 'asc' };
        finalStats.sort((a, b) => {
            const key = currentSort.key;
            const valA = (a as any)[key] ?? 0;
            const valB = (b as any)[key] ?? 0;

            if (valA < valB) {
                return currentSort.direction === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return currentSort.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return finalStats;

    }, [promoters, assignments, filterCampaign, searchQuery, sortConfig, colorFilter, groupFilterStatus, numFilters]);

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

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = processedStats.map(s => s.id);
            setSelectedPromoterIds(new Set(allIds));
        } else {
            setSelectedPromoterIds(new Set());
        }
    };

    const handleToggleSelect = (id: string) => {
        setSelectedPromoterIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleBulkRemove = async () => {
        if (selectedPromoterIds.size === 0) return;
        if (!window.confirm(`Tem certeza que deseja remover ${selectedPromoterIds.size} divulgadoras da equipe? Esta ação é irreversível.`)) return;

        setIsBulkProcessing(true);
        try {
            const setPromoterStatusToRemoved = httpsCallable(functions, 'setPromoterStatusToRemoved');
            const promises = Array.from(selectedPromoterIds).map(id => setPromoterStatusToRemoved({ promoterId: id }));
            await Promise.all(promises);
            
            alert(`${selectedPromoterIds.size} divulgadoras foram removidas com sucesso.`);
            setSelectedPromoterIds(new Set());
            await fetchData();
        } catch (err: any) {
            console.error(err);
            alert('Erro ao remover algumas divulgadoras. Atualize a página e tente novamente.');
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleOpenControl = (promoter: Promoter) => {
        setSelectedPromoterForControl(promoter);
    };
    
    return (
        <div className="pb-40">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Desempenho da Equipe</h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-500 text-[10px] font-black uppercase tracking-widest transition-all">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>

            <div className="bg-secondary/60 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/5 shadow-2xl space-y-6">
                 <div className="flex flex-col gap-4">
                    <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
                        <div className="flex flex-col sm:flex-row gap-3 w-full">
                            <select
                                value={filterCampaign}
                                onChange={e => setFilterCampaign(e.target.value)}
                                className="w-full sm:w-auto px-4 py-3 border border-gray-700 rounded-2xl bg-dark text-white font-black text-[10px] uppercase outline-none focus:border-primary"
                            >
                                <option value="all">TODOS EVENTOS</option>
                                {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                            </select>
                            <div className="relative flex-grow">
                                <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <input
                                    type="text"
                                    placeholder="BUSCAR POR NOME OU E-MAIL..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-[10px] font-black uppercase outline-none focus:border-primary"
                                />
                            </div>
                        </div>
                        <button 
                            onClick={() => setShowFilters(!showFilters)}
                            className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${showFilters ? 'bg-primary text-white shadow-xl' : 'bg-gray-800 text-gray-400 hover:text-white border border-white/5'}`}
                        >
                            <FilterIcon className="w-4 h-4" />
                            Filtros
                        </button>
                    </div>

                    <div className="flex items-center gap-4 flex-wrap px-1">
                        <label className="flex items-center space-x-2 text-[10px] font-black uppercase text-gray-400 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={groupFilterStatus === 'inGroup'}
                                onChange={(e) => setGroupFilterStatus(e.target.checked ? 'inGroup' : 'all')}
                                className="h-4 w-4 text-primary bg-dark border-gray-700 rounded focus:ring-primary"
                            />
                            <span className="group-hover:text-white transition-colors">Apenas no grupo</span>
                        </label>
                        <label className="flex items-center space-x-2 text-[10px] font-black uppercase text-gray-400 cursor-pointer group">
                            <input
                                type="checkbox"
                                checked={groupFilterStatus === 'notInGroup'}
                                onChange={(e) => setGroupFilterStatus(e.target.checked ? 'notInGroup' : 'all')}
                                className="h-4 w-4 text-primary bg-dark border-gray-700 rounded focus:ring-primary"
                            />
                            <span className="group-hover:text-white transition-colors">Apenas fora do grupo</span>
                        </label>
                    </div>

                    {showFilters && (
                        <div className="p-6 bg-dark/40 rounded-[2rem] border border-white/5 grid grid-cols-2 md:grid-cols-5 gap-6 animate-slideDown shadow-inner">
                             <div>
                                <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">Designadas</label>
                                <div className="flex gap-2">
                                    <input type="number" placeholder="MIN" value={numFilters.assigned.min} onChange={e => handleNumFilterChange('assigned', 'min', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                    <input type="number" placeholder="MAX" value={numFilters.assigned.max} onChange={e => handleNumFilterChange('assigned', 'max', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">Concluídas</label>
                                <div className="flex gap-2">
                                    <input type="number" placeholder="MIN" value={numFilters.completed.min} onChange={e => handleNumFilterChange('completed', 'min', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                    <input type="number" placeholder="MAX" value={numFilters.completed.max} onChange={e => handleNumFilterChange('completed', 'max', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">Justificativas</label>
                                <div className="flex gap-2">
                                    <input type="number" placeholder="MIN" value={numFilters.justifications.min} onChange={e => handleNumFilterChange('justifications', 'min', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                    <input type="number" placeholder="MAX" value={numFilters.justifications.max} onChange={e => handleNumFilterChange('justifications', 'max', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">Perdidas</label>
                                <div className="flex gap-2">
                                    <input type="number" placeholder="MIN" value={numFilters.missed.min} onChange={e => handleNumFilterChange('missed', 'min', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                    <input type="number" placeholder="MAX" value={numFilters.missed.max} onChange={e => handleNumFilterChange('missed', 'max', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[8px] font-black text-gray-500 uppercase tracking-widest mb-2">Aproveitamento (%)</label>
                                <div className="flex gap-2">
                                    <input type="number" placeholder="MIN" value={numFilters.rate.min} onChange={e => handleNumFilterChange('rate', 'min', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                    <input type="number" placeholder="MAX" value={numFilters.rate.max} onChange={e => handleNumFilterChange('rate', 'max', e.target.value)} className="w-full px-3 py-2 text-xs bg-dark border border-gray-700 rounded-xl text-white outline-none focus:border-primary"/>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>

                 {selectedPromoterIds.size > 0 && (
                    <div className="sticky top-2 z-20 bg-primary/95 backdrop-blur-md border border-white/20 text-white p-4 rounded-3xl shadow-2xl flex items-center justify-between gap-4 mb-4 animate-fadeIn">
                        <div className="font-black uppercase text-[10px] tracking-widest">{selectedPromoterIds.size} selecionadas</div>
                        <div className="flex gap-3">
                            <button onClick={() => setSelectedPromoterIds(new Set())} className="px-4 py-2 text-[10px] font-black uppercase hover:text-white/70 transition-colors">Cancelar</button>
                            <button onClick={handleBulkRemove} disabled={isBulkProcessing} className="px-6 py-2 bg-red-600 hover:bg-red-500 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg">
                                <TrashIcon className="w-4 h-4"/> {isBulkProcessing ? 'REMOVENDO...' : 'EXCLUIR DA EQUIPE'}
                            </button>
                        </div>
                    </div>
                 )}

                 {error && <p className="text-red-400 bg-red-900/20 p-4 rounded-2xl border border-red-900/50 mb-4 text-[10px] font-black uppercase">{error}</p>}
                 
                 {isLoading ? (
                    <div className="py-20 flex flex-col items-center gap-4">
                        <RefreshIcon className="w-12 h-12 text-primary animate-spin" />
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando estatísticas...</p>
                    </div>
                 ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-white/5 border-separate border-spacing-0">
                            <thead className="bg-dark/50">
                                <tr>
                                    <th className="px-4 py-5 w-10 text-center">
                                        <input 
                                            type="checkbox" 
                                            onChange={handleSelectAll} 
                                            checked={processedStats.length > 0 && selectedPromoterIds.size === processedStats.length}
                                            className="rounded border-gray-700 bg-dark text-primary focus:ring-0"
                                        />
                                    </th>
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
                                        <th key={key} onClick={() => requestSort(key)} className="px-4 py-5 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest cursor-pointer hover:text-white transition-colors">
                                            <div className="flex items-center gap-1.5">
                                                {label} <span className="text-primary/50 font-normal">{getSortIndicator(key)}</span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {processedStats.map(stat => (
                                    <tr 
                                        key={stat.id} 
                                        onClick={() => handleOpenControl(stat)}
                                        className={`hover:bg-white/[0.03] transition-all cursor-pointer group ${selectedPromoterIds.has(stat.id) ? 'bg-primary/5' : ''}`}
                                    >
                                        <td className="px-4 py-5 text-center" onClick={e => e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedPromoterIds.has(stat.id)} 
                                                onChange={() => handleToggleSelect(stat.id)}
                                                className="rounded border-gray-700 bg-dark text-primary focus:ring-0"
                                            />
                                        </td>
                                        <td className="px-4 py-5 whitespace-nowrap">
                                            <div className="flex items-center gap-4">
                                                <img src={stat.facePhotoUrl || stat.photoUrls[0]} className="w-10 h-10 rounded-xl object-cover border border-white/5 shadow-md group-hover:scale-105 transition-transform" alt="" />
                                                <div>
                                                    <div className="font-black text-white uppercase text-sm group-hover:text-primary transition-colors">{stat.name}</div>
                                                    <div className="flex items-center gap-3 mt-1.5">
                                                        <a href={`https://wa.me/55${(stat.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-green-500/70 hover:text-green-400 transition-colors">
                                                            <WhatsAppIcon className="w-3.5 h-3.5" />
                                                        </a>
                                                        <a href={`https://instagram.com/${(stat.instagram || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-pink-500/70 hover:text-pink-400 transition-colors">
                                                            <InstagramIcon className="w-3.5 h-3.5" />
                                                        </a>
                                                        <div className="text-[9px] text-gray-600 font-bold uppercase flex items-center gap-1">
                                                            <ClockIcon className="w-3 h-3" />
                                                            {calculateTimeInGroup(stat.createdAt)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-5 whitespace-nowrap text-xs font-black text-white">{stat.assigned}</td>
                                        <td className="px-4 py-5 whitespace-nowrap text-xs font-black text-green-400">{stat.completed}</td>
                                        <td className="px-4 py-5 whitespace-nowrap text-xs font-black text-yellow-400">{stat.justifications}</td>
                                        <td className="px-4 py-5 whitespace-nowrap text-xs font-black text-red-400">{stat.missed}</td>
                                        <td className="px-4 py-5 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="w-8 bg-dark h-1 rounded-full overflow-hidden">
                                                    <div className={`h-full ${getPerformanceColor(stat.completionRate).replace('text-', 'bg-')}`} style={{ width: `${stat.completionRate}%` }}></div>
                                                </div>
                                                <span className={`font-black text-xs ${getPerformanceColor(stat.completionRate)}`}>{stat.completionRate}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {processedStats.length === 0 && <p className="text-center text-gray-600 py-20 font-black uppercase text-[10px] tracking-widest italic">Nenhuma divulgadora encontrada.</p>}
                    </div>
                 )}
            </div>

            {/* MODAL COM CONTROLE COMPLETO */}
            <PromoterFullControlModal 
                isOpen={!!selectedPromoterForControl} 
                onClose={() => setSelectedPromoterForControl(null)} 
                promoter={selectedPromoterForControl} 
                onDataUpdated={fetchData}
            />
        </div>
    );
};

export default PostDashboard;
