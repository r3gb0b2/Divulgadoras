
import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

const getDaysSince = (timestamp: any): string => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Cadastrada hoje';
    if (diffDays === 1) return 'Há 1 dia';
    return `Há ${diffDays} dias`;
};

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    
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

    const fetchData = useCallback(async () => {
        const orgId = isSuperAdmin ? undefined : selectedOrgId;
        if (!isSuperAdmin && !orgId) {
            setError("Nenhuma organização selecionada.");
            setIsLoading(false);
            return;
        }

        setIsLoading(true);
        setError('');
        try {
            const options = {
                organizationId: orgId,
                status: filterStatus,
                filterState: filterState,
                selectedCampaign: selectedCampaign,
                statesForScope: adminData.assignedStates,
                assignedCampaignsForScope: adminData.assignedCampaigns
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
            setSelectedIds(new Set()); // Limpa seleção ao atualizar
            
            if (isSuperAdmin) {
                // FIX: Added Record type to reduce accumulator to prevent indexing errors.
                const map = allOrgs.reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
                setOrgsMap(map);
            }
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign, adminData, isSuperAdmin]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handlers de Ação
    const handleApprove = async (p: Promoter) => {
        if (!window.confirm(`Aprovar ${p.name}?`)) return;
        try {
            await updatePromoter(p.id, { status: 'approved' });
            fetchData();
        } catch (err: any) { alert(err.message); }
    };

    const handleRejectConfirm = async (reason: string, allowEdit: boolean) => {
        // Lógica para rejeição individual ou em massa
        // FIX: Cast Array.from result to string[] to resolve "unknown" to "string" assignment error.
        const idsToProcess = selectedPromoter ? [selectedPromoter.id] : (Array.from(selectedIds) as string[]);
        
        if (idsToProcess.length === 0) return;

        setIsBulkProcessing(true);
        try {
            for (const id of idsToProcess) {
                await updatePromoter(id, { 
                    status: allowEdit ? 'rejected_editable' : 'rejected', 
                    rejectionReason: reason 
                });
            }
            setIsRejectionModalOpen(false);
            fetchData();
        } catch (err: any) { 
            alert("Erro ao processar um ou mais registros: " + err.message); 
        } finally {
            setIsBulkProcessing(false);
            setSelectedPromoter(null);
        }
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm(`Aprovar ${selectedIds.size} divulgadoras selecionadas?`)) return;

        setIsBulkProcessing(true);
        try {
            // FIX: Cast Array.from result to string[] to resolve "unknown" to "string" assignment error.
            for (const id of (Array.from(selectedIds) as string[])) {
                await updatePromoter(id, { status: 'approved' });
            }
            fetchData();
        } catch (err: any) {
            alert("Erro ao aprovar em massa: " + err.message);
        } finally {
            setIsBulkProcessing(false);
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
        } catch (err: any) { alert("Erro na busca."); } finally { setIsLookingUp(false); }
    };

    // Filtro Local Unificado (Pesquisa + Idade)
    const filteredPromoters = useMemo(() => {
        let list = promoters;

        // Filtro de Texto
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            list = list.filter(p => 
                p.name.toLowerCase().includes(q) || 
                p.instagram.toLowerCase().includes(q) || 
                p.email.toLowerCase().includes(q)
            );
        }

        // Filtro de Idade
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

    // Estados Disponíveis para Filtro (Baseado na Organização)
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
        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${c.style}`}>{c.label}</span>;
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
        <div className="space-y-6 pb-32">
            {/* Header com Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Divulgadoras</h1>
                <div className="flex flex-wrap gap-2">
                    <div className="px-3 py-1.5 bg-secondary border border-gray-700 rounded-xl text-center min-w-[80px]">
                        <p className="text-[9px] font-black text-gray-500 uppercase">Total</p>
                        <p className="text-lg font-black text-white">{stats.total}</p>
                    </div>
                    <div className="px-3 py-1.5 bg-secondary border border-gray-700 rounded-xl text-center min-w-[80px]">
                        <p className="text-[9px] font-black text-gray-500 uppercase">Pendentes</p>
                        <p className="text-lg font-black text-blue-400">{stats.pending}</p>
                    </div>
                </div>
            </div>

            {/* Barra de Filtros e Busca */}
            <div className="bg-secondary p-6 rounded-3xl border border-white/5 shadow-xl space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                    <div className="md:col-span-2 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Pesquisar nome, @insta ou e-mail..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>
                    
                    <div className="flex gap-2 items-center md:col-span-1">
                         <input 
                            type="number" 
                            placeholder="Idade Mín" 
                            value={minAge}
                            onChange={e => setMinAge(e.target.value)}
                            className="w-full px-3 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                        <input 
                            type="number" 
                            placeholder="Máx" 
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

                    <button onClick={fetchData} className="flex items-center justify-center gap-2 py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700 transition-colors font-black text-[10px] uppercase tracking-widest">
                        <RefreshIcon className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                    </button>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="pending">⏳ Pendentes</option>
                        <option value="approved">✅ Aprovadas</option>
                        <option value="rejected">❌ Rejeitadas</option>
                        <option value="rejected_editable">⚠️ Corrigir</option>
                        <option value="all">🌐 Ver Tudo</option>
                    </select>

                    <select value={filterState} onChange={e => setFilterState(e.target.value)} className="bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary">
                        <option value="all">Todos Estados</option>
                        {availableStates.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                    </select>

                    <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="bg-dark border border-gray-700 text-gray-300 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary max-w-[150px]">
                        <option value="all">Todas Campanhas</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>

                    <div className="ml-auto">
                        <button onClick={() => setIsReasonsModalOpen(true)} className="px-4 py-2 text-[9px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors underline underline-offset-4">Configurar Motivos</button>
                    </div>
                </div>
            </div>

            {/* BARRA DE AÇÃO EM MASSA (FLUTUANTE) */}
            {selectedIds.size > 0 && (
                <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[100] bg-primary text-white px-6 py-4 rounded-3xl shadow-2xl flex items-center gap-6 animate-slideUp">
                    <span className="text-sm font-black uppercase tracking-widest">{selectedIds.size} selecionadas</span>
                    <div className="h-6 w-[1px] bg-white/20"></div>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleBulkApprove} 
                            disabled={isBulkProcessing}
                            className="p-2 bg-green-500 rounded-xl hover:bg-green-400 transition-all active:scale-95 disabled:opacity-50"
                            title="Aprovar Selecionadas"
                        >
                            <CheckCircleIcon className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={() => { setSelectedPromoter(null); setIsRejectionModalOpen(true); }}
                            disabled={isBulkProcessing}
                            className="p-2 bg-red-500 rounded-xl hover:bg-red-400 transition-all active:scale-95 disabled:opacity-50"
                            title="Rejeitar Selecionadas"
                        >
                            <XIcon className="w-6 h-6" />
                        </button>
                        <button 
                            onClick={() => setSelectedIds(new Set())}
                            className="p-2 bg-white/10 rounded-xl hover:bg-white/20 transition-all"
                            title="Limpar Seleção"
                        >
                            <RefreshIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            )}

            {/* Lista Principal - Adaptada para Mobile */}
            <div className="bg-secondary rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
                {isLoading ? (
                    <div className="py-20 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div></div>
                ) : error ? (
                    <div className="p-10 text-center text-red-400">{error}</div>
                ) : filteredPromoters.length === 0 ? (
                    <div className="p-20 text-center text-gray-500 font-bold uppercase tracking-widest flex flex-col items-center gap-4">
                         <SearchIcon className="w-12 h-12 opacity-20" />
                         <span>Nenhuma divulgadora corresponde aos filtros</span>
                    </div>
                ) : (
                    <>
                        {/* VIEW DESKTOP: TABELA */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
                                        <th className="px-6 py-5 w-10">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedIds.size === filteredPromoters.length && filteredPromoters.length > 0} 
                                                onChange={toggleSelectAll} 
                                                className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-primary"
                                            />
                                        </th>
                                        <th className="px-6 py-5">Perfil</th>
                                        <th className="px-6 py-5">Redes Sociais</th>
                                        <th className="px-6 py-5">Evento / Origem</th>
                                        <th className="px-6 py-5">Status</th>
                                        <th className="px-6 py-5 text-right">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredPromoters.map(p => {
                                        const age = calculateAge(p.dateOfBirth);
                                        const daysAgo = getDaysSince(p.createdAt);
                                        return (
                                            <tr key={p.id} className={`hover:bg-white/[0.02] transition-colors group ${selectedIds.has(p.id) ? 'bg-primary/5' : ''}`}>
                                                <td className="px-6 py-5">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={selectedIds.has(p.id)} 
                                                        onChange={() => toggleSelect(p.id)} 
                                                        className="w-4 h-4 rounded border-gray-700 bg-dark text-primary focus:ring-primary"
                                                    />
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-5">
                                                        <div 
                                                            className="relative w-16 h-16 rounded-2xl overflow-hidden cursor-pointer border-2 border-gray-700 group-hover:border-primary transition-all flex-shrink-0"
                                                            onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls, index: 0 })}
                                                        >
                                                            <img src={p.facePhotoUrl || p.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                                                            <div className="absolute top-0.5 right-0.5 px-1 py-0.5 bg-black/60 rounded-lg">
                                                                <span className="text-[8px] font-black text-white">{age}a</span>
                                                            </div>
                                                        </div>
                                                        <div className="overflow-hidden">
                                                            <p className="text-white font-black text-sm truncate">{p.name}</p>
                                                            <p className="text-gray-500 text-[10px] truncate">{p.email}</p>
                                                            <span className="text-[8px] font-black text-gray-600 uppercase">{daysAgo}</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="p-2 bg-pink-500/10 text-pink-500 rounded-xl hover:bg-pink-500 hover:text-white transition-all" title="Instagram">
                                                            <InstagramIcon className="w-4 h-4" />
                                                        </a>
                                                        <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="p-2 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all" title="WhatsApp">
                                                            <WhatsAppIcon className="w-4 h-4" />
                                                        </a>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-5">
                                                    <p className="text-gray-300 font-bold text-[10px] uppercase truncate max-w-[120px]">{p.campaignName || 'Geral'}</p>
                                                    <p className="text-[8px] text-primary font-black uppercase">{p.state}</p>
                                                </td>
                                                <td className="px-6 py-5">{statusBadge(p.status)}</td>
                                                <td className="px-6 py-5 text-right">
                                                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                                        {p.status === 'pending' && (
                                                            <button onClick={() => handleApprove(p)} className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-500 transition-all" title="Aprovar">
                                                                <CheckCircleIcon className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        {(p.status === 'pending' || p.status === 'approved') && (
                                                            <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition-all" title="Rejeitar">
                                                                <XIcon className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                        <button onClick={() => { setSelectedPromoter(p); setIsEditModalOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-all" title="Editar">
                                                            <PencilIcon className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* VIEW MOBILE: CARDS (NOVA E RESPONSIVA) */}
                        <div className="md:hidden divide-y divide-white/5">
                            <div className="p-4 bg-dark/30 flex justify-between items-center">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedIds.size === filteredPromoters.length && filteredPromoters.length > 0} 
                                        onChange={toggleSelectAll} 
                                        className="w-5 h-5 rounded border-gray-700 bg-dark text-primary focus:ring-primary"
                                    />
                                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Selecionar Todas</span>
                                </label>
                            </div>
                            {filteredPromoters.map(p => {
                                const age = calculateAge(p.dateOfBirth);
                                return (
                                    <div key={p.id} className={`p-4 transition-colors ${selectedIds.has(p.id) ? 'bg-primary/10' : ''}`}>
                                        <div className="flex gap-4">
                                            {/* Checkbox e Foto */}
                                            <div className="flex flex-col gap-3 items-center">
                                                <input 
                                                    type="checkbox" 
                                                    checked={selectedIds.has(p.id)} 
                                                    onChange={() => toggleSelect(p.id)} 
                                                    className="w-6 h-6 rounded border-gray-600 bg-dark text-primary focus:ring-primary"
                                                />
                                                <div 
                                                    className="w-14 h-14 rounded-xl overflow-hidden border-2 border-gray-700"
                                                    onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls, index: 0 })}
                                                >
                                                    <img src={p.facePhotoUrl || p.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                                                </div>
                                            </div>

                                            {/* Dados e Info */}
                                            <div className="flex-grow min-w-0">
                                                <div className="flex justify-between items-start">
                                                    <p className="text-white font-black text-sm truncate uppercase tracking-tight">{p.name}</p>
                                                    {statusBadge(p.status)}
                                                </div>
                                                <p className="text-gray-500 text-[10px] font-mono mt-0.5 truncate">{p.email}</p>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                                                    <span className="text-[9px] font-black text-primary uppercase">{p.state} • {age} anos</span>
                                                    <span className="text-[9px] font-bold text-gray-400 uppercase truncate max-w-[100px]">{p.campaignName || 'Geral'}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* AÇÕES (GRID DE BOTÕES PARA MOBILE) */}
                                        <div className="grid grid-cols-5 gap-2 mt-4">
                                            <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="col-span-1 flex items-center justify-center p-2.5 bg-green-600/20 text-green-500 rounded-xl border border-green-600/30">
                                                <WhatsAppIcon className="w-5 h-5" />
                                            </a>
                                            <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="col-span-1 flex items-center justify-center p-2.5 bg-pink-600/20 text-pink-500 rounded-xl border border-pink-600/30">
                                                <InstagramIcon className="w-5 h-5" />
                                            </a>
                                            
                                            {p.status === 'pending' ? (
                                                <>
                                                    <button onClick={() => handleApprove(p)} className="col-span-1 flex items-center justify-center p-2.5 bg-green-600 text-white rounded-xl shadow-lg shadow-green-900/20">
                                                        <CheckCircleIcon className="w-5 h-5" />
                                                    </button>
                                                    <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="col-span-1 flex items-center justify-center p-2.5 bg-red-600 text-white rounded-xl shadow-lg shadow-red-900/20">
                                                        <XIcon className="w-5 h-5" />
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="col-span-2 flex items-center justify-center p-2.5 bg-red-600/40 text-white rounded-xl border border-red-600/50">
                                                    <TrashIcon className="w-5 h-5" />
                                                </button>
                                            )}
                                            
                                            <button onClick={() => { setSelectedPromoter(p); setIsEditModalOpen(true); }} className="col-span-1 flex items-center justify-center p-2.5 bg-gray-700 text-gray-300 rounded-xl">
                                                <PencilIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>

            {/* Modais */}
            <PhotoViewerModal 
                isOpen={photoViewer.isOpen} 
                imageUrls={photoViewer.urls} 
                startIndex={photoViewer.index} 
                onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} 
            />
            
            <RejectionModal 
                isOpen={isRejectionModalOpen} 
                onClose={() => setIsRejectionModalOpen(false)} 
                onConfirm={handleRejectConfirm} 
                reasons={rejectionReasons} 
            />
            
            {selectedOrgId && (
                <ManageReasonsModal 
                    isOpen={isReasonsModalOpen} 
                    onClose={() => setIsReasonsModalOpen(false)} 
                    organizationId={selectedOrgId} 
                    onReasonsUpdated={fetchData} 
                />
            )}

            <EditPromoterModal 
                isOpen={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                promoter={selectedPromoter} 
                onSave={async (id, data) => { await updatePromoter(id, data); fetchData(); }} 
            />

            <PromoterLookupModal 
                isOpen={isLookupModalOpen} 
                onClose={() => setIsLookupModalOpen(false)} 
                isLoading={isLookingUp} 
                results={lookupResults} 
                error={null} 
                organizationsMap={orgsMap} 
                onGoToPromoter={(p) => { 
                    setIsLookupModalOpen(false); 
                    setSearchQuery(p.email); 
                    setFilterStatus('all'); 
                }} 
            />
        </div>
    );
};
