
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  getAllPromotersPaginated, 
  getPromoterStats, 
  updatePromoter, 
  getRejectionReasons, 
  findPromotersByEmail,
  notifyApprovalBulk,
  deletePromoter
} from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { 
  Promoter, AdminUserData, PromoterStatus, 
  RejectionReason, Organization, Campaign 
} from '../types';
import { 
  SearchIcon, CheckCircleIcon, XIcon, 
  InstagramIcon, WhatsAppIcon, TrashIcon, 
  PencilIcon, RefreshIcon, FilterIcon,
  MegaphoneIcon, MailIcon, ClockIcon, UserIcon
} from '../components/Icons';
import { states } from '../constants/states';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import PhotoViewerModal from '../components/PhotoViewerModal';
import RejectionModal from '../components/RejectionModal';
import EditPromoterModal from '../components/EditPromoterModal';
import PromoterLookupModal from '../components/PromoterLookupModal';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && (timestamp.seconds !== undefined || timestamp._seconds !== undefined)) {
        return new Date((timestamp.seconds || timestamp._seconds) * 1000);
    }
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const getRelativeTime = (ts: any): string => {
    const date = toDateSafe(ts);
    if (!date) return 'agora';
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInSeconds = Math.floor(diffInMs / 1000);
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    const diffInHours = Math.floor(diffInMinutes / 60);
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInSeconds < 60) return 'agora';
    if (diffInMinutes < 60) return `há ${diffInMinutes}min`;
    if (diffInHours < 24) return `há ${diffInHours}h`;
    if (diffInDays === 1) return 'ontem';
    return `há ${diffInDays} dias`;
};

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

const PAGE_SIZE = 30;

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId, organizationsForAdmin, loading: authLoading } = useAdminAuth();
    
    // Dados Principais e Paginação
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [prevCursors, setPrevCursors] = useState<any[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [orgsMap, setOrgsMap] = useState<Record<string, string>>({});

    // Estado da UI e Filtros
    const [isLoading, setIsLoading] = useState(true);
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [error, setError] = useState('');
    const [filterState, setFilterState] = useState('all');
    const [filterStatus, setFilterStatus] = useState<PromoterStatus | 'all'>('pending');
    const [filterGroup, setFilterGroup] = useState<'all' | 'in' | 'out'>('all');
    const [selectedCampaign, setSelectedCampaign] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [minAge, setMinAge] = useState('');
    const [maxAge, setMaxAge] = useState('');
    
    // Seleção em Massa
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Controle de Modais
    const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [photoViewer, setPhotoViewer] = useState<{ isOpen: boolean, urls: string[], index: number }>({ 
        isOpen: false, urls: [], index: 0 
    });

    // Busca por E-mail
    const [lookupEmail, setLookupEmail] = useState('');
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);

    const isSuperAdmin = adminData.role === 'superadmin';
    const isMounted = useRef(true);

    useEffect(() => {
        return () => { isMounted.current = false; };
    }, []);

    const currentOrg = useMemo(() => {
        return organizationsForAdmin.find(o => o.id === selectedOrgId);
    }, [organizationsForAdmin, selectedOrgId]);

    const statesToShow = useMemo(() => {
        if (isSuperAdmin && !selectedOrgId) return states;
        if (currentOrg?.assignedStates && currentOrg.assignedStates.length > 0) {
            return states.filter(s => currentOrg.assignedStates.includes(s.abbr));
        }
        return states;
    }, [currentOrg, isSuperAdmin, selectedOrgId]);

    const fetchData = useCallback(async (cursor: any = null) => {
        const orgId = selectedOrgId || (isSuperAdmin ? undefined : (selectedOrgId as string | undefined));
        
        if (!isSuperAdmin && !orgId) {
            setIsLoading(false);
            setPromoters([]);
            return;
        }

        setIsLoading(true);
        setError('');
        
        try {
            const options = {
                organizationId: orgId as string | undefined,
                status: filterStatus,
                filterState: filterState,
                selectedCampaign: selectedCampaign,
                pageSize: PAGE_SIZE,
                lastDoc: cursor,
                searchQuery: searchQuery 
            };

            const [result, statsData, camps, reasons, allOrgs] = await Promise.all([
                getAllPromotersPaginated(options),
                getPromoterStats({ organizationId: orgId as string | undefined, filterState, selectedCampaign }),
                getAllCampaigns(orgId as string | undefined),
                orgId ? getRejectionReasons(orgId as string) : Promise.resolve([]),
                getOrganizations()
            ]);

            if (isMounted.current) {
                setPromoters(result.promoters);
                setLastDoc(result.lastDoc);
                setHasMore(result.hasMore);
                setStats(statsData);
                setCampaigns(camps);
                setRejectionReasons(reasons);
                const map = (allOrgs as Organization[]).reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
                setOrgsMap(map);
            }
            
        } catch (err: any) {
            if (isMounted.current) setError(err.message || 'Falha ao carregar dados.');
        } finally {
            if (isMounted.current) setIsLoading(false);
        }
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign, isSuperAdmin, searchQuery]);

    // Efeito para busca e reset de filtros com Debounce para busca no servidor
    useEffect(() => {
        if (!authLoading) {
            const timeout = setTimeout(() => {
                setPrevCursors([]);
                setLastDoc(null);
                setSelectedIds(new Set());
                fetchData(null);
            }, searchQuery ? 600 : 0);
            return () => clearTimeout(timeout);
        }
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign, searchQuery, fetchData, authLoading]);

    const handleLookup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!lookupEmail.trim()) return;

        setIsLookingUp(true);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(lookupEmail.toLowerCase().trim());
            setLookupResults(results);
        } catch (err) {
            console.error("Erro na busca global:", err);
        } finally {
            setIsLookingUp(false);
        }
    };

    const toggleSelectOne = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedIds(newSet);
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Deseja aprovar ${selectedIds.size} perfis selecionados?`)) return;
        setIsLoading(true);
        try {
            await Promise.all(Array.from(selectedIds).map(async (id: string) => {
                const p = promoters.find(item => item.id === id);
                if (!p) return;
                const allCampaigns = Array.from(new Set([p.campaignName, ...(p.associatedCampaigns || [])].filter(Boolean) as string[]));
                await updatePromoter(id, { 
                    status: 'approved',
                    allCampaigns: allCampaigns,
                    actionTakenByEmail: adminData.email
                });
            }));
            setSelectedIds(new Set());
            setTimeout(() => fetchData(null), 1000); 
        } catch (e) {
            alert("Erro ao aprovar em massa.");
            setIsLoading(false);
        }
    };

    const handleApprove = async (p: Promoter) => {
        const pId = p.id;
        const allCampaigns = Array.from(new Set([p.campaignName, ...(p.associatedCampaigns || [])].filter(Boolean) as string[]));
        
        setIsBulkProcessing(true);
        try {
            await updatePromoter(pId, { 
                status: 'approved',
                allCampaigns: allCampaigns,
                actionTakenByEmail: adminData.email
            });
            setSelectedIds(new Set());
            // Voltamos para a primeira página para garantir que o item apareça no topo das aprovadas
            fetchData(null);
        } catch (err: any) {
            console.error("Falha ao aprovar:", err);
            fetchData(null); 
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleRejectConfirm = async (reason: string, allowEdit: boolean) => {
        if (!selectedPromoter) return;
        setIsRejectionModalOpen(false);
        const statusToSet: PromoterStatus = allowEdit ? 'rejected_editable' : 'rejected';
        const pId = selectedPromoter.id;
        
        setIsBulkProcessing(true);
        try {
            await updatePromoter(pId, { 
                status: statusToSet, 
                rejectionReason: reason,
                actionTakenByEmail: adminData.email
            });
            setSelectedPromoter(null);
            fetchData(null);
        } catch (err: any) {
            fetchData(null);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const displayedPromoters = useMemo(() => {
        // Agora o servidor já filtra a maioria das coisas, 
        // mantemos apenas filtros de UI aqui.
        return promoters.filter(p => {
            if (!p) return false;
            const age = calculateAge(p.dateOfBirth);
            const matchesMinAge = !minAge || age >= parseInt(minAge);
            const matchesMaxAge = !maxAge || age <= parseInt(maxAge);
            const matchesGroup = filterGroup === 'all' || 
                                (filterGroup === 'in' && p.hasJoinedGroup === true) || 
                                (filterGroup === 'out' && p.hasJoinedGroup !== true);
            return matchesMinAge && matchesMaxAge && matchesGroup;
        });
    }, [promoters, minAge, maxAge, filterGroup]);

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

    const getPhotoUrl = (p: Promoter) => {
        if (!p) return null;
        return p.facePhotoUrl || (p.photoUrls && p.photoUrls.length > 0 ? p.photoUrls[0] : null);
    };

    return (
        <div className="space-y-6 pb-40 max-w-full overflow-x-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
                <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Equipe</h1>
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 w-full md:w-auto">
                    {[
                        { label: 'Total', val: stats.total, color: 'text-white' },
                        { label: 'Pendentes', val: stats.pending, color: 'text-blue-400' },
                        { label: 'Aprovadas', val: stats.approved, color: 'text-green-400' },
                        { label: 'Rejeitadas', val: stats.rejected, color: 'text-red-400' }
                    ].map(s => (
                        <div key={s.label} className="px-3 py-1.5 bg-secondary border border-gray-700 rounded-xl text-center min-w-[85px] flex-shrink-0">
                            <p className="text-[8px] font-black text-gray-500 uppercase">{s.label}</p>
                            <p className={`text-base font-black ${s.color}`}>{s.val}</p>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-secondary p-4 md:p-6 rounded-[1.5rem] md:rounded-[2rem] border border-white/5 shadow-xl space-y-4 mx-2 md:mx-0">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    <div className="md:col-span-4 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Buscar nome em toda a base..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>
                    <div className="md:col-span-3 flex gap-2">
                        <input type="number" placeholder="Mín" value={minAge} onChange={e => setMinAge(e.target.value)} className="w-full px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none font-bold"/>
                        <input type="number" placeholder="Máx" value={maxAge} onChange={e => setMaxAge(e.target.value)} className="w-full px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none font-bold"/>
                    </div>
                    <form onSubmit={handleLookup} className="flex gap-2 md:col-span-4">
                         <input type="email" placeholder="Busca global (E-mail)..." value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} className="flex-grow px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none font-bold"/>
                        <button type="submit" className="px-4 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-colors"><SearchIcon className="w-4 h-4" /></button>
                    </form>
                    <button onClick={() => fetchData(null)} className="md:col-span-1 flex items-center justify-center py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700">
                        <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="flex-1 sm:flex-none bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="pending">⏳ Pendentes</option>
                        <option value="approved">✅ Aprovadas</option>
                        <option value="rejected">❌ Rejeitadas</option>
                        <option value="rejected_editable">⚠️ Corrigir</option>
                        <option value="removed">🗑️ Removidas</option>
                        <option value="all">🌐 Ver Tudo</option>
                    </select>
                    <select value={filterGroup} onChange={e => setFilterGroup(e.target.value as any)} className="flex-1 sm:flex-none bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="all">👥 Grupo (Todos)</option>
                        <option value="in">✅ No Grupo</option>
                        <option value="out">❌ Fora do Grupo</option>
                    </select>
                    <select value={filterState} onChange={e => setFilterState(e.target.value)} className="flex-1 sm:flex-none bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="all">Todos Estados</option>
                        {statesToShow.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                    </select>
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="mx-2 md:mx-0 p-4 bg-primary rounded-2xl shadow-lg flex items-center justify-between animate-fadeIn sticky top-24 z-30">
                    <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} selecionadas</p>
                    <div className="flex gap-2">
                        <button onClick={handleBulkApprove} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl">Aprovar</button>
                        <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 bg-black/20 text-white font-black text-[10px] uppercase rounded-xl">Cancelar</button>
                    </div>
                </div>
            )}

            <div className="mx-2 md:mx-0">
                {isLoading && promoters.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando equipe...</p>
                    </div>
                ) : displayedPromoters.length === 0 ? (
                    <div className="bg-secondary p-20 rounded-[2.5rem] border border-white/5 text-center text-gray-500 font-bold uppercase tracking-widest">Nenhum registro encontrado</div>
                ) : (
                    <>
                        <div className="hidden md:block bg-secondary rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input type="checkbox" checked={selectedIds.size === displayedPromoters.length && displayedPromoters.length > 0} onChange={() => {
                                                if (selectedIds.size === displayedPromoters.length) setSelectedIds(new Set());
                                                else setSelectedIds(new Set(displayedPromoters.map(p => p.id)));
                                            }} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary" />
                                        </th>
                                        <th className="px-6 py-5">Perfil</th>
                                        <th className="px-6 py-5 text-center">Idade</th>
                                        <th className="px-6 py-5">Status</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {displayedPromoters.map(p => {
                                        const photo = getPhotoUrl(p);
                                        return (
                                            <tr key={p.id} className={`hover:bg-white/[0.02] transition-colors group ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5">
                                                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary" />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-5">
                                                        <div className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer border-2 border-gray-700 group-hover:border-primary transition-all flex-shrink-0 bg-gray-800 flex items-center justify-center" onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls || [], index: 0 })}>
                                                            {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-6 h-6 text-gray-600" />}
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <p className="text-white font-black text-sm truncate uppercase tracking-tight">{p.name || 'Sem Nome'}</p>
                                                            <p className="text-primary text-[9px] font-black uppercase tracking-widest whitespace-nowrap mt-0.5">Inscrita {getRelativeTime(p.createdAt)}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5 text-center font-bold text-gray-300">{calculateAge(p.dateOfBirth)}a</td>
                                                <td className="px-6 py-5">{statusBadge(p.status)}</td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                        {p.status === 'pending' && (
                                                            <button onClick={() => handleApprove(p)} disabled={isBulkProcessing} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all"><CheckCircleIcon className="w-4 h-4" /></button>
                                                        )}
                                                        <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-all"><XIcon className="w-4 h-4" /></button>
                                                        <button onClick={() => { setSelectedPromoter(p); setIsEditModalOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-all"><PencilIcon className="w-4 h-4" /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View */}
                        <div className="md:hidden grid grid-cols-1 gap-4">
                            {displayedPromoters.map(p => {
                                const photo = getPhotoUrl(p);
                                return (
                                    <div key={p.id} className={`bg-secondary p-5 rounded-3xl border ${selectedIds.has(p.id) ? 'border-primary' : 'border-white/5'} shadow-xl space-y-5`}>
                                        <div className="flex items-center gap-4">
                                            <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} className="w-5 h-5 rounded-lg border-gray-700 bg-dark text-primary" />
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-gray-700 bg-gray-800 flex items-center justify-center" onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls || [], index: 0 })}>
                                                {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-8 h-8 text-gray-600" />}
                                            </div>
                                            <div className="overflow-hidden">
                                                <p className="text-white font-black uppercase text-sm leading-tight truncate">{p.name || 'Sem Nome'}</p>
                                                <div className="flex items-center gap-2 mt-1">{statusBadge(p.status)}</div>
                                                <p className="text-primary text-[8px] font-black uppercase tracking-widest mt-1">Inscrita {getRelativeTime(p.createdAt)}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            {p.status === 'pending' && <button onClick={() => handleApprove(p)} disabled={isBulkProcessing} className="flex-1 py-4 bg-green-600 text-white font-black text-[10px] uppercase rounded-2xl flex items-center justify-center gap-2"><CheckCircleIcon className="w-4 h-4" /> Aprovar</button>}
                                            <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="flex-1 py-4 bg-red-600 text-white font-black text-[10px] uppercase rounded-2xl flex items-center justify-center gap-2"><XIcon className="w-4 h-4" /> Rejeitar</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Paginação */}
                        <div className="mt-6 p-6 bg-secondary rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 flex justify-between items-center">
                            <button onClick={() => {
                                if (prevCursors.length === 0 || isLoading) return;
                                const newCursors = [...prevCursors];
                                const currentCursor = newCursors.pop();
                                const prevCursor = newCursors.length > 0 ? newCursors[newCursors.length - 1] : null;
                                setPrevCursors(newCursors);
                                fetchData(prevCursor);
                            }} disabled={prevCursors.length === 0 || isLoading} className="px-6 py-2 bg-gray-800 text-gray-300 font-black text-[10px] uppercase rounded-xl hover:bg-gray-700 disabled:opacity-30">Anterior</button>
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Página {prevCursors.length + 1}</span>
                            <button onClick={() => {
                                if (!hasMore || isLoading || !lastDoc) return;
                                setPrevCursors(prev => [...prev, lastDoc]);
                                fetchData(lastDoc);
                            }} disabled={!hasMore || isLoading} className="px-6 py-2 bg-primary text-white font-black text-[10px] uppercase rounded-xl hover:bg-primary-dark disabled:opacity-30">Próxima</button>
                        </div>
                    </>
                )}
            </div>

            <PhotoViewerModal isOpen={photoViewer.isOpen} imageUrls={photoViewer.urls} startIndex={photoViewer.index} onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => setIsRejectionModalOpen(false)} onConfirm={handleRejectConfirm} reasons={rejectionReasons} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} promoter={selectedPromoter} onSave={async (id: string, data: any) => { await updatePromoter(id, data); fetchData(null); }} />
            <PromoterLookupModal 
              isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} results={lookupResults} error={null} organizationsMap={orgsMap} 
              onGoToPromoter={(p) => { 
                  setIsLookupModalOpen(false); 
                  setSearchQuery(p.email); 
                  // Forçamos o reset para a primeira página com a busca ativa
                  setFilterStatus('all');
                  fetchData(null);
              }}
              onEdit={(p) => { setIsLookupModalOpen(false); setSelectedPromoter(p); setIsEditModalOpen(true); }}
              onDelete={async (p: Promoter) => { 
                if(window.confirm(`Excluir PERMANENTEMENTE ${p.name}?`)) {
                    setIsLoading(true);
                    try {
                        await deletePromoter(p.id);
                        setIsLookupModalOpen(false);
                        fetchData(null);
                    } catch(err: any) { 
                        alert(err?.message || "Ocorreu um erro ao excluir."); 
                    } finally { 
                        setIsLoading(false); 
                    }
                }
              }}
            />
        </div>
    );
};
