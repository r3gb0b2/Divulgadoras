import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  getAllPromoters, 
  getPromoterStats, 
  updatePromoter, 
  deletePromoter, 
  getRejectionReasons, 
  findPromotersByEmail 
} from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { 
  Promoter, AdminUserData, PromoterStatus, 
  RejectionReason, Organization, Campaign, Timestamp 
} from '../types';
import { 
  SearchIcon, FilterIcon, CheckCircleIcon, XIcon, 
  InstagramIcon, WhatsAppIcon, CameraIcon, TrashIcon, 
  PencilIcon, RefreshIcon, ArrowLeftIcon, FaceIdIcon, ClockIcon 
} from '../components/Icons';
import { stateMap, states } from '../constants/states';
import { useAdminAuth } from '../contexts/AdminAuthContext';

// Modais
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import EditPromoterModal from '../components/EditPromoterModal';
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import PromoterLookupModal from '../components/PromoterLookupModal';

const calculateAge = (dob: string): number => {
    if (!dob) return 0;
    const birth = new Date(dob);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
        age--;
    }
    return age;
};

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    const isFetching = useRef(false);
    const lastFetchHash = useRef('');
    
    // Dados Principais
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [orgsMap, setOrgsMap] = useState<Record<string, string>>({});

    // Seleção em Massa
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);

    // Estado da UI
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [filterState, setFilterState] = useState('all');
    const [filterStatus, setFilterStatus] = useState<PromoterStatus | 'all'>('pending');
    const [selectedCampaign, setSelectedCampaign] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Filtros de Idade
    const [minAge, setMinAge] = useState<string>('');
    const [maxAge, setMaxAge] = useState<string>('');

    // Busca por E-mail
    const [lookupEmail, setLookupEmail] = useState('');
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);

    // Controle de Modais de Ação
    const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [photoViewer, setPhotoViewer] = useState<{ isOpen: boolean, urls: string[], index: number }>({ 
        isOpen: false, urls: [], index: 0 
    });

    const isSuperAdmin = adminData.role === 'superadmin';

    // ESTABILIZAÇÃO CRÍTICA: Strings para evitar loop infinito
    const assignedStatesKey = adminData.assignedStates?.join(',') || '';
    const assignedCampaignsKey = JSON.stringify(adminData.assignedCampaigns || {});

    const fetchData = useCallback(async (force = false) => {
        const orgId = isSuperAdmin ? undefined : selectedOrgId;
        
        // Bloqueio de redundância
        const currentHash = `${orgId}-${filterStatus}-${filterState}-${selectedCampaign}-${assignedStatesKey}`;
        if (!force && lastFetchHash.current === currentHash) return;
        if (isFetching.current) return;
        
        if (!isSuperAdmin && !orgId) {
            setIsLoading(false);
            return;
        }

        isFetching.current = true;
        setIsLoading(true);
        setError('');
        
        try {
            const options = {
                organizationId: orgId,
                status: filterStatus,
                filterState: filterState,
                selectedCampaign: selectedCampaign,
                statesForScope: adminData.assignedStates,
                assignedCampaignsForScope: adminData.assignedCampaigns,
                limitCount: 30 
            };

            const [promoterData, statsData, camps, reasons, allOrgs] = await Promise.all([
                getAllPromoters(options),
                getPromoterStats(options),
                getAllCampaigns(orgId),
                orgId ? getRejectionReasons(orgId) : Promise.resolve([]),
                isSuperAdmin ? getOrganizations() : Promise.resolve([])
            ]);

            setPromoters(promoterData);
            setStats(statsData);
            setCampaigns(camps);
            setRejectionReasons(reasons);
            setSelectedIds(new Set()); 
            lastFetchHash.current = currentHash;
            
            if (isSuperAdmin) {
                const map = (allOrgs as Organization[]).reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
                setOrgsMap(map);
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
            isFetching.current = false;
        }
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign, isSuperAdmin, assignedStatesKey, assignedCampaignsKey]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // HANDLER DE APROVAÇÃO OTIMISTA (SEM DELAY E SEM RECARREGAR)
    const handleApprove = async (p: Promoter) => {
        if (!window.confirm(`Aprovar ${p.name}?`)) return;

        // 1. Atualiza estado local imediatamente (Optimistic Update)
        setPromoters(prev => prev.filter(item => item.id !== p.id));
        setStats(prev => ({ 
            ...prev, 
            pending: Math.max(0, prev.pending - 1), 
            approved: prev.approved + 1 
        }));

        try {
            // 2. Envia para o servidor em background
            await updatePromoter(p.id, { status: 'approved' });
        } catch (err: any) {
            // 3. Rollback silencioso apenas em erro crítico (opcional: alertar usuário)
            console.error("Erro ao aprovar no servidor:", err);
            fetchData(true); 
        }
    };

    // HANDLER DE REJEIÇÃO OTIMISTA
    const handleRejectConfirm = async (reason: string, allowEdit: boolean) => {
        const idsToProcess = selectedPromoter ? [selectedPromoter.id] : Array.from(selectedIds);
        if (idsToProcess.length === 0) return;

        // 1. Esconde modal e atualiza local imediatamente
        setIsRejectionModalOpen(false);
        const statusToSet: PromoterStatus = allowEdit ? 'rejected_editable' : 'rejected';
        
        setPromoters(prev => prev.filter(p => !idsToProcess.includes(p.id)));
        setStats(prev => ({
            ...prev,
            pending: Math.max(0, prev.pending - idsToProcess.length),
            rejected: prev.rejected + idsToProcess.length
        }));
        setSelectedIds(new Set());
        setSelectedPromoter(null);

        try {
            // 2. Processa no servidor em background
            for (const id of idsToProcess) {
                updatePromoter(id, { 
                    status: statusToSet, 
                    rejectionReason: reason 
                });
            }
        } catch (err: any) {
            console.error("Erro ao rejeitar no servidor:", err);
            fetchData(true);
        }
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Aprovar ${selectedIds.size} selecionadas?`)) return;

        const idsToProcess = Array.from(selectedIds);

        // Atualização Otimista
        setPromoters(prev => prev.filter(p => !idsToProcess.includes(p.id)));
        setStats(prev => ({
            ...prev,
            pending: Math.max(0, prev.pending - idsToProcess.length),
            approved: prev.approved + idsToProcess.length
        }));
        setSelectedIds(new Set());

        try {
            for (const id of idsToProcess) {
                updatePromoter(id, { status: 'approved' });
            }
        } catch (err: any) {
            fetchData(true);
        }
    };

    const handleLookup = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!lookupEmail.trim()) return;
        setIsLookingUp(true);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(lookupEmail);
            setLookupResults(results);
        // FIX: Add explicit any type to err to fix 'unknown' type assignability error.
        } catch (err: any) { alert("Erro na busca."); } finally { setIsLookingUp(false); }
    };

    const filteredPromoters = useMemo(() => {
        let list = promoters;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => 
                p.name.toLowerCase().includes(q) || 
                p.instagram.toLowerCase().includes(q) || 
                p.email.toLowerCase().includes(q)
            );
        }
        if (minAge || maxAge) {
            list = list.filter(p => {
                const age = calculateAge(p.dateOfBirth);
                const min = minAge ? parseInt(minAge) : 0;
                const max = maxAge ? parseInt(maxAge) : 999;
                return age >= min && age <= max;
            });
        }
        return list;
    }, [promoters, searchQuery, minAge, maxAge]);

    const availableStates = useMemo(() => {
        if (isSuperAdmin) return states;
        if (!adminData.assignedStates || adminData.assignedStates.length === 0) return states;
        return states.filter(s => adminData.assignedStates?.includes(s.abbr));
    }, [isSuperAdmin, adminData.assignedStates]);

    const statusBadge = (status: PromoterStatus) => {
        const config = {
            pending: { label: "Pendente", style: "bg-blue-900/40 text-blue-400 border-blue-800" },
            approved: { label: "Aprovada", style: "bg-green-900/40 text-green-400 border-green-800" },
            rejected: { label: "Rejeitada", style: "bg-red-900/40 text-red-400 border-red-800" },
            rejected_editable: { label: "Corrigir", style: "bg-orange-900/40 text-orange-400 border-orange-800" },
            removed: { label: "Removida", style: "bg-gray-800 text-gray-500 border-gray-700" }
        };
        const c = config[status] || config.pending;
        return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border whitespace-nowrap ${c.style}`}>{c.label}</span>;
    };

    const toggleSelect = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredPromoters.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredPromoters.map(p => p.id)));
        }
    };

    return (
        <div className="space-y-6 pb-40 max-w-full overflow-x-hidden">
            {/* Header com Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
                <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Divulgadoras</h1>
                <div className="flex flex-wrap gap-2">
                    <div className="px-3 py-1.5 bg-secondary border border-gray-700 rounded-xl text-center min-w-[70px]">
                        <p className="text-[8px] font-black text-gray-500 uppercase">Total</p>
                        <p className="text-base font-black text-white">{stats.total}</p>
                    </div>
                    <div className="px-3 py-1.5 bg-secondary border border-gray-700 rounded-xl text-center min-w-[70px]">
                        <p className="text-[8px] font-black text-gray-500 uppercase">Pendentes</p>
                        <p className="text-base font-black text-blue-400">{stats.pending}</p>
                    </div>
                </div>
            </div>

            {/* Filtros */}
            <div className="bg-secondary p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-white/5 shadow-xl space-y-4 mx-2 md:mx-0">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Pesquisar..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>
                    
                    <div className="flex gap-2 items-center md:col-span-1">
                         <input 
                            type="number" 
                            placeholder="Min" 
                            value={minAge}
                            onChange={e => setMinAge(e.target.value)}
                            className="w-full px-3 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                        <input 
                            type="number" 
                            placeholder="Max" 
                            value={maxAge}
                            onChange={e => setMaxAge(e.target.value)}
                            className="w-full px-3 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                    </div>

                    <form onSubmit={handleLookup} className="flex gap-2 md:col-span-2">
                         <input 
                            type="email" 
                            placeholder="Localizar e-mail..." 
                            value={lookupEmail}
                            onChange={e => setLookupEmail(e.target.value)}
                            className="flex-grow px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                        <button type="submit" className="px-4 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-colors">
                            <SearchIcon className="w-4 h-4" />
                        </button>
                    </form>

                    <button onClick={() => fetchData(true)} className="flex items-center justify-center gap-2 py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700 transition-colors font-black text-[10px] uppercase tracking-widest">
                        <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="flex-1 sm:flex-none bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="pending">⏳ Pendentes</option>
                        <option value="approved">✅ Aprovadas</option>
                        <option value="rejected">❌ Rejeitadas</option>
                        <option value="rejected_editable">⚠️ Corrigir</option>
                        <option value="all">🌐 Ver Tudo</option>
                    </select>

                    <select value={filterState} onChange={e => setFilterState(e.target.value)} className="flex-1 sm:flex-none bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="all">Todos Estados</option>
                        {availableStates.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                    </select>

                    <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="w-full sm:w-auto bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="all">Todas Campanhas</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            {/* Ação em Massa */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-primary text-white px-5 py-4 rounded-3xl shadow-2xl flex items-center gap-4 animate-slideUp border border-white/20 w-[90%] md:w-auto">
                    <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{selectedIds.size} selecionadas</span>
                    <div className="h-6 w-[1px] bg-white/20"></div>
                    <div className="flex gap-2 flex-grow justify-end">
                        <button onClick={handleBulkApprove} className="p-2 bg-green-500 rounded-xl hover:bg-green-400 transition-all active:scale-95"><CheckCircleIcon className="w-5 h-5" /></button>
                        <button onClick={() => { setSelectedPromoter(null); setIsRejectionModalOpen(true); }} className="p-2 bg-red-500 rounded-xl hover:bg-red-400 transition-all active:scale-95"><XIcon className="w-5 h-5" /></button>
                        <button onClick={() => setSelectedIds(new Set())} className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all"><RefreshIcon className="w-5 h-5" /></button>
                    </div>
                </div>
            )}

            {/* Lista Principal */}
            <div className="bg-secondary rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden mx-2 md:mx-0">
                {isLoading && promoters.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando banco de dados...</p>
                    </div>
                ) : filteredPromoters.length === 0 ? (
                    <div className="p-20 text-center text-gray-500 font-bold uppercase tracking-widest flex flex-col items-center gap-4">
                         <SearchIcon className="w-12 h-12 opacity-20" />
                         <span>Nenhum registro encontrado</span>
                    </div>
                ) : (
                    <>
                        {/* VIEW DESKTOP */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input type="checkbox" checked={selectedIds.size === filteredPromoters.length && filteredPromoters.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary" />
                                        </th>
                                        <th className="px-6 py-5">Perfil</th>
                                        <th className="px-6 py-5">Redes Sociais</th>
                                        <th className="px-6 py-5">Evento</th>
                                        <th className="px-6 py-5">Status</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredPromoters.map(p => {
                                        const age = calculateAge(p.dateOfBirth);
                                        return (
                                            <tr key={p.id} className={`hover:bg-white/[0.02] transition-colors group ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5">
                                                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary" />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-5">
                                                        <div className="relative w-16 h-16 rounded-2xl overflow-hidden cursor-pointer border-2 border-gray-700 group-hover:border-primary transition-all flex-shrink-0" onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls, index: 0 })}>
                                                            <img src={p.facePhotoUrl || p.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                                                            <div className="absolute top-0.5 right-0.5 px-1 py-0.5 bg-black/60 rounded-lg"><span className="text-[8px] font-black text-white">{age}a</span></div>
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <p className="text-white font-black text-sm truncate uppercase tracking-tight">{p.name}</p>
                                                            <p className="text-gray-500 text-[10px] truncate font-mono">{p.email}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="p-2 bg-pink-500/10 text-pink-500 rounded-xl hover:bg-pink-500 hover:text-white transition-all"><InstagramIcon className="w-4 h-4" /></a>
                                                        <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="p-2 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all"><WhatsAppIcon className="w-4 h-4" /></a>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-gray-300 font-bold text-[10px] uppercase truncate max-w-[120px]">{p.campaignName || 'Geral'}</td>
                                                <td className="px-6 py-5">{statusBadge(p.status)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                        {p.status === 'pending' && <button onClick={() => handleApprove(p)} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all"><CheckCircleIcon className="w-4 h-4" /></button>}
                                                        {(p.status === 'pending' || p.status === 'approved') && <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-all"><XIcon className="w-4 h-4" /></button>}
                                                        <button onClick={() => { setSelectedPromoter(p); setIsEditModalOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-all"><PencilIcon className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* VIEW MOBILE */}
                        <div className="md:hidden divide-y divide-white/5">
                            <div className="p-4 bg-dark/20 flex justify-between items-center">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" checked={selectedIds.size === filteredPromoters.length && filteredPromoters.length > 0} onChange={toggleSelectAll} className="w-5 h-5 rounded border-gray-700 bg-dark text-primary focus:ring-primary" />
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Selecionar Todas</span>
                                </label>
                            </div>
                            {filteredPromoters.map(p => {
                                const age = calculateAge(p.dateOfBirth);
                                return (
                                    <div key={p.id} className={`p-4 transition-colors ${selectedIds.has(p.id) ? 'bg-primary/10' : ''} max-w-full overflow-hidden`}>
                                        <div className="flex gap-4">
                                            <div className="flex flex-col gap-3 items-center">
                                                <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="w-6 h-6 rounded border-gray-600 bg-dark text-primary" />
                                                <div className="w-12 h-12 rounded-xl overflow-hidden border-2 border-gray-700" onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls, index: 0 })}>
                                                    <img src={p.facePhotoUrl || p.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            </div>
                                            <div className="flex-grow min-w-0">
                                                <div className="flex justify-between items-start gap-2">
                                                    <p className="text-white font-black text-sm truncate uppercase tracking-tight leading-tight">{p.name}</p>
                                                    <div className="flex-shrink-0">{statusBadge(p.status)}</div>
                                                </div>
                                                <p className="text-gray-500 text-[9px] font-mono mt-0.5 truncate">{p.email}</p>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                                                    <span className="text-[9px] font-black text-primary uppercase">{p.state} • {age} anos</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-2 mt-4 overflow-hidden">
                                            <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center justify-center p-3 bg-green-600/20 text-green-500 rounded-2xl border border-green-600/30"><WhatsAppIcon className="w-5 h-5" /></a>
                                            <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center justify-center p-3 bg-pink-600/20 text-pink-500 rounded-2xl border border-pink-600/30"><InstagramIcon className="w-5 h-5" /></a>
                                            
                                            {p.status === 'pending' ? (
                                                <>
                                                    <button onClick={() => handleApprove(p)} className="flex-1 min-w-0 flex items-center justify-center p-3 bg-green-600 text-white rounded-2xl shadow-lg"><CheckCircleIcon className="w-5 h-5" /></button>
                                                    <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="flex-1 min-w-0 flex items-center justify-center p-3 bg-red-600 text-white rounded-2xl shadow-lg"><XIcon className="w-5 h-5" /></button>
                                                </>
                                            ) : (
                                                <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="flex-1 min-w-0 flex items-center justify-center p-3 bg-red-600/20 text-red-500 rounded-2xl border border-red-600/30"><TrashIcon className="w-5 h-5" /></button>
                                            )}
                                            
                                            <button onClick={() => { setSelectedPromoter(p); setIsEditModalOpen(true); }} className="flex-1 min-w-0 flex items-center justify-center p-3 bg-gray-700 text-gray-300 rounded-2xl"><PencilIcon className="w-5 h-5" /></button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Modais */}
            <PhotoViewerModal isOpen={photoViewer.isOpen} imageUrls={photoViewer.urls} startIndex={photoViewer.index} onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => setIsRejectionModalOpen(false)} onConfirm={handleRejectConfirm} reasons={rejectionReasons} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} promoter={selectedPromoter} onSave={async (id, data) => { await updatePromoter(id, data); fetchData(true); }} />
            <PromoterLookupModal isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} results={lookupResults} error={null} organizationsMap={orgsMap} onGoToPromoter={(p) => { setIsLookupModalOpen(false); setSearchQuery(p.email); setFilterStatus('all'); }} />
        </div>
    );
};
