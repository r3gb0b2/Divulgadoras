
import React, { useState, useEffect, useMemo } from 'react';
import { getAllPromoters, updatePromoter, findPromotersByEmail, getPromoterStats } from '../services/promoterService';
import { getAllCampaigns } from '../services/settingsService';
import { getOrganization } from '../services/organizationService';
import { Promoter, PromoterStatus, AdminUserData, Campaign, Organization } from '../types';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import RejectionModal from '../components/RejectionModal';
import EditPromoterModal from '../components/EditPromoterModal';
import PromoterLookupModal from '../components/PromoterLookupModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
import { WhatsAppIcon, InstagramIcon, FaceIdIcon, SearchIcon, RefreshIcon, CheckCircleIcon, XIcon, TrashIcon, UserIcon, ArrowLeftIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import firebase from 'firebase/compat/app';

// Helper function to safely format dates handling Firestore timestamps (including plain objects)
const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
        // Handle plain object { seconds: ..., nanoseconds: ... }
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR');
};

const formatRelativeTime = (timestamp: any): string => {
    if (!timestamp) return '';
    let date: Date;
    
    if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }

    if (isNaN(date.getTime())) return '';
    
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'agora mesmo';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `há ${diffInMinutes} min`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `há ${diffInHours} h`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `há ${diffInDays} dias`;
};

interface AdminPanelProps {
  adminData: AdminUserData;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
  const { selectedOrgId } = useAdminAuth();
  const [activeTab, setActiveTab] = useState<PromoterStatus | 'all'>('pending');
  const [allPromoters, setAllPromoters] = useState<Promoter[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
  const [organizationsMap, setOrganizationsMap] = useState<Record<string, string>>({});
  
  const [selectedCampaign, setSelectedCampaign] = useState<string>('all');
  const [selectedState, setSelectedState] = useState<string>('all');
  const [selectedOrgFilter, setSelectedOrgFilter] = useState<string>(selectedOrgId || 'all');

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Modals
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [rejectionTarget, setRejectionTarget] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
  const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [currentPhotoUrls, setCurrentPhotoUrls] = useState<string[]>([]);

  // Lookup
  const [lookupEmail, setLookupEmail] = useState('');
  const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Bulk Actions
  const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  const [isBulkRejection, setIsBulkRejection] = useState(false);

  const isSuperAdmin = adminData.role === 'superadmin';

  useEffect(() => {
    if (!selectedOrgId && !isSuperAdmin) {
        setError("Nenhuma organização selecionada.");
        setIsLoading(false);
        return;
    }
    if (selectedOrgId && !isSuperAdmin) {
        setSelectedOrgFilter(selectedOrgId);
    }
  }, [selectedOrgId, isSuperAdmin]);

  const fetchData = async () => {
    setIsLoading(true);
    setError(null);
    setSelectedPromoterIds(new Set()); // Reset selection on reload
    try {
        const orgIdToUse = isSuperAdmin ? selectedOrgFilter : selectedOrgId;
        
        // Parallel fetching
        const [promotersData, campaignsData, statsData] = await Promise.all([
            getAllPromoters({
                organizationId: orgIdToUse === 'all' ? undefined : orgIdToUse,
                statesForScope: isSuperAdmin ? undefined : adminData.assignedStates, // Filter by assigned states if regular admin
                status: activeTab,
                selectedCampaign: selectedCampaign,
                filterOrgId: selectedOrgFilter, // For superadmin override
                filterState: selectedState,
                assignedCampaignsForScope: adminData.assignedCampaigns
            }),
            getAllCampaigns(orgIdToUse === 'all' ? undefined : orgIdToUse),
            getPromoterStats({
                organizationId: orgIdToUse === 'all' ? undefined : orgIdToUse,
                statesForScope: isSuperAdmin ? undefined : adminData.assignedStates,
                filterOrgId: selectedOrgFilter,
                filterState: selectedState,
                selectedCampaign: selectedCampaign
            })
        ]);

        if (isSuperAdmin && Object.keys(organizationsMap).length === 0) {
             // Fetch org names for superadmin view only once
             // Note: This is an optimization, could move to separate effect
             const orgRef = await import('../services/organizationService');
             const orgs = await orgRef.getOrganizations();
             const map = orgs.reduce((acc, org) => ({...acc, [org.id]: org.name}), {});
             setOrganizationsMap(map);
        }

        setAllPromoters(promotersData);
        setCampaigns(campaignsData);
        setStats(statsData);
        
    } catch (err: any) {
        console.error("Error fetching admin data:", err);
        setError("Erro ao carregar dados. Verifique sua conexão.");
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab, selectedCampaign, selectedState, selectedOrgFilter, selectedOrgId]); // Dependencies for re-fetching

  // Helper for optimistic updates
  const handleUpdatePromoter = (id: string, updates: Partial<Promoter>) => {
      setAllPromoters(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
      
      // Update stats optimistically (approximation)
      setStats(prev => {
          const newStats = { ...prev };
          const promoter = allPromoters.find(p => p.id === id);
          if (!promoter) return prev; // Should not happen

          // Decrement old status count
          if (promoter.status === 'pending') newStats.pending--;
          else if (promoter.status === 'approved') newStats.approved--;
          else if (promoter.status === 'rejected' || promoter.status === 'rejected_editable') newStats.rejected--;
          else if (promoter.status === 'removed') newStats.removed--;

          // Increment new status count
          const newStatus = updates.status || promoter.status;
          if (newStatus === 'pending') newStats.pending++;
          else if (newStatus === 'approved') newStats.approved++;
          else if (newStatus === 'rejected' || newStatus === 'rejected_editable') newStats.rejected++;
          else if (newStatus === 'removed') newStats.removed++;

          return newStats;
      });
  };

  const handleApprove = async (id: string) => {
    const originalPromoter = allPromoters.find(p => p.id === id);
    // Optimistic Update
    handleUpdatePromoter(id, { 
        status: 'approved', 
        actionTakenByUid: adminData.uid, 
        actionTakenByEmail: adminData.email,
        statusChangedAt: { seconds: Math.floor(Date.now() / 1000) } as any // Temporary timestamp
    });

    try {
        await updatePromoter(id, {
            status: 'approved',
            actionTakenByUid: adminData.uid,
            actionTakenByEmail: adminData.email,
            statusChangedAt: firebase.firestore.Timestamp.now() as any // Actual Firestore Timestamp
        });
        // No alert, keep it smooth
    } catch (err: any) {
        console.error("Failed to approve:", err);
        alert("Falha ao aprovar. Revertendo alteração.");
        // Revert
        if (originalPromoter) handleUpdatePromoter(id, originalPromoter);
    }
  };

  const handleRejectClick = (id: string) => {
    setRejectionTarget(id);
    setIsBulkRejection(false);
    setIsRejectionModalOpen(true);
  };

  const handleConfirmReject = async (reason: string, allowEdit: boolean) => {
    if (isBulkRejection) {
        await handleBulkRejectProcess(reason, allowEdit);
        setIsRejectionModalOpen(false);
        return;
    }

    if (!rejectionTarget) return;
    const id = rejectionTarget;
    const newStatus = allowEdit ? 'rejected_editable' : 'rejected';
    const originalPromoter = allPromoters.find(p => p.id === id);

    // Optimistic Update
    handleUpdatePromoter(id, { 
        status: newStatus, 
        rejectionReason: reason,
        actionTakenByUid: adminData.uid, 
        actionTakenByEmail: adminData.email,
        statusChangedAt: { seconds: Math.floor(Date.now() / 1000) } as any
    });
    setIsRejectionModalOpen(false);

    try {
        await updatePromoter(id, {
            status: newStatus,
            rejectionReason: reason,
            actionTakenByUid: adminData.uid,
            actionTakenByEmail: adminData.email,
            statusChangedAt: firebase.firestore.Timestamp.now() as any
        });
    } catch (err: any) {
        console.error("Failed to reject:", err);
        alert("Falha ao rejeitar. Revertendo alteração.");
        if (originalPromoter) handleUpdatePromoter(id, originalPromoter);
    }
  };

  const handleRemove = async (promoter: Promoter) => {
      if (!confirm("Tem certeza que deseja remover esta divulgadora? Ela não aparecerá mais nas listas.")) return;
      const id = promoter.id;
      const originalPromoter = { ...promoter };

      // Optimistic
      handleUpdatePromoter(id, { status: 'removed' });

      try {
          // Use cloud function for full cleanup if needed, or simple update
          const setPromoterStatusToRemoved = httpsCallable(functions, 'setPromoterStatusToRemoved');
          await setPromoterStatusToRemoved({ promoterId: id });
      } catch (err: any) {
          console.error("Failed to remove:", err);
          alert("Falha ao remover. Revertendo.");
          handleUpdatePromoter(id, originalPromoter);
      }
  };

  // --- Bulk Actions ---

  const handleToggleSelect = (id: string) => {
      setSelectedPromoterIds(prev => {
          const newSet = new Set(prev);
          if (newSet.has(id)) newSet.delete(id);
          else newSet.add(id);
          return newSet;
      });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.checked) {
          const allIds = processedPromoters.map(p => p.id);
          setSelectedPromoterIds(new Set(allIds));
      } else {
          setSelectedPromoterIds(new Set());
      }
  };

  const handleBulkApprove = async () => {
      if (selectedPromoterIds.size === 0) return;
      if (!confirm(`Aprovar ${selectedPromoterIds.size} divulgadoras?`)) return;
      
      const ids = Array.from(selectedPromoterIds);
      // Optimistic Update for all
      ids.forEach(id => {
          handleUpdatePromoter(id, { 
            status: 'approved', 
            actionTakenByUid: adminData.uid,
            statusChangedAt: { seconds: Math.floor(Date.now() / 1000) } as any
          });
      });
      setSelectedPromoterIds(new Set()); // Clear selection immediately

      // Process in background
      try {
          const promises = ids.map(id => updatePromoter(id, {
              status: 'approved',
              actionTakenByUid: adminData.uid,
              actionTakenByEmail: adminData.email,
              statusChangedAt: firebase.firestore.Timestamp.now() as any
          }));
          await Promise.all(promises);
      } catch (e) {
          console.error("Error in bulk approve", e);
          // In a real app, we might show a toast saying "Some updates failed, refreshing..."
          fetchData(); 
      }
  };

  const handleBulkRejectClick = () => {
      if (selectedPromoterIds.size === 0) return;
      setIsBulkRejection(true);
      setIsRejectionModalOpen(true);
  };

  const handleBulkRejectProcess = async (reason: string, allowEdit: boolean) => {
      const ids = Array.from(selectedPromoterIds);
      const newStatus = allowEdit ? 'rejected_editable' : 'rejected';

      // Optimistic Update
      ids.forEach(id => {
          handleUpdatePromoter(id, { 
            status: newStatus, 
            rejectionReason: reason,
            actionTakenByUid: adminData.uid,
            statusChangedAt: { seconds: Math.floor(Date.now() / 1000) } as any
          });
      });
      setSelectedPromoterIds(new Set());

      try {
          const promises = ids.map(id => updatePromoter(id, {
              status: newStatus,
              rejectionReason: reason,
              actionTakenByUid: adminData.uid,
              actionTakenByEmail: adminData.email,
              statusChangedAt: firebase.firestore.Timestamp.now() as any
          }));
          await Promise.all(promises);
      } catch (e) {
          console.error("Error in bulk reject", e);
          fetchData();
      }
  };

  const handleBulkRemove = async () => {
      if (selectedPromoterIds.size === 0) return;
      if (!confirm(`Remover ${selectedPromoterIds.size} divulgadoras?`)) return;

      const ids = Array.from(selectedPromoterIds);
      ids.forEach(id => handleUpdatePromoter(id, { status: 'removed' }));
      setSelectedPromoterIds(new Set());

      try {
          const setPromoterStatusToRemoved = httpsCallable(functions, 'setPromoterStatusToRemoved');
          const promises = ids.map(id => setPromoterStatusToRemoved({ promoterId: id }));
          await Promise.all(promises);
      } catch (e) {
          console.error("Error in bulk remove", e);
          fetchData();
      }
  };

  // --- Search & Edit ---

  const handleLookupPromoter = async (emailToSearch?: string) => {
        const email = emailToSearch || lookupEmail;
        if (!email.trim()) return;
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(email.trim());
            setLookupResults(results);
        } catch (err: any) {
            let errorMessage = "Ocorreu um erro desconhecido";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'object' && err !== null && 'message' in err) {
                errorMessage = String((err as any).message);
            } else {
                errorMessage = String(err);
            }
            setLookupError(errorMessage);
        } finally {
            setIsLookingUp(false);
        }
    };

  const handleEditPromoter = (promoter: Promoter) => {
      setEditingPromoter(promoter);
      setIsEditModalOpen(true);
  };

  const handleSaveEdit = async (id: string, data: Partial<Promoter>) => {
      await updatePromoter(id, data);
      setEditingPromoter(null);
      setIsEditModalOpen(false);
      fetchData(); // Full refresh for edits to ensure consistency
  };

  const openPhotos = (urls: string[]) => {
      if (urls.length > 0) {
          setCurrentPhotoUrls(urls);
          setCurrentPhotoIndex(0);
          setIsPhotoViewerOpen(true);
      }
  };

  // Filter lists locally based on the fetched data (since `allPromoters` might contain more than current view if we implemented pagination later, but here it matches)
  const processedPromoters = useMemo(() => {
      return allPromoters.filter(p => {
          // Client-side status filter (important for optimistic UI updates to disappear from list)
          if (activeTab === 'rejected') {
              // 'rejected' tab shows both 'rejected' and 'rejected_editable'
              if (p.status !== 'rejected' && p.status !== 'rejected_editable') return false;
          } else if (activeTab === 'all') {
              // 'all' doesn't filter status
          } else {
              // Exact match for pending/approved
              if (p.status !== activeTab) return false;
          }
          return true;
      });
  }, [allPromoters, activeTab]);

  return (
    <div>
        {/* Header & Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
            <h1 className="text-3xl font-bold">Painel de Divulgadoras</h1>
            
            <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-grow md:flex-grow-0">
                    <input 
                        type="email" 
                        placeholder="Buscar por e-mail..." 
                        value={lookupEmail}
                        onChange={(e) => setLookupEmail(e.target.value)}
                        className="w-full pl-3 pr-10 py-2 bg-gray-700 border border-gray-600 rounded-md text-white focus:ring-primary focus:border-primary"
                        onKeyDown={(e) => e.key === 'Enter' && handleLookupPromoter()}
                    />
                    <button 
                        onClick={() => handleLookupPromoter()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                        <SearchIcon className="w-5 h-5" />
                    </button>
                </div>
                <button onClick={fetchData} className="p-2 bg-gray-600 rounded-md hover:bg-gray-500 text-white" title="Atualizar">
                    <RefreshIcon className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div onClick={() => setActiveTab('pending')} className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${activeTab === 'pending' ? 'bg-yellow-900/40 border-yellow-500' : 'bg-gray-800 border-transparent hover:bg-gray-700'}`}>
                <h3 className="text-gray-400 text-sm font-medium">Pendentes</h3>
                <p className="text-2xl font-bold text-yellow-400">{stats.pending}</p>
            </div>
            <div onClick={() => setActiveTab('approved')} className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${activeTab === 'approved' ? 'bg-green-900/40 border-green-500' : 'bg-gray-800 border-transparent hover:bg-gray-700'}`}>
                <h3 className="text-gray-400 text-sm font-medium">Aprovadas</h3>
                <p className="text-2xl font-bold text-green-400">{stats.approved}</p>
            </div>
            <div onClick={() => setActiveTab('rejected')} className={`p-4 rounded-lg cursor-pointer transition-all border-2 ${activeTab === 'rejected' ? 'bg-red-900/40 border-red-500' : 'bg-gray-800 border-transparent hover:bg-gray-700'}`}>
                <h3 className="text-gray-400 text-sm font-medium">Rejeitadas</h3>
                <p className="text-2xl font-bold text-red-400">{stats.rejected}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-800 border-2 border-transparent opacity-70">
                <h3 className="text-gray-400 text-sm font-medium">Total</h3>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
            </div>
        </div>

        {/* Action Bar / Filters */}
        <div className="bg-secondary p-4 rounded-t-lg border-b border-gray-700 flex flex-col md:flex-row gap-4 justify-between items-center sticky top-0 z-10 shadow-md">
            <div className="flex gap-4 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">
                <select 
                    value={selectedCampaign} 
                    onChange={(e) => setSelectedCampaign(e.target.value)} 
                    className="bg-gray-700 text-white text-sm rounded-md px-3 py-2 border border-gray-600 focus:outline-none focus:border-primary"
                >
                    <option value="all">Todos os Eventos</option>
                    {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                {/* State filter could go here if needed, omitting for brevity */}
            </div>

            {/* Bulk Actions Toolbar */}
            {selectedPromoterIds.size > 0 && (
                <div className="flex items-center gap-3 animate-fadeIn">
                    <span className="text-sm font-bold text-white bg-blue-600 px-2 py-1 rounded">{selectedPromoterIds.size} selecionados</span>
                    <button onClick={handleBulkApprove} className="p-2 bg-green-600 text-white rounded hover:bg-green-700 text-xs font-bold uppercase tracking-wider" title="Aprovar Selecionados">
                        <CheckCircleIcon className="w-5 h-5" />
                    </button>
                    <button onClick={handleBulkRejectClick} className="p-2 bg-red-600 text-white rounded hover:bg-red-700 text-xs font-bold uppercase tracking-wider" title="Rejeitar Selecionados">
                        <XIcon className="w-5 h-5" />
                    </button>
                    <button onClick={handleBulkRemove} className="p-2 bg-gray-600 text-white rounded hover:bg-gray-500 text-xs font-bold uppercase tracking-wider" title="Remover Selecionados">
                        <TrashIcon className="w-5 h-5" />
                    </button>
                </div>
            )}
        </div>

        {/* Content Area */}
        <div className="bg-secondary/50 p-4 min-h-[400px] rounded-b-lg">
            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                </div>
            ) : processedPromoters.length === 0 ? (
                <div className="text-center text-gray-400 py-20">
                    <p className="text-lg">Nenhuma divulgadora encontrada nesta categoria.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {processedPromoters.map(promoter => (
                        <div key={promoter.id} className={`bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-700 relative group transition-all hover:border-gray-500 ${selectedPromoterIds.has(promoter.id) ? 'ring-2 ring-primary bg-gray-750' : ''}`}>
                            {/* Selection Checkbox */}
                            <div className="absolute top-3 left-3 z-10">
                                <input 
                                    type="checkbox" 
                                    checked={selectedPromoterIds.has(promoter.id)} 
                                    onChange={() => handleToggleSelect(promoter.id)}
                                    className="w-5 h-5 rounded border-gray-500 bg-gray-900/80 text-primary focus:ring-primary cursor-pointer"
                                />
                            </div>

                            <div className="flex items-start gap-4 pl-8"> {/* Added padding for checkbox */}
                                <div className="flex-shrink-0 cursor-pointer" onClick={() => openPhotos(promoter.photoUrls)}>
                                    {promoter.photoUrls[0] ? (
                                        <img src={promoter.photoUrls[0]} alt={promoter.name} className="w-16 h-16 rounded-full object-cover border-2 border-gray-600 group-hover:border-primary transition-colors" />
                                    ) : (
                                        <div className="w-16 h-16 rounded-full bg-gray-700 flex items-center justify-center text-gray-500">
                                            <UserIcon className="w-8 h-8" />
                                        </div>
                                    )}
                                    {promoter.facePhotoUrl && (
                                        <div className="absolute top-10 left-12 bg-blue-600 rounded-full p-1 border border-black" title="Reconhecimento Facial">
                                            <FaceIdIcon className="w-3 h-3 text-white" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-grow min-w-0">
                                    <h3 className="font-bold text-white truncate" title={promoter.name}>{promoter.name}</h3>
                                    <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                                        <p>{promoter.campaignName || 'Geral'}</p>
                                        <div className="flex items-center gap-3">
                                            {promoter.instagram && (
                                                <a href={`https://instagram.com/${promoter.instagram.replace('@','')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-primary">
                                                    <InstagramIcon className="w-3 h-3" /> {promoter.instagram}
                                                </a>
                                            )}
                                            {promoter.whatsapp && (
                                                <a href={`https://wa.me/55${promoter.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-green-400">
                                                    <WhatsAppIcon className="w-3 h-3" /> WhatsApp
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Info & Status */}
                            <div className="mt-4 pt-3 border-t border-gray-700 flex justify-between items-center text-xs text-gray-500">
                                <span>{formatRelativeTime(promoter.createdAt)}</span>
                                <div className="flex items-center gap-2">
                                    {promoter.status === 'approved' && promoter.hasJoinedGroup && (
                                        <span className="text-green-400 font-semibold" title="Entrou no Grupo">No Grupo</span>
                                    )}
                                    {promoter.status === 'rejected_editable' && (
                                        <span className="text-orange-400 font-semibold">Correção Pend.</span>
                                    )}
                                </div>
                            </div>

                            {/* Actions Overlay */}
                            <div className="mt-4 flex gap-2">
                                {activeTab === 'pending' && (
                                    <>
                                        <button onClick={() => handleApprove(promoter.id)} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-sm font-semibold transition-colors">Aprovar</button>
                                        <button onClick={() => handleRejectClick(promoter.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-sm font-semibold transition-colors">Rejeitar</button>
                                    </>
                                )}
                                {activeTab === 'approved' && (
                                    <button onClick={() => handleRemove(promoter)} className="flex-1 bg-gray-700 hover:bg-red-600 text-gray-300 hover:text-white py-1.5 rounded text-sm font-semibold transition-colors">Remover</button>
                                )}
                                {activeTab === 'rejected' && (
                                    <button onClick={() => handleApprove(promoter.id)} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-sm font-semibold transition-colors">Reconsiderar</button>
                                )}
                                <button onClick={() => handleEditPromoter(promoter)} className="px-3 bg-gray-700 hover:bg-gray-600 text-white rounded transition-colors" title="Editar / Detalhes">
                                    ...
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>

        {/* Modals */}
        <RejectionModal 
            isOpen={isRejectionModalOpen} 
            onClose={() => setIsRejectionModalOpen(false)} 
            onConfirm={handleConfirmReject}
            reasons={[]} // Pass fetched reasons if implemented
        />
        <EditPromoterModal 
            isOpen={isEditModalOpen} 
            onClose={() => setIsEditModalOpen(false)} 
            promoter={editingPromoter} 
            onSave={handleSaveEdit} 
        />
        <PromoterLookupModal 
            isOpen={isLookupModalOpen} 
            onClose={() => setIsLookupModalOpen(false)} 
            isLoading={isLookingUp} 
            error={lookupError} 
            results={lookupResults} 
            onGoToPromoter={(p) => {
                // Implement navigation logic or highlight
                setIsLookupModalOpen(false);
                handleEditPromoter(p);
            }} 
            organizationsMap={organizationsMap} 
        />
        <PhotoViewerModal 
            isOpen={isPhotoViewerOpen} 
            onClose={() => setIsPhotoViewerOpen(false)} 
            imageUrls={currentPhotoUrls} 
            startIndex={currentPhotoIndex} 
        />
    </div>
  );
};

export default AdminPanel;
