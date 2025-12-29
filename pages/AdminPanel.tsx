
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  getAllPromotersForAdmin, 
  getPromoterStats, 
  updatePromoter, 
  getRejectionReasons, 
  findPromotersByEmail,
  deletePromoter,
  notifyPromoterEmail
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
  MegaphoneIcon, MailIcon, ClockIcon, UserIcon, TikTokIcon
} from '../components/Icons';
import { states } from '../constants/states';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import PhotoViewerModal from '../components/PhotoViewerModal';
import RejectionModal from '../components/RejectionModal';
import EditPromoterModal from '../components/EditPromoterModal';
import PromoterLookupModal from '../components/PromoterLookupModal';

const getUnixTime = (ts: any): number => {
    if (!ts) return 0; 
    if (typeof ts.toMillis === 'function') return ts.toMillis() / 1000;
    if (ts.seconds !== undefined) return ts.seconds;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 0 : d.getTime() / 1000;
};

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

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId, organizationsForAdmin, loading: authLoading } = useAdminAuth();
    
    // Dados Principais
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
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
    
    // Seleção em Massa
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isBulkAction, setIsBulkAction] = useState(false);

    // Controle de Modais
    const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [photoViewer, setPhotoViewer] = useState<{ isOpen: boolean, urls: string[], index: number }>({ 
        isOpen: false, urls: [], index: 0 
    });

    // Busca por E-mail (Global)
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

    const fetchData = useCallback(async () => {
        const orgId = selectedOrgId || (isSuperAdmin ? undefined : (selectedOrgId as string | undefined));
        
        if (!orgId) {
            setIsLoading(false);
            setPromoters([]);
            return;
        }

        setIsLoading(true);
        setError('');
        
        try {
            const [allPromoters, statsData, camps, reasons, allOrgs] = await Promise.all([
                getAllPromotersForAdmin({ organizationId: orgId, status: 'all' }),
                getPromoterStats({ organizationId: orgId }),
                getAllCampaigns(orgId),
                getRejectionReasons(orgId),
                getOrganizations()
            ]);

            if (isMounted.current) {
                setPromoters(allPromoters);
                setStats(statsData);
                setCampaigns(camps);
                setRejectionReasons(reasons);
                const map = (allOrgs as Organization[]).reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
                setOrgsMap(map);
            }
            
        } catch (err: any) {
            if (isMounted.current) setError(err.message || 'Falha ao carregar dados da equipe.');
        } finally {
            if (isMounted.current) setIsLoading(false);
        }
    }, [selectedOrgId, isSuperAdmin]);

    useEffect(() => {
        if (!authLoading) {
            fetchData();
        }
    }, [selectedOrgId, fetchData, authLoading]);

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
        setIsBulkProcessing(true);
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
            await fetchData();
        } catch (e) {
            alert("Erro ao aprovar perfis em massa.");
        } finally {
            setIsBulkProcessing(false);
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
            await fetchData();
        } catch (err: any) {
            console.error("Falha ao aprovar:", err);
            await fetchData(); 
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleNotifyEmailManual = async (p: Promoter) => {
        if (!window.confirm(`Enviar e-mail de boas-vindas para ${p.name}?`)) return;
        setIsBulkProcessing(true);
        try {
            await notifyPromoterEmail(p.id);
            alert("E-mail enviado com sucesso!");
        } catch (e: any) {
            alert("Erro ao enviar: " + e.message);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleWhatsAppManual = (p: Promoter) => {
        const firstName = p.name.split(' ')[0];
        const msg = `Olá ${firstName}! Seu perfil foi aprovado para a equipe do evento ${p.campaignName || 'de produção'}. Para começar, acesse seu portal agora para ler as regras e entrar no grupo: https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`;
        const url = `https://wa.me/55${p.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    };

    const handleRejectConfirm = async (reason: string, allowEdit: boolean) => {
        const statusToSet: PromoterStatus = allowEdit ? 'rejected_editable' : 'rejected';
        setIsBulkProcessing(true);
        try {
            if (isBulkAction) {
                await Promise.all(Array.from(selectedIds).map(async (id: string) => {
                    await updatePromoter(id, { 
                        status: statusToSet, 
                        rejectionReason: reason,
                        actionTakenByEmail: adminData.email
                    });
                }));
                setSelectedIds(new Set());
            } else if (selectedPromoter) {
                await updatePromoter(selectedPromoter.id, { 
                    status: statusToSet, 
                    rejectionReason: reason,
                    actionTakenByEmail: adminData.email
                });
                setSelectedPromoter(null);
            }
            await fetchData();
        } catch (err: any) {
            await fetchData();
        } finally {
            setIsBulkProcessing(false);
            setIsRejectionModalOpen(false);
            setIsBulkAction(false);
        }
    };

    // --- FILTRAGEM LOCAL TOTAL ---
    const filteredPromoters = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        let results = promoters.filter(p => {
            if (!p) return false;
            
            if (filterStatus !== 'all' && p.status !== filterStatus) return false;
            if (filterState !== 'all' && p.state !== filterState) return false;

            if (selectedCampaign !== 'all') {
                const inMain = p.campaignName === selectedCampaign;
                const inAssociated = p.associatedCampaigns?.includes(selectedCampaign);
                if (!inMain && !inAssociated) return false;
            }

            const nameMatch = (p.name || '').toLowerCase().includes(query);
            const emailMatch = (p.email || '').toLowerCase().includes(query);
            const instaMatch = (p.instagram || '').toLowerCase().includes(query);
            if (query && !nameMatch && !emailMatch && !instaMatch) return false;

            const matchesGroup = filterGroup === 'all' || 
                                (filterGroup === 'in' && p.hasJoinedGroup === true) || 
                                (filterGroup === 'out' && p.hasJoinedGroup !== true);
            if (!matchesGroup) return false;
            
            return true;
        });

        results.sort((a, b) => {
            const timeA = (a.status === 'approved' || a.status === 'rejected' || (a.status as string) === 'rejected_editable') 
                ? getUnixTime(a.statusChangedAt || a.createdAt)
                : getUnixTime(a.createdAt);
            const timeB = (b.status === 'approved' || b.status === 'rejected' || (b.status as string) === 'rejected_editable') 
                ? getUnixTime(b.statusChangedAt || b.createdAt)
                : getUnixTime(b.createdAt);
            return timeB - timeA;
        });

        return results;
    }, [promoters, filterStatus, filterState, selectedCampaign, searchQuery, filterGroup]);

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
                            placeholder="Buscar nome, e-mail ou @..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>
                    <div className="md:col-span-4">
                        <select 
                            value={selectedCampaign} 
                            onChange={e => setSelectedCampaign(e.target.value)}
                            className="w-full px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-bold"
                        >
                            <option value="all">Filtrar por Evento (Todos)</option>
                            {campaigns.map(c => <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>)}
                        </select>
                    </div>
                    <form onSubmit={handleLookup} className="flex gap-2 md:col-span-3">
                         <input type="email" placeholder="Busca global (E-mail)..." value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} className="flex-grow px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none font-bold"/>
                        <button type="submit" className="px-4 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-colors"><SearchIcon className="w-4 h-4" /></button>
                    </form>
                    <button onClick={() => fetchData()} className="md:col-span-1 flex items-center justify-center py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700">
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
                        <button onClick={handleBulkApprove} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl hover:bg-gray-100 transition-colors">Aprovar</button>
                        <button onClick={() => { setIsBulkAction(true); setIsRejectionModalOpen(true); }} className="px-4 py-2 bg-red-600 text-white font-black text-[10px] uppercase rounded-xl hover:bg-red-700 transition-colors">Reprovar</button>
                        <button onClick={() => { setSelectedIds(new Set()); setIsBulkAction(false); }} className="px-4 py-2 bg-black/20 text-white font-black text-[10px] uppercase rounded-xl">Cancelar</button>
                    </div>
                </div>
            )}

            <div className="mx-2 md:mx-0">
                {isLoading ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando equipe...</p>
                    </div>
                ) : filteredPromoters.length === 0 ? (
                    <div className="bg-secondary p-20 rounded-[2.5rem] border border-white/5 text-center text-gray-500 font-bold uppercase tracking-widest">Nenhum registro encontrado</div>
                ) : (
                    <>
                        <div className="hidden md:block bg-secondary rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input type="checkbox" checked={selectedIds.size === filteredPromoters.length && filteredPromoters.length > 0} onChange={() => {
                                                if (selectedIds.size === filteredPromoters.length) setSelectedIds(new Set());
                                                else setSelectedIds(new Set(filteredPromoters.map(p => p.id)));
                                            }} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary" />
                                        </th>
                                        <th className="px-6 py-5">Perfil / Contato</th>
                                        <th className="px-6 py-5">Evento / Lista</th>
                                        <th className="px-6 py-5">Status</th>
                                        <th className="px-6 py-5 text-center">Grupo</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredPromoters.map(p => {
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
                                                            <div className="flex items-center gap-3 mt-1.5">
                                                                <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="text-pink-500 hover:text-pink-400 transition-colors flex items-center gap-1">
                                                                    <InstagramIcon className="w-3.5 h-3.5" />
                                                                    <span className="text-[10px] font-bold">@{p.instagram}</span>
                                                                </a>
                                                                <a href={`https://wa.me/55${p.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-400 transition-colors flex items-center gap-1">
                                                                    <WhatsAppIcon className="w-3.5 h-3.5" />
                                                                    <span className="text-[10px] font-bold">WhatsApp</span>
                                                                </a>
                                                                {p.tiktok && (
                                                                    <a href={`https://tiktok.com/@${p.tiktok.replace('@', '')}`} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-white transition-colors flex items-center gap-1">
                                                                        <TikTokIcon className="w-3.5 h-3.5" />
                                                                        <span className="text-[10px] font-bold">TikTok</span>
                                                                    </a>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-1.5">
                                                                <p className="text-gray-600 text-[9px] font-bold uppercase tracking-widest">{calculateAge(p.dateOfBirth)}a • {p.state}</p>
                                                                <p className="text-primary text-[9px] font-black uppercase tracking-widest whitespace-nowrap">Inscrita {getRelativeTime(p.createdAt)}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <p className="text-white font-black text-[10px] uppercase tracking-tighter">{p.campaignName || 'Geral'}</p>
                                                    {(p.associatedCampaigns || []).length > 0 && (
                                                        <p className="text-[8px] text-gray-500 font-bold uppercase mt-0.5">+{p.associatedCampaigns!.length} extras</p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div>{statusBadge(p.status)}</div>
                                                    {p.actionTakenByEmail && (
                                                        <p className="text-[8px] text-gray-600 font-bold uppercase mt-1">Por: {p.actionTakenByEmail.split('@')[0]}</p>
                                                    )}
                                                </td>
                                                <td className="px-6 py-5 text-center">
                                                    {p.hasJoinedGroup ? (
                                                        <span className="px-2 py-0.5 rounded-lg bg-green-900/20 text-green-400 border border-green-800/30 text-[8px] font-black uppercase tracking-widest">No Grupo</span>
                                                    ) : (
                                                        <span className="px-2 py-0.5 rounded-lg bg-gray-800 text-gray-600 border border-gray-700 text-[8px] font-black uppercase tracking-widest">Fora</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                        {p.status === 'approved' && (
                                                            <>
                                                                <button onClick={() => handleWhatsAppManual(p)} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all" title="Aviso via WhatsApp"><WhatsAppIcon className="w-4 h-4" /></button>
                                                                <button onClick={() => handleNotifyEmailManual(p)} className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-all" title="Aviso via E-mail"><MailIcon className="w-4 h-4" /></button>
                                                            </>
                                                        )}
                                                        {p.status === 'pending' && (
                                                            <button onClick={() => handleApprove(p)} disabled={isBulkProcessing} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all"><CheckCircleIcon className="w-4 h-4" /></button>
                                                        )}
                                                        <button onClick={() => { setSelectedPromoter(p); setIsBulkAction(false); setIsRejectionModalOpen(true); }} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-all"><XIcon className="w-4 h-4" /></button>
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
                            {filteredPromoters.map(p => {
                                const photo = getPhotoUrl(p);
                                return (
                                    <div key={p.id} className={`bg-secondary p-5 rounded-3xl border ${selectedIds.has(p.id) ? 'border-primary' : 'border-white/5'} shadow-xl space-y-5`}>
                                        <div className="flex items-center gap-4">
                                            <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} className="w-5 h-5 rounded-lg border-gray-700 bg-dark text-primary" />
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-gray-700 bg-gray-800 flex items-center justify-center" onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls || [], index: 0 })}>
                                                {photo ? <img src={photo} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-8 h-8 text-gray-600" />}
                                            </div>
                                            <div className="overflow-hidden flex-grow">
                                                <p className="text-white font-black uppercase text-sm leading-tight truncate">{p.name || 'Sem Nome'}</p>
                                                <p className="text-primary text-[9px] font-black uppercase tracking-widest mt-0.5">{p.campaignName || 'Geral'}</p>
                                                <div className="flex items-center gap-3 mt-1.5">
                                                    <a href={`https://instagram.com/${p.instagram.replace('@', '')}`} target="_blank" rel="noreferrer" className="text-pink-500"><InstagramIcon className="w-4 h-4" /></a>
                                                    <a href={`https://wa.me/55${p.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="text-green-500"><WhatsAppIcon className="w-4 h-4" /></a>
                                                    {p.tiktok && <a href={`https://tiktok.com/@${p.tiktok.replace('@', '')}`} target="_blank" rel="noreferrer" className="text-white"><TikTokIcon className="w-4 h-4" /></a>}
                                                </div>
                                                <div className="flex items-center gap-2 mt-2">
                                                    {statusBadge(p.status)}
                                                    {p.hasJoinedGroup && <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>}
                                                </div>
                                                <p className="text-gray-600 text-[8px] font-black uppercase tracking-widest mt-1">Por: {p.actionTakenByEmail?.split('@')[0] || '-'}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5">
                                            {p.status === 'pending' && <button onClick={() => handleApprove(p)} disabled={isBulkProcessing} className="flex-1 py-4 bg-green-600 text-white font-black text-[10px] uppercase rounded-2xl flex items-center justify-center gap-2"><CheckCircleIcon className="w-4 h-4" /> Aprovar</button>}
                                            {p.status === 'approved' && (
                                                <>
                                                    <button onClick={() => handleWhatsAppManual(p)} className="p-4 bg-green-600 text-white rounded-2xl hover:bg-green-500 transition-all flex-1 flex justify-center"><WhatsAppIcon className="w-5 h-5" /></button>
                                                    <button onClick={() => handleNotifyEmailManual(p)} className="p-4 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 transition-all flex-1 flex justify-center"><MailIcon className="w-5 h-5" /></button>
                                                </>
                                            )}
                                            <button onClick={() => { setSelectedPromoter(p); setIsBulkAction(false); setIsRejectionModalOpen(true); }} className="flex-1 py-4 bg-red-600 text-white font-black text-[10px] uppercase rounded-2xl flex items-center justify-center gap-2"><XIcon className="w-4 h-4" /> Rejeitar</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            <PhotoViewerModal isOpen={photoViewer.isOpen} imageUrls={photoViewer.urls} startIndex={photoViewer.index} onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => { setIsRejectionModalOpen(false); setIsBulkAction(false); }} onConfirm={handleRejectConfirm} reasons={rejectionReasons} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} promoter={selectedPromoter} onSave={async (id: string, data: any) => { await updatePromoter(id, data); fetchData(); }} />
            <PromoterLookupModal 
              isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} results={lookupResults} error={null} organizationsMap={orgsMap} 
              onGoToPromoter={(p) => { 
                  setIsLookupModalOpen(false); 
                  setSearchQuery(p.email); 
                  setFilterStatus('all');
              }}
              onEdit={(p) => { setIsLookupModalOpen(false); setSelectedPromoter(p); setIsEditModalOpen(true); }}
              onDelete={async (p: Promoter) => { 
                if(window.confirm(`Excluir PERMANENTEMENTE ${p.name}?`)) {
                    setIsLoading(true);
                    try {
                        await deletePromoter(p.id);
                        setIsLookupModalOpen(false);
                        fetchData();
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
