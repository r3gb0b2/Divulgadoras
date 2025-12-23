
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
  PencilIcon, RefreshIcon, ArrowLeftIcon 
} from '../components/Icons';
import { stateMap, states } from '../constants/states';
import { useAdminAuth } from '../contexts/AdminAuthContext';

// Modais
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import EditPromoterModal from '../components/EditPromoterModal';
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import PromoterLookupModal from '../components/PromoterLookupModal';

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pt-BR');
};

export const AdminPanel: React.FC<{ adminData: AdminUserData }> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    
    // Dados Principais
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
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
            
            if (isSuperAdmin) {
                const map = allOrgs.reduce((acc, o) => ({ ...acc, [o.id]: o.name }), {});
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
        if (!selectedPromoter) return;
        try {
            await updatePromoter(selectedPromoter.id, { 
                status: allowEdit ? 'rejected_editable' : 'rejected', 
                rejectionReason: reason 
            });
            setIsRejectionModalOpen(false);
            fetchData();
        } catch (err: any) { alert(err.message); }
    };

    const handleLookup = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!lookupEmail.trim()) return;
        setIsLookingUp(true);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(lookupEmail);
            setLookupResults(results);
        } catch (err) { alert("Erro na busca."); } finally { setIsLookingUp(false); }
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

    const statusBadge = (status: PromoterStatus) => {
        const styles = {
            pending: "bg-blue-900/40 text-blue-400 border-blue-800",
            approved: "bg-green-900/40 text-green-400 border-green-800",
            rejected: "bg-red-900/40 text-red-400 border-red-800",
            rejected_editable: "bg-orange-900/40 text-orange-400 border-orange-800",
            removed: "bg-gray-800 text-gray-500 border-gray-700"
        };
        return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${styles[status]}`}>{status}</span>;
    };

    return (
        <div className="space-y-6 pb-20">
            {/* Header com Stats */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter">Divulgadoras</h1>
                <div className="flex flex-wrap gap-2">
                    <div className="px-4 py-2 bg-secondary border border-gray-700 rounded-xl text-center">
                        <p className="text-[10px] font-black text-gray-500 uppercase">Pendentes</p>
                        <p className="text-xl font-black text-blue-400">{stats.pending}</p>
                    </div>
                    <div className="px-4 py-2 bg-secondary border border-gray-700 rounded-xl text-center">
                        <p className="text-[10px] font-black text-gray-500 uppercase">Aprovadas</p>
                        <p className="text-xl font-black text-green-400">{stats.approved}</p>
                    </div>
                </div>
            </div>

            {/* Barra de Filtros e Busca */}
            <div className="bg-secondary p-6 rounded-3xl border border-white/5 shadow-xl space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="md:col-span-2 relative">
                        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                        <input 
                            type="text" 
                            placeholder="Buscar por nome, @instagram ou e-mail..." 
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-12 pr-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none font-medium"
                        />
                    </div>
                    
                    <form onSubmit={handleLookup} className="flex gap-2">
                         <input 
                            type="email" 
                            placeholder="Localizar E-mail..." 
                            value={lookupEmail}
                            onChange={e => setLookupEmail(e.target.value)}
                            className="flex-grow px-4 py-3 bg-dark border border-gray-700 rounded-2xl text-white text-sm focus:ring-2 focus:ring-primary outline-none"
                        />
                        <button type="submit" className="p-3 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-colors">
                            <SearchIcon className="w-5 h-5" />
                        </button>
                    </form>

                    <button onClick={fetchData} className="flex items-center justify-center gap-2 py-3 bg-gray-800 text-gray-300 rounded-2xl hover:bg-gray-700 transition-colors font-bold text-sm">
                        <RefreshIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} /> ATUALIZAR
                    </button>
                </div>

                <div className="flex flex-wrap gap-3 pt-4 border-t border-white/5">
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)} className="bg-dark border border-gray-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest outline-none focus:border-primary">
                        <option value="pending">⏳ Pendentes</option>
                        <option value="approved">✅ Aprovadas</option>
                        <option value="rejected">❌ Rejeitadas</option>
                        <option value="rejected_editable">⚠️ Corrigir</option>
                        <option value="all">🌐 Ver Tudo</option>
                    </select>

                    <select value={filterState} onChange={e => setFilterState(e.target.value)} className="bg-dark border border-gray-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest outline-none focus:border-primary">
                        <option value="all">Todos Estados</option>
                        {states.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                    </select>

                    <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="bg-dark border border-gray-700 text-gray-300 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest outline-none focus:border-primary max-w-[200px]">
                        <option value="all">Todas Campanhas</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>

                    <button onClick={() => setIsReasonsModalOpen(true)} className="px-4 py-2 text-[10px] font-black text-gray-500 uppercase tracking-widest hover:text-white transition-colors underline underline-offset-4">Configurar Motivos</button>
                </div>
            </div>

            {/* Lista Principal */}
            <div className="bg-secondary rounded-[2.5rem] border border-white/5 shadow-2xl overflow-hidden">
                {isLoading ? (
                    <div className="py-20 text-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div></div>
                ) : error ? (
                    <div className="p-10 text-center text-red-400">{error}</div>
                ) : filteredPromoters.length === 0 ? (
                    <div className="p-20 text-center text-gray-500 font-bold uppercase tracking-widest">Nenhum cadastro encontrado</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-dark/50 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] border-b border-white/5">
                                    <th className="px-6 py-5">Perfil</th>
                                    <th className="px-6 py-5">Redes Sociais</th>
                                    <th className="px-6 py-5">Evento/Estado</th>
                                    <th className="px-6 py-5">Status</th>
                                    <th className="px-6 py-5 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredPromoters.map(p => (
                                    <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-4">
                                                <div 
                                                    className="w-14 h-14 rounded-2xl overflow-hidden cursor-pointer border-2 border-transparent group-hover:border-primary/50 transition-all shadow-lg"
                                                    onClick={() => setPhotoViewer({ isOpen: true, urls: p.photoUrls, index: 0 })}
                                                >
                                                    <img src={p.facePhotoUrl || p.photoUrls[0]} alt="" className="w-full h-full object-cover" />
                                                </div>
                                                <div>
                                                    <p className="text-white font-bold text-base leading-none mb-1">{p.name}</p>
                                                    <p className="text-gray-500 text-xs font-mono">{p.email}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center gap-3">
                                                <a href={`https://instagram.com/${p.instagram}`} target="_blank" rel="noreferrer" className="p-2 bg-pink-500/10 text-pink-500 rounded-xl hover:bg-pink-500 hover:text-white transition-all">
                                                    <InstagramIcon className="w-5 h-5" />
                                                </a>
                                                <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="p-2 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all">
                                                    <WhatsAppIcon className="w-5 h-5" />
                                                </a>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="text-gray-300 font-bold text-sm uppercase tracking-tight">{p.campaignName || 'Geral'}</p>
                                            <p className="text-[10px] text-gray-500 font-black uppercase">{stateMap[p.state] || p.state}</p>
                                        </td>
                                        <td className="px-6 py-5">{statusBadge(p.status)}</td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                {p.status === 'pending' && (
                                                    <button onClick={() => handleApprove(p)} className="p-2 bg-green-600 text-white rounded-xl hover:bg-green-500 shadow-lg shadow-green-900/20" title="Aprovar">
                                                        <CheckCircleIcon className="w-5 h-5" />
                                                    </button>
                                                )}
                                                {(p.status === 'pending' || p.status === 'approved') && (
                                                    <button onClick={() => { setSelectedPromoter(p); setIsRejectionModalOpen(true); }} className="p-2 bg-red-600 text-white rounded-xl hover:bg-red-500 shadow-lg shadow-red-900/20" title="Rejeitar">
                                                        <XIcon className="w-5 h-5" />
                                                    </button>
                                                )}
                                                <button onClick={() => { setSelectedPromoter(p); setIsEditModalOpen(true); }} className="p-2 bg-gray-700 text-gray-300 rounded-xl hover:bg-gray-600" title="Editar/Ver Tudo">
                                                    <PencilIcon className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
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
