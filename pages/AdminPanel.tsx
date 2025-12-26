
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  getAllPromotersPaginated, 
  getPromoterStats, 
  updatePromoter, 
  getRejectionReasons, 
  findPromotersByEmail,
  notifyApprovalBulk 
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
  MegaphoneIcon, MailIcon 
} from '../components/Icons';
import { states } from '../constants/states';
import { useAdminAuth } from '../contexts/AdminAuthContext';

// Modais
import RejectionModal from '../components/RejectionModal';
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

const PAGE_SIZE = 30;

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId, organizationsForAdmin } = useAdminAuth();
    
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

    // Obtém a organização atual para filtrar os estados
    const currentOrg = useMemo(() => {
        return organizationsForAdmin.find(o => o.id === selectedOrgId);
    }, [organizationsForAdmin, selectedOrgId]);

    // Filtra a lista global de estados para mostrar apenas os da produtora
    const statesToShow = useMemo(() => {
        if (isSuperAdmin && !selectedOrgId) {
            return states;
        }
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
                lastDoc: cursor
            };

            const [result, statsData, camps, reasons, allOrgs] = await Promise.all([
                getAllPromotersPaginated(options),
                getPromoterStats({ organizationId: orgId as string | undefined, filterState, selectedCampaign }),
                getAllCampaigns(orgId as string | undefined),
                orgId ? getRejectionReasons(orgId as string) : Promise.resolve([]),
                getOrganizations()
            ]);

            setPromoters(result.promoters);
            setLastDoc(result.lastDoc);
            setHasMore(result.promoters.length === PAGE_SIZE);
            setStats(statsData);
            setCampaigns(camps);
            setRejectionReasons(reasons);
            
            const map = (allOrgs as Organization[]).reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
            setOrgsMap(map);
            
        } catch (err: any) {
            setError(err.message || 'Falha técnica ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign, isSuperAdmin]);

    useEffect(() => {
        setPrevCursors([]);
        setLastDoc(null);
        setSelectedIds(new Set());
        fetchData(null);
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign, fetchData]);

    // Ações em massa
    const toggleSelectAll = () => {
        if (selectedIds.size === filteredPromoters.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredPromoters.map(p => p.id)));
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
        const idsArray = Array.from(selectedIds);
        setIsLoading(true);
        try {
            await Promise.all(idsArray.map(id => updatePromoter(id as string, { status: 'approved' })));
            setSelectedIds(new Set());
            fetchData(null);
        } catch (e) {
            alert("Erro ao aprovar em massa.");
            setIsLoading(false);
        }
    };

    const handleBulkReject = async () => {
        if (selectedIds.size === 0) return;
        const reason = window.prompt(`Digite o motivo da recusa para os ${selectedIds.size} perfis selecionados:`, "Perfil não aprovado no momento.");
        if (reason === null) return;

        const idsArray = Array.from(selectedIds);
        setIsLoading(true);
        try {
            await Promise.all(idsArray.map(id => updatePromoter(id as string, { 
                status: 'rejected',
                rejectionReason: reason 
            })));
            setSelectedIds(new Set());
            fetchData(null);
        } catch (e) {
            alert("Erro ao recusar em massa.");
            setIsLoading(false);
        }
    };

    const handleBulkNotifyApproval = async () => {
        const eligibleIds = promoters
            .filter(p => selectedIds.has(p.id) && p.status === 'approved' && !p.hasJoinedGroup)
            .map(p => p.id);

        if (eligibleIds.length === 0) {
            alert("Nenhuma das divulgadoras selecionadas atende aos critérios (Estar Aprovada e Fora do Grupo).");
            return;
        }

        if (!window.confirm(`Deseja enviar um e-mail de aviso de aprovação para as ${eligibleIds.length} divulgadoras qualificadas?`)) return;

        setIsBulkProcessing(true);
        try {
            await notifyApprovalBulk(eligibleIds);
            alert("E-mails enviados com sucesso!");
            setSelectedIds(new Set());
            fetchData(null);
        } catch (err: any) {
            alert("Erro ao enviar e-mails: " + err.message);
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleApprove = async (p: Promoter) => {
        const pId = p.id;
        setPromoters((prev: Promoter[]) => prev.filter(item => item.id !== pId));
        setStats((prev: typeof stats) => ({ 
            ...prev, 
            pending: Math.max(0, prev.pending - 1), 
            approved: prev.approved + 1 
        }));

        try {
            await updatePromoter(pId, { status: 'approved' });
        } catch (err: any) {
            fetchData(null); 
        }
    };

    const handleRejectConfirm = async (reason: string, allowEdit: boolean) => {
        const promoterToReject: Promoter | null = selectedPromoter;
        if (!promoterToReject) return;
        
        setIsRejectionModalOpen(false);
        const statusToSet: PromoterStatus = allowEdit ? 'rejected_editable' : 'rejected';
        const pId: string = promoterToReject.id;
        
        setPromoters((prev: Promoter[]) => prev.filter(p => p.id !== pId));
        setStats((prev: typeof stats) => ({
            ...prev,
            pending: Math.max(0, prev.pending - 1),
            rejected: prev.rejected + 1
        }));
        setSelectedPromoter(null);

        try {
            await updatePromoter(pId, { status: statusToSet, rejectionReason: reason });
        } catch (err: any) {
            fetchData(null);
        }
    };

    const handleSendApprovalManual = (p: Promoter) => {
        const firstName = p.name.split(' ')[0];
        const campaign = p.campaignName || "Equipe Geral";
        const portalLink = `https://divulgadoras.vercel.app/#/status?email=${encodeURIComponent(p.email)}`;
        const message = `✅ *Olá ${firstName}!* Seu perfil foi aprovado para a equipe do evento: *${campaign}*.\n\n🚀 *Acesse seu portal para ver suas tarefas e o link do grupo:* ${portalLink}`;
        const cleanPhone = p.whatsapp.replace(/\D/g, "");
        const waUrl = `https://wa.me/55${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
    };

    const filteredPromoters = useMemo(() => {
        // CORREÇÃO: Resiliência contra campos nulos
        return promoters.filter(p => {
            if (!p) return false;
            
            const age = calculateAge(p.dateOfBirth);
            const q = searchQuery.toLowerCase().trim();
            
            const matchesSearch = !q || 
                (p.name && p.name.toLowerCase().includes(q)) || 
                (p.instagram && p.instagram.toLowerCase().includes(q)) || 
                (p.email && p.email.toLowerCase().includes(q));
                
            const matchesMinAge = !minAge || age >= parseInt(minAge);
            const matchesMaxAge = !maxAge || age <= parseInt(maxAge);
            
            const matchesGroup = filterGroup === 'all' || 
                                (filterGroup === 'in' && p.hasJoinedGroup === true) || 
                                (filterGroup === 'out' && p.hasJoinedGroup !== true);
                                
            return matchesSearch && matchesMinAge && matchesMaxAge && matchesGroup;
        });
    }, [promoters, searchQuery, minAge, maxAge, filterGroup]);

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

    const notifyApprovalCount = useMemo(() => {
        return promoters.filter(p => p && selectedIds.has(p.id) && p.status === 'approved' && !p.hasJoinedGroup).length;
    }, [promoters, selectedIds]);

    return (
        <div className="space-y-6 pb-40 max-w-full overflow-x-hidden">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-2">
                <h1 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter">Equipe</h1>
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-2 w-full md:w-auto">
                    {[
                        { label: 'Total', val: stats.total, color: 'text-white' },
                        { label: 'Pendentes', val: stats.pending, color: 'text-blue-400' },
                        { label: 'Aprovadas', val: stats.approved, color: 'text-green-400' },
                        { label: 'Rejeitadas', val: stats.rejected, color: 'text-red-400' },
                        { label: 'Removidas', val: stats.removed, color: 'text-gray-500' }
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
                            placeholder="Nome, @instagram ou e-mail..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>

                    <div className="md:col-span-3 flex gap-2">
                        <input type="number" placeholder="Idade Mín" value={minAge} onChange={e => setMinAge(e.target.value)} className="w-full px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none font-bold"/>
                        <input type="number" placeholder="Idade Máx" value={maxAge} onChange={e => setMaxAge(e.target.value)} className="w-full px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none font-bold"/>
                    </div>

                    <form onSubmit={(e) => { e.preventDefault(); if(lookupEmail) setIsLookupModalOpen(true); }} className="flex gap-2 md:col-span-4">
                         <input type="email" placeholder="Buscar e-mail global..." value={lookupEmail} onChange={e => setLookupEmail(e.target.value)} className="flex-grow px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none"/>
                        <button type="submit" className="px-4 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-colors"><SearchIcon className="w-4 h-4" /></button>
                    </form>

                    <button onClick={() => fetchData(null)} className="md:col-span-1 flex items-center justify-center py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700 transition-colors">
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
                        <option value="all">Todos Estados da Produtora</option>
                        {statesToShow.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                    </select>
                    <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="w-full sm:w-auto bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="all">Todas Campanhas</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                </div>
            </div>

            {selectedIds.size > 0 && (
                <div className="mx-2 md:mx-0 p-4 bg-primary rounded-2xl shadow-lg flex items-center justify-between animate-fadeIn sticky top-24 z-30">
                    <p className="text-white font-black text-xs uppercase tracking-widest">{selectedIds.size} selecionadas</p>
                    <div className="flex flex-wrap gap-2">
                        {notifyApprovalCount > 0 && (
                            <button onClick={handleBulkNotifyApproval} disabled={isBulkProcessing} className="px-4 py-2 bg-indigo-600 text-white font-black text-[10px] uppercase rounded-xl hover:bg-indigo-500 transition-all flex items-center gap-2">
                                <MailIcon className="w-3.5 h-3.5" /> Avisar Aprovação ({notifyApprovalCount})
                            </button>
                        )}
                        <button onClick={handleBulkApprove} className="px-4 py-2 bg-white text-primary font-black text-[10px] uppercase rounded-xl hover:bg-gray-100 transition-all">Aprovar</button>
                        <button onClick={handleBulkReject} className="px-4 py-2 bg-red-600 text-white font-black text-[10px] uppercase rounded-xl hover:bg-red-500 transition-all">Rejeitar</button>
                        <button onClick={() => setSelectedIds(new Set())} className="px-4 py-2 bg-black/20 text-white font-black text-[10px] uppercase rounded-xl hover:bg-black/30">Cancelar</button>
                    </div>
                </div>
            )}

            <div className="mx-2 md:mx-0">
                {isLoading && promoters.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando...</p>
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
                                            <input type="checkbox" checked={selectedIds.size === filteredPromoters.length && filteredPromoters.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-primary" />
                                        </th>
                                        <th className="px-6 py-5">Perfil</th>
                                        {isSuperAdmin && <th className="px-6 py-5">Organização</th>}
                                        <th className="px-6 py-5 text-center">Idade</th>
                                        <th className="px-6 py-5">Social</th>
                                        <th className="px-6 py-5 text-center">Grupo?</th>
                                        <th className="px-6 py-5">Status</th>
                                        <th className="px-6 py-4 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredPromoters.map(p => (
                                        <tr key={p.id} className={`hover:bg-white/[0.02] transition-colors group ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                                            <td className="px-6 py-5">
                                                <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-primary" />
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-5">
                                                    <div className="relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer border-2 border-gray-700 group-hover:border-primary transition-all flex-shrink-0" onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls, index: 0 })}>
                                                        <img src={p.facePhotoUrl || p.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                                                    </div>
                                                    <div className="overflow-hidden">
                                                        <p className="text-white font-black text-sm truncate uppercase tracking-tight">{p.name}</p>
                                                        <p className="text-gray-500 text-[10px] truncate font-mono">{p.campaignName || 'Geral'}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            {isSuperAdmin && (
                                                <td className="px-6 py-5">
                                                    <p className="text-[10px] font-black text-primary uppercase truncate max-w-[120px]">{orgsMap[p.organizationId] || p.organizationId}</p>
                                                </td>
                                            )}
                                            <td className="px-6 py-5 text-center font-bold text-gray-300">{calculateAge(p.dateOfBirth)}a</td>
                                            <td className="px-6 py-5">
                                                <div className="flex items-center gap-2">
                                                    <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="p-2 bg-pink-500/10 text-pink-500 rounded-xl hover:bg-pink-500 hover:text-white transition-all"><InstagramIcon className="w-4 h-4" /></a>
                                                    <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="p-2 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all"><WhatsAppIcon className="w-4 h-4" /></a>
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">
                                                <div className="flex justify-center">
                                                    {p.status === 'approved' && (
                                                        <div className={`p-2 rounded-xl border w-fit ${p.hasJoinedGroup ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-gray-700/30 text-gray-500 border-gray-700'}`} title={p.hasJoinedGroup ? 'Já entrou no grupo' : 'Ainda não entrou no grupo'}>
                                                            <WhatsAppIcon className="w-4 h-4" />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-5">{statusBadge(p.status)}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                    {p.status === 'approved' && !p.hasJoinedGroup && (
                                                        <button onClick={() => handleSendApprovalManual(p)} className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-all" title="Enviar Aviso de Aprovação"><WhatsAppIcon className="w-4 h-4" /></button>
                                                    )}
                                                    {p.status === 'pending' && (
                                                        <button onClick={() => handleApprove(p)} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all"><CheckCircleIcon className="w-4 h-4" /></button>
                                                    )}
                                                    <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-all"><XIcon className="w-4 h-4" /></button>
                                                    <button onClick={() => { setSelectedPromoter(p); setIsEditModalOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-all"><PencilIcon className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Mobile View */}
                        <div className="md:hidden grid grid-cols-1 gap-4">
                            {filteredPromoters.map(p => (
                                <div key={p.id} className={`bg-secondary p-5 rounded-3xl border ${selectedIds.has(p.id) ? 'border-primary' : 'border-white/5'} shadow-xl space-y-5`}>
                                    <div className="flex justify-between items-start">
                                        <div className="flex items-center gap-4">
                                            <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelectOne(p.id)} className="w-5 h-5 rounded-lg border-gray-700 bg-dark text-primary" />
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden border-2 border-gray-700 shadow-inner" onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls, index: 0 })}>
                                                <img src={p.facePhotoUrl || p.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                                            </div>
                                            <div className="overflow-hidden text-left">
                                                <p className="text-white font-black uppercase text-sm leading-tight truncate">{p.name}</p>
                                                <p className="text-gray-500 text-[10px] font-bold mb-1">{calculateAge(p.dateOfBirth)} anos • {p.state}</p>
                                                <div className="flex items-center gap-2">
                                                    {statusBadge(p.status)}
                                                    {isSuperAdmin && <span className="text-[8px] font-black text-primary uppercase">{orgsMap[p.organizationId] || 'Produtora'}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 py-3 border-y border-white/5">
                                        <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-2 bg-pink-500/10 text-pink-500 rounded-xl font-black text-[10px] uppercase tracking-widest border border-pink-500/20 active:bg-pink-500 active:text-white transition-all"><InstagramIcon className="w-4 h-4" /> Instagram</a>
                                        <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-2 py-2 bg-green-500/10 text-green-500 rounded-xl font-black text-[10px] uppercase tracking-widest border border-green-500/20 active:bg-green-500 active:text-white transition-all"><WhatsAppIcon className="w-4 h-4" /> WhatsApp</a>
                                    </div>
                                    <div className="flex gap-2">
                                        {p.status === 'pending' && <button onClick={() => handleApprove(p)} className="flex-1 py-4 bg-green-600 text-white font-black text-[10px] uppercase rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-green-900/20 active:scale-95 transition-all"><CheckCircleIcon className="w-4 h-4" /> Aprovar</button>}
                                        {p.status === 'approved' && !p.hasJoinedGroup && <button onClick={() => handleSendApprovalManual(p)} className="flex-1 py-4 bg-indigo-600 text-white font-black text-[10px] uppercase rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 active:scale-95 transition-all"><WhatsAppIcon className="w-4 h-4" /> Avisar Aprovação</button>}
                                        <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="flex-1 py-4 bg-red-600 text-white font-black text-[10px] uppercase rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-red-900/20 active:scale-95 transition-all"><XIcon className="w-4 h-4" /> Rejeitar</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Paginação */}
                        <div className="mt-6 p-6 bg-secondary rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 flex justify-between items-center">
                            <button onClick={() => {
                                if (prevCursors.length === 0 || isLoading) return;
                                const newCursors = [...prevCursors];
                                newCursors.pop();
                                const prevCursor = newCursors.length > 0 ? newCursors[newCursors.length - 1] : null;
                                setPrevCursors(newCursors);
                                fetchData(prevCursor);
                            }} disabled={prevCursors.length === 0 || isLoading} className="px-6 py-2 bg-gray-800 text-gray-300 font-black text-[10px] uppercase rounded-xl hover:bg-gray-700 disabled:opacity-30 transition-all">Anterior</button>
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Página {prevCursors.length + 1}</span>
                            <button onClick={() => {
                                if (!hasMore || isLoading || !lastDoc) return;
                                setPrevCursors(prev => [...prev, lastDoc]);
                                fetchData(lastDoc);
                            }} disabled={!hasMore || isLoading} className="px-6 py-2 bg-primary text-white font-black text-[10px] uppercase rounded-xl hover:bg-primary-dark disabled:opacity-30 transition-all">Próxima</button>
                        </div>
                    </>
                )}
            </div>

            <PhotoViewerModal isOpen={photoViewer.isOpen} imageUrls={photoViewer.urls} startIndex={photoViewer.index} onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => setIsRejectionModalOpen(false)} onConfirm={handleRejectConfirm} reasons={rejectionReasons} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} promoter={selectedPromoter} onSave={async (id: string, data: any) => { await updatePromoter(id, data); fetchData(null); }} />
            <PromoterLookupModal isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} results={lookupResults} error={null} organizationsMap={orgsMap} onGoToPromoter={(p) => { setIsLookupModalOpen(false); setSearchQuery(p.email); setFilterStatus('all'); }} />
        </div>
    );
};
