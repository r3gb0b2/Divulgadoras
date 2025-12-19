
import React, { useState, useEffect, useMemo, useCallback } from 'react';
// Fix: Added firebase import to use Timestamp as a value
import firebase from 'firebase/compat/app';
import { auth, firestore } from '../firebase/config';
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
import { Promoter, AdminUserData, PromoterStatus, RejectionReason, Organization, Campaign, Timestamp } from '../types';
import { states, stateMap } from '../constants/states';
import { useNavigate } from 'react-router-dom';
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import PromoterLookupModal from '../components/PromoterLookupModal';
import { 
    CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon, 
    CheckCircleIcon, XIcon, TrashIcon, SearchIcon, FilterIcon, RefreshIcon 
} from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';

interface AdminPanelProps {
    adminData: AdminUserData;
}

const formatRelativeTime = (timestamp: any): string => {
  if (!timestamp) return 'N/A';
  let date: Date;
  if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
  } else if (timestamp && typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
      date = new Date(timestamp.seconds * 1000);
  } else {
      date = new Date(timestamp);
  }
  
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  
  if (diffInSeconds < 60) return 'Agora mesmo';
  if (diffInSeconds < 3600) return `Há ${Math.floor(diffInSeconds / 60)} min`;
  if (diffInSeconds < 86400) return `Há ${Math.floor(diffInSeconds / 3600)} h`;
  return date.toLocaleDateString('pt-BR');
};

const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    const navigate = useNavigate();
    
    // Data State
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    
    // UI State
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<PromoterStatus | 'all'>('pending');
    const [selectedState, setSelectedState] = useState<string | 'all'>('all');
    const [selectedCampaign, setSelectedCampaign] = useState<string | 'all'>('all');
    
    // Modals State
    const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
    const [rejectingPromoter, setRejectingPromoter] = useState<Promoter | null>(null);
    const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);
    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
    
    // Lookup State
    const [lookupEmail, setLookupEmail] = useState('');
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookupLoading, setIsLookupLoading] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);

    const isSuperAdmin = adminData.role === 'superadmin';

    const loadData = useCallback(async () => {
        const orgId = isSuperAdmin ? undefined : selectedOrgId;
        if (!isSuperAdmin && !orgId) return;

        setIsLoading(true);
        setError('');
        try {
            const [fetchedPromoters, fetchedStats, fetchedReasons, fetchedCampaigns, fetchedOrgs] = await Promise.all([
                getAllPromoters({
                    organizationId: orgId,
                    status: statusFilter,
                    selectedCampaign: selectedCampaign,
                    filterOrgId: 'all',
                    filterState: selectedState,
                    statesForScope: isSuperAdmin ? null : adminData.assignedStates,
                }),
                getPromoterStats({
                    organizationId: orgId,
                    filterOrgId: 'all',
                    filterState: selectedState,
                    selectedCampaign: selectedCampaign,
                    statesForScope: isSuperAdmin ? null : adminData.assignedStates,
                }),
                getRejectionReasons(orgId || ''),
                getAllCampaigns(orgId),
                isSuperAdmin ? getOrganizations() : Promise.resolve([])
            ]);

            setPromoters(fetchedPromoters.sort((a, b) => (b.createdAt as any).seconds - (a.createdAt as any).seconds));
            setStats(fetchedStats);
            setRejectionReasons(fetchedReasons);
            setCampaigns(fetchedCampaigns.sort((a, b) => a.name.localeCompare(b.name)));
            setOrganizations(fetchedOrgs);
        } catch (err: any) {
            setError(err.message || 'Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, [isSuperAdmin, selectedOrgId, statusFilter, selectedState, selectedCampaign, adminData]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const handleApprove = async (promoter: Promoter) => {
        try {
            await updatePromoter(promoter.id, { 
                status: 'approved', 
                actionTakenByEmail: adminData.email,
                // Fix: Using firebase.firestore.Timestamp.now() instead of the type Timestamp
                statusChangedAt: firebase.firestore.Timestamp.now()
            });
            loadData();
        } catch (err: any) {
            alert('Erro ao aprovar: ' + err.message);
        }
    };

    const handleReject = async (reason: string, allowEdit: boolean) => {
        if (!rejectingPromoter) return;
        try {
            await updatePromoter(rejectingPromoter.id, { 
                status: allowEdit ? 'rejected_editable' : 'rejected', 
                rejectionReason: reason,
                actionTakenByEmail: adminData.email,
                // Fix: Using firebase.firestore.Timestamp.now() instead of the type Timestamp
                statusChangedAt: firebase.firestore.Timestamp.now()
            });
            setRejectingPromoter(null);
            loadData();
        } catch (err: any) {
            alert('Erro ao rejeitar: ' + err.message);
        }
    };

    const handleDelete = async (id: string) => {
        if (window.confirm('Deletar permanentemente este cadastro?')) {
            try {
                await deletePromoter(id);
                loadData();
            } catch (err: any) {
                alert('Erro ao deletar: ' + err.message);
            }
        }
    };

    const handleLookup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!lookupEmail.trim()) return;
        setIsLookupLoading(true);
        setLookupError(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(lookupEmail);
            setLookupResults(results);
        } catch (err: any) {
            setLookupError(String(err));
        } finally {
            setIsLookupLoading(false);
        }
    };

    const filteredPromoters = useMemo(() => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return promoters;
        return promoters.filter(p => 
            p.name.toLowerCase().includes(query) || 
            p.email.toLowerCase().includes(query) || 
            p.instagram.toLowerCase().includes(query)
        );
    }, [promoters, searchQuery]);

    const statsCards = [
        { label: 'Pendentes', value: stats.pending, color: 'text-yellow-400', filter: 'pending' as PromoterStatus },
        { label: 'Aprovadas', value: stats.approved, color: 'text-green-400', filter: 'approved' as PromoterStatus },
        { label: 'Rejeitadas', value: stats.rejected, color: 'text-red-400', filter: 'rejected' as PromoterStatus },
        { label: 'Removidas', value: stats.removed, color: 'text-gray-400', filter: 'removed' as PromoterStatus },
    ];

    return (
        <div className="space-y-6">
            {/* Header & Search */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h1 className="text-3xl font-bold text-white">Divulgadoras</h1>
                <form onSubmit={handleLookup} className="flex w-full md:w-auto gap-2">
                    <input 
                        type="email" 
                        placeholder="Buscar por e-mail..." 
                        value={lookupEmail}
                        onChange={e => setLookupEmail(e.target.value)}
                        className="bg-gray-700 border border-gray-600 rounded-md px-3 py-2 text-sm text-white w-full md:w-64"
                    />
                    <button type="submit" className="bg-primary hover:bg-primary-dark text-white p-2 rounded-md transition-colors">
                        <SearchIcon className="w-5 h-5" />
                    </button>
                </form>
            </div>

            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statsCards.map(card => (
                    <button 
                        key={card.label}
                        onClick={() => setStatusFilter(card.filter)}
                        className={`p-4 rounded-xl bg-secondary border-2 transition-all text-left ${statusFilter === card.filter ? 'border-primary shadow-lg shadow-primary/10' : 'border-gray-800'}`}
                    >
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{card.label}</p>
                        <p className={`text-3xl font-black mt-1 ${card.color}`}>{card.value}</p>
                    </button>
                ))}
            </div>

            {/* Filters Toolbar */}
            <div className="bg-secondary p-4 rounded-xl border border-gray-800 flex flex-col md:flex-row gap-4">
                <div className="flex-grow relative">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input 
                        type="text" 
                        placeholder="Filtrar nesta lista por nome ou Instagram..." 
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-dark rounded-md border border-gray-700 text-white focus:border-primary outline-none"
                    />
                </div>
                <div className="flex gap-2">
                    <select 
                        value={selectedState} 
                        onChange={e => setSelectedState(e.target.value)}
                        className="bg-dark border border-gray-700 rounded-md px-3 py-2 text-sm text-white"
                    >
                        <option value="all">Todos Estados</option>
                        {adminData.assignedStates.map(s => <option key={s} value={s}>{stateMap[s] || s}</option>)}
                    </select>
                    <select 
                        value={selectedCampaign} 
                        onChange={e => setSelectedCampaign(e.target.value)}
                        className="bg-dark border border-gray-700 rounded-md px-3 py-2 text-sm text-white max-w-[150px]"
                    >
                        <option value="all">Todos Eventos</option>
                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <button onClick={() => setIsReasonsModalOpen(true)} className="p-2 bg-gray-800 rounded-md text-gray-400 hover:text-white" title="Configurar Motivos">
                        <CogIcon className="w-5 h-5" />
                    </button>
                    <button onClick={loadData} className="p-2 bg-gray-800 rounded-md text-gray-400 hover:text-white" title="Atualizar">
                        <RefreshIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Main Table */}
            <div className="bg-secondary rounded-xl border border-gray-800 overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-800/50 text-gray-400 text-xs uppercase tracking-widest">
                                <th className="px-6 py-4 font-bold">Divulgadora</th>
                                <th className="px-6 py-4 font-bold">Redes / Contato</th>
                                <th className="px-6 py-4 font-bold">Evento / Estado</th>
                                <th className="px-6 py-4 font-bold">Cadastro</th>
                                <th className="px-6 py-4 font-bold text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {isLoading ? (
                                <tr><td colSpan={5} className="text-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div></td></tr>
                            ) : filteredPromoters.length === 0 ? (
                                <tr><td colSpan={5} className="text-center py-20 text-gray-500">Nenhum cadastro encontrado para estes filtros.</td></tr>
                            ) : filteredPromoters.map(p => (
                                <tr key={p.id} className="hover:bg-gray-800/30 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-4">
                                            <div className="relative flex-shrink-0 cursor-pointer" onClick={() => { setPhotoViewerUrls(p.photoUrls); setIsPhotoViewerOpen(true); }}>
                                                <img src={p.photoUrls[0] || 'https://via.placeholder.com/150'} alt="" className="w-12 h-12 rounded-lg object-cover ring-2 ring-gray-700 group-hover:ring-primary transition-all" />
                                                <span className="absolute -bottom-1 -right-1 bg-dark text-[10px] px-1 rounded border border-gray-600">+{p.photoUrls.length - 1}</span>
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-white font-bold truncate">{p.name}</p>
                                                <p className="text-gray-500 text-xs truncate">{p.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <a href={`https://instagram.com/${p.instagram?.replace('@','')}`} target="_blank" rel="noreferrer" className="text-pink-500 hover:text-pink-400"><InstagramIcon className="w-5 h-5"/></a>
                                            {p.tiktok && <a href={`https://tiktok.com/@${p.tiktok?.replace('@','')}`} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-white"><TikTokIcon className="w-5 h-5"/></a>}
                                            <a href={`https://wa.me/55${p.whatsapp?.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="text-green-500 hover:text-green-400"><WhatsAppIcon className="w-5 h-5"/></a>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-primary text-sm font-bold">{p.campaignName || 'Geral'}</p>
                                        <p className="text-gray-400 text-xs">{stateMap[p.state] || p.state}</p>
                                    </td>
                                    <td className="px-6 py-4">
                                        <p className="text-white text-xs font-mono">{formatRelativeTime(p.createdAt)}</p>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex justify-end gap-2">
                                            {p.status === 'pending' && (
                                                <>
                                                    <button onClick={() => handleApprove(p)} className="p-2 bg-green-600/20 text-green-500 rounded-md hover:bg-green-600 hover:text-white transition-all"><CheckCircleIcon className="w-5 h-5"/></button>
                                                    <button onClick={() => setRejectingPromoter(p)} className="p-2 bg-red-600/20 text-red-500 rounded-md hover:bg-red-600 hover:text-white transition-all"><XIcon className="w-5 h-5"/></button>
                                                </>
                                            )}
                                            <button onClick={() => setEditingPromoter(p)} className="p-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"><CogIcon className="w-5 h-5"/></button>
                                            <button onClick={() => handleDelete(p.id)} className="p-2 text-gray-500 hover:text-red-500"><TrashIcon className="w-5 h-5"/></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modals */}
            <EditPromoterModal 
                isOpen={!!editingPromoter} 
                promoter={editingPromoter} 
                onClose={() => setEditingPromoter(null)} 
                onSave={async (id, data) => { await updatePromoter(id, data); loadData(); }} 
            />
            
            <RejectionModal 
                isOpen={!!rejectingPromoter} 
                onClose={() => setRejectingPromoter(null)} 
                onConfirm={handleReject} 
                reasons={rejectionReasons} 
            />

            <ManageReasonsModal 
                isOpen={isReasonsModalOpen} 
                onClose={() => setIsReasonsModalOpen(false)} 
                organizationId={selectedOrgId || ''} 
                onReasonsUpdated={loadData} 
            />

            <PromoterLookupModal 
                isOpen={isLookupModalOpen} 
                onClose={() => setIsLookupModalOpen(false)} 
                isLoading={isLookupLoading} 
                error={lookupError} 
                results={lookupResults} 
                organizationsMap={organizations.reduce((acc, o) => ({...acc, [o.id]: o.name}), {})}
                onGoToPromoter={(p) => { 
                    setIsLookupModalOpen(false); 
                    setStatusFilter(p.status); 
                    setSearchQuery(p.email); 
                }} 
            />

            <PhotoViewerModal 
                isOpen={isPhotoViewerOpen} 
                onClose={() => setIsPhotoViewerOpen(false)} 
                imageUrls={photoViewerUrls} 
                startIndex={0} 
            />
        </div>
    );
};

export default AdminPanel;
