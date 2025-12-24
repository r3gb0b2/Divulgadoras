import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  getAllPromotersPaginated, 
  getPromoterStats, 
  updatePromoter, 
  getRejectionReasons, 
  findPromotersByEmail 
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
  PencilIcon, RefreshIcon 
} from '../components/Icons';
import { states } from '../constants/states';
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

const PAGE_SIZE = 30;

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    
    // Dados Principais e Paginação
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
    const [lastDoc, setLastDoc] = useState<any>(null);
    const [prevCursors, setPrevCursors] = useState<any[]>([]);
    const [hasMore, setHasMore] = useState(true);

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [orgsMap, setOrgsMap] = useState<Record<string, string>>({});

    // Estado da UI
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [filterState, setFilterState] = useState('all');
    const [filterStatus, setFilterStatus] = useState<PromoterStatus | 'all'>('pending');
    const [selectedCampaign, setSelectedCampaign] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    
    // Busca por E-mail
    const [lookupEmail, setLookupEmail] = useState('');
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);

    // Controle de Modais
    const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [photoViewer, setPhotoViewer] = useState<{ isOpen: boolean, urls: string[], index: number }>({ 
        isOpen: false, urls: [], index: 0 
    });

    const isSuperAdmin = adminData.role === 'superadmin';

    const fetchData = useCallback(async (cursor = null) => {
        const orgId = isSuperAdmin ? undefined : selectedOrgId;
        
        // Se não for superadmin e não tiver organização selecionada, não busca
        if (!isSuperAdmin && !orgId) {
            setIsLoading(false);
            setPromoters([]);
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
                pageSize: PAGE_SIZE,
                lastDoc: cursor
            };

            const [result, statsData, camps, reasons, allOrgs] = await Promise.all([
                getAllPromotersPaginated(options),
                getPromoterStats({ organizationId: orgId, filterState, selectedCampaign }),
                getAllCampaigns(orgId),
                orgId ? getRejectionReasons(orgId) : Promise.resolve([]),
                isSuperAdmin ? getOrganizations() : Promise.resolve([])
            ]);

            setPromoters(result.promoters);
            setLastDoc(result.lastDoc);
            setHasMore(result.promoters.length === PAGE_SIZE);
            setStats(statsData);
            setCampaigns(camps);
            setRejectionReasons(reasons);
            
            if (isSuperAdmin) {
                const map = (allOrgs as Organization[]).reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {} as Record<string, string>);
                setOrgsMap(map);
            }
        } catch (err: any) {
            console.error("Fetch Error:", err);
            setError(err.message || 'Falha técnica ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign, isSuperAdmin]);

    // Efeito para carregar dados quando filtros ou organização mudam
    useEffect(() => {
        setPrevCursors([]);
        setLastDoc(null);
        fetchData(null);
    }, [selectedOrgId, filterStatus, filterState, selectedCampaign]);

    const handleNextPage = () => {
        if (!hasMore || isLoading || !lastDoc) return;
        setPrevCursors(prev => [...prev, lastDoc]);
        fetchData(lastDoc);
    };

    const handlePrevPage = () => {
        if (prevCursors.length === 0 || isLoading) return;
        const newCursors = [...prevCursors];
        newCursors.pop(); // Remove o cursor da página atual
        const prevCursor = newCursors.length > 0 ? newCursors[newCursors.length - 1] : null;
        setPrevCursors(newCursors);
        fetchData(prevCursor);
    };

    // HANDLER DE APROVAÇÃO OTIMISTA
    const handleApprove = async (p: Promoter) => {
        if (!window.confirm(`Aprovar ${p.name}?`)) return;
        
        // Atualização Otimista: Remove da lista local e incrementa aprovados
        setPromoters(prev => prev.filter(item => item.id !== p.id));
        setStats(prev => ({ 
            ...prev, 
            pending: Math.max(0, prev.pending - 1), 
            approved: prev.approved + 1 
        }));

        try {
            await updatePromoter(p.id, { status: 'approved' });
        } catch (err: any) {
            console.error("Erro ao aprovar:", err);
            // Em caso de erro, reinicia a busca para sincronizar com o banco
            fetchData(null); 
        }
    };

    const handleRejectConfirm = async (reason: string, allowEdit: boolean) => {
        if (!selectedPromoter) return;
        setIsRejectionModalOpen(false);
        
        const statusToSet: PromoterStatus = allowEdit ? 'rejected_editable' : 'rejected';
        const pId = selectedPromoter.id;
        
        // Otimista
        setPromoters(prev => prev.filter(p => p.id !== pId));
        setStats(prev => ({
            ...prev,
            pending: Math.max(0, prev.pending - 1),
            rejected: prev.rejected + 1
        }));
        setSelectedPromoter(null);

        try {
            await updatePromoter(pId, { status: statusToSet, rejectionReason: reason });
        } catch (err: any) {
            console.error("Erro ao rejeitar:", err);
            fetchData(null);
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
        } catch (err: any) { 
            console.error("Lookup error:", err);
            alert("Erro na busca."); 
        } finally { 
            setIsLookingUp(false); 
        }
    };

    const filteredPromoters = useMemo(() => {
        if (!searchQuery) return promoters;
        const q = searchQuery.toLowerCase();
        return promoters.filter(p => 
            p.name.toLowerCase().includes(q) || 
            p.instagram.toLowerCase().includes(q) || 
            p.email.toLowerCase().includes(q)
        );
    }, [promoters, searchQuery]);

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

    return (
        <div className="space-y-6 pb-40 max-w-full overflow-x-hidden">
            {/* Header */}
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
                            placeholder="Pesquisar nesta página..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-11 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-1 focus:ring-primary outline-none font-medium"
                        />
                    </div>

                    <form onSubmit={handleLookup} className="flex gap-2 md:col-span-3">
                         <input 
                            type="email" 
                            placeholder="Localizar e-mail em todo banco..." 
                            value={lookupEmail}
                            onChange={e => setLookupEmail(e.target.value)}
                            className="flex-grow px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-xs focus:ring-1 focus:ring-primary outline-none"
                        />
                        <button type="submit" className="px-4 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-colors">
                            <SearchIcon className="w-4 h-4" />
                        </button>
                    </form>

                    <button onClick={() => fetchData(null)} className="flex items-center justify-center gap-2 py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700 transition-colors font-black text-[10px] uppercase tracking-widest">
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

            {/* Lista Principal */}
            <div className="bg-secondary rounded-[1.5rem] md:rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden mx-2 md:mx-0">
                {error && (
                    <div className="p-4 bg-red-900/20 border-b border-red-800 text-red-400 text-center text-xs font-bold uppercase tracking-widest animate-shake">
                        {error}
                    </div>
                )}

                {isLoading && promoters.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando banco de dados...</p>
                    </div>
                ) : filteredPromoters.length === 0 ? (
                    <div className="p-20 text-center text-gray-500 font-bold uppercase tracking-widest flex flex-col items-center gap-4">
                         <SearchIcon className="w-12 h-12 opacity-20" />
                         <span>{isLoading ? 'Carregando...' : 'Nenhum registro encontrado'}</span>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
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
                                            <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
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

                        {/* Paginação */}
                        <div className="p-6 bg-dark/20 border-t border-white/5 flex justify-between items-center">
                            <button 
                                onClick={handlePrevPage} 
                                disabled={prevCursors.length === 0 || isLoading}
                                className="px-6 py-2 bg-gray-800 text-gray-300 font-black text-[10px] uppercase rounded-xl hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Anterior
                            </button>
                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Página {prevCursors.length + 1}</span>
                            <button 
                                onClick={handleNextPage} 
                                disabled={!hasMore || isLoading}
                                className="px-6 py-2 bg-primary text-white font-black text-[10px] uppercase rounded-xl hover:bg-primary-dark disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                            >
                                Próxima
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Modais */}
            <PhotoViewerModal isOpen={photoViewer.isOpen} imageUrls={photoViewer.urls} startIndex={photoViewer.index} onClose={() => setPhotoViewer({ ...photoViewer, isOpen: false })} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => setIsRejectionModalOpen(false)} onConfirm={handleRejectConfirm} reasons={rejectionReasons} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} promoter={selectedPromoter} onSave={async (id, data) => { await updatePromoter(id, data); fetchData(null); }} />
            <PromoterLookupModal isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} results={lookupResults} error={null} organizationsMap={orgsMap} onGoToPromoter={(p) => { setIsLookupModalOpen(false); setSearchQuery(p.email); setFilterStatus('all'); }} />
        </div>
    );
};
