import React, { useState, useEffect, useMemo, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import { auth, functions } from '../firebase/config';
import { getAllPromoters, getPromoterStats, updatePromoter, deletePromoter, getRejectionReasons, findPromotersByEmail } from '../services/promoterService';
import { getOrganization, getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getAssignmentsForOrganization } from '../services/postService';
import { Promoter, AdminUserData, PromoterStatus, RejectionReason, Organization, Campaign, PostAssignment, Timestamp } from '../types';
import { states } from '../constants/states';
import { Link } from 'react-router-dom';
// FIX: Changed to a named import to resolve module export error.
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import PromoterLookupModal from '../components/PromoterLookupModal'; // Import the new modal
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon } from '../components/Icons';
import { useAdminAuth } from '../contexts/AdminAuthContext';

interface AdminPanelProps {
    adminData: AdminUserData;
}

const formatRelativeTime = (timestamp: any): string => {
  if (!timestamp) return 'N/A';
  const date = (timestamp as Timestamp).toDate ? (timestamp as Timestamp).toDate() : new Date(timestamp);
  if (isNaN(date.getTime())) return 'Data inválida';

  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const weeks = Math.round(days / 7);
  const months = Math.round(days / 30);
  const years = Math.round(days / 365);

  if (seconds < 60) return 'agora mesmo';
  if (minutes < 60) return `há ${minutes} min`;
  if (hours < 24) return `há ${hours}h`;
  if (days < 7) return `há ${days}d`;
  if (weeks < 4) return `há ${weeks} sem`;
  if (months < 12) return `há ${months} ${months > 1 ? 'meses' : 'mês'}`;
  return `há ${years} ${years > 1 ? 'anos' : 'ano'}`;
};

const calculateAge = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    const birthDate = new Date(dateString);
    // Adjust for timezone offset if the date is parsed as UTC but entered as local
    birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return `${age} anos`;
};

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return 'Data inválida';
    return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const getPerformanceColor = (rate: number): string => {
    if (rate < 0) return 'text-white'; // Default for no data
    if (rate === 100) return 'text-green-400';
    if (rate >= 60) return 'text-blue-400';
    if (rate >= 31) return 'text-yellow-400'; // Laranja
    return 'text-red-400';
};

export const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    const [allPromoters, setAllPromoters] = useState<Promoter[]>([]);
    const [allAssignments, setAllAssignments] = useState<PostAssignment[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<PromoterStatus | 'all'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [notifyingId, setNotifyingId] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Pagination state (client-side)
    const [currentPage, setCurrentPage] = useState(1);
    const PROMOTERS_PER_PAGE = 20;

    // State for super admin filters
    const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [selectedOrg, setSelectedOrg] = useState('all');
    const [selectedState, setSelectedState] = useState('all');
    const [selectedCampaign, setSelectedCampaign] = useState('all');
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'blue' | 'yellow' | 'red'>('all');

    // State for email lookup
    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
    const [lookupEmail, setLookupEmail] = useState('');
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupError, setLookupError] = useState<string | null>(null);


    // Modals state
    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
    const [photoViewerStartIndex, setPhotoViewerStartIndex] = useState(0);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
    
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [rejectingPromoter, setRejectingPromoter] = useState<Promoter | null>(null);

    const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);

    const isSuperAdmin = adminData.role === 'superadmin';
    const canManage = adminData.role === 'superadmin' || adminData.role === 'admin';

    const organizationIdForReasons = useMemo(() => {
        if (isSuperAdmin) {
            return selectedOrg !== 'all' ? selectedOrg : null;
        }
        return selectedOrgId || null;
    }, [isSuperAdmin, selectedOrg, selectedOrgId]);


    // Fetch static data (reasons, orgs, campaigns) once
    useEffect(() => {
        const fetchStaticData = async () => {
            try {
                let campaignsPromise;
                if (isSuperAdmin) {
                    campaignsPromise = getAllCampaigns();
                    const orgsData = await getOrganizations();
                    setAllOrganizations(orgsData.sort((a, b) => a.name.localeCompare(b.name)));
                } else if (selectedOrgId) {
                    campaignsPromise = getAllCampaigns(selectedOrgId);
                    const [reasonsData, orgData] = await Promise.all([
                        getRejectionReasons(selectedOrgId),
                        getOrganization(selectedOrgId),
                    ]);
                    setRejectionReasons(reasonsData);
                    setOrganization(orgData);
                } else {
                    campaignsPromise = Promise.resolve([]);
                }
                const campaignsData = await campaignsPromise;
                setAllCampaigns(campaignsData);
            } catch (err: any) {
                setError(err.message || 'Não foi possível carregar dados de suporte.');
            }
        };
        fetchStaticData();
    }, [adminData, isSuperAdmin, selectedOrgId]);

    const getStatesForScope = useCallback(() => {
        let statesForScope: string[] | null = null;
        if (!isSuperAdmin) {
            // Start with org-level states
            statesForScope = organization?.assignedStates || null;
            // Restrict to admin-specific states if they exist
            if (adminData.assignedStates && adminData.assignedStates.length > 0) {
                statesForScope = adminData.assignedStates;
            }
        }
        return statesForScope;
    }, [isSuperAdmin, adminData, organization]);

    const fetchAllData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        
        const orgId = isSuperAdmin ? undefined : selectedOrgId;
        if (!isSuperAdmin && !orgId) {
             setError("Nenhuma organização selecionada.");
             setIsLoading(false);
             setAllPromoters([]);
             setAllAssignments([]);
             return;
        }

        const orgIdForAssignments = isSuperAdmin 
            ? (selectedOrg !== 'all' ? selectedOrg : null) 
            : selectedOrgId;

        const statesForScope = getStatesForScope();

        try {
            const promises: Promise<any>[] = [
                getAllPromoters({
                    organizationId: orgId,
                    statesForScope,
                    status: filter,
                    assignedCampaignsForScope: isSuperAdmin ? undefined : adminData.assignedCampaigns,
                    selectedCampaign: selectedCampaign,
                    filterOrgId: selectedOrg,
                    filterState: selectedState,
                }),
                getPromoterStats({ organizationId: orgId, statesForScope }),
            ];

             if (orgIdForAssignments) {
                promises.push(getAssignmentsForOrganization(orgIdForAssignments));
            }

            const [promotersResult, statsResult, assignmentsResult] = await Promise.all(promises);
            
            setAllPromoters(promotersResult);
            setStats(statsResult);
            setAllAssignments(assignmentsResult || []);

        } catch(err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [adminData, organization, isSuperAdmin, filter, selectedOrg, selectedState, selectedCampaign, getStatesForScope, selectedOrgId]);


    // Fetch all promoters and stats based on filters
    useEffect(() => {
        fetchAllData();
    }, [fetchAllData]);


    // Reset page number whenever filters or search query change
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, selectedOrg, selectedState, selectedCampaign, searchQuery, colorFilter]);


    const handleUpdatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        if (!canManage) return;
        try {
            const currentPromoter = allPromoters.find(p => p.id === id);
            if (!currentPromoter) {
                console.error("Promoter to update not found.");
                return;
            }

            const updatedData = { ...data };

            // Only add audit fields if status is actually changing
            if (data.status && data.status !== currentPromoter.status) {
                updatedData.actionTakenByUid = adminData.uid;
                updatedData.actionTakenByEmail = adminData.email;
                updatedData.statusChangedAt = firebase.firestore.FieldValue.serverTimestamp();
            }
            
            await updatePromoter(id, updatedData);
            
            alert("Divulgadora atualizada com sucesso.");
            await fetchAllData(); // Refresh all data to ensure consistency

        } catch (error) {
            alert("Falha ao atualizar a divulgadora.");
            throw error;
        }
    };

    const handleGroupStatusChange = async (promoter: Promoter, hasJoined: boolean) => {
        if (hasJoined) {
            // If they are joining, just update the flag.
            await handleUpdatePromoter(promoter.id, { hasJoinedGroup: true });
        } else {
            // If they are leaving, confirm and then call the cloud function.
            if (window.confirm(`Tem certeza que deseja marcar "${promoter.name}" como fora do grupo? Isso a removerá de TODAS as publicações ativas para este evento.`)) {
                try {
                    const removePromoter = functions.httpsCallable('removePromoterFromAllAssignments');
                    await removePromoter({ promoterId: promoter.id });
                    
                    alert(`${promoter.name} foi removida do grupo e de todas as publicações designadas.`);
                    await fetchAllData(); // Refresh all data
    
                } catch (error: any) {
                    console.error("Failed to remove promoter from all assignments:", error);
                    alert(`Falha ao remover a divulgadora: ${error.message}`);
                }
            }
        }
    };
    
    const handleConfirmReject = async (reason: string, allowEdit: boolean) => {
        if (rejectingPromoter && canManage) {
            const newStatus = allowEdit ? 'rejected_editable' : 'rejected';
            await handleUpdatePromoter(rejectingPromoter.id, { status: newStatus, rejectionReason: reason });
        }
        setIsRejectionModalOpen(false);
        setRejectingPromoter(null);
    };

    const handleManualNotify = async (promoter: Promoter) => {
        if (notifyingId) return;
        if (!window.confirm("Isso enviará um e-mail de notificação para esta divulgadora com base no seu status atual (Aprovado). Deseja continuar?")) {
            return;
        }
        
        setNotifyingId(promoter.id);
        try {
            const manuallySendStatusEmail = functions.httpsCallable('manuallySendStatusEmail');
            const result = await manuallySendStatusEmail({ promoterId: promoter.id });
            const data = result.data as { success: boolean, message: string, provider?: string };
            const providerName = data.provider || 'Brevo (v9.2)';
            alert(`${data.message || 'Notificação enviada com sucesso!'} (Provedor: ${providerName})`);
            
            // On success, update the timestamp
            const updateData = { lastManualNotificationAt: firebase.firestore.FieldValue.serverTimestamp() };
            await updatePromoter(promoter.id, updateData);
            
            // Optimistic UI update for the timestamp
            setAllPromoters(prev => prev.map(p => 
                p.id === promoter.id 
                ? { ...p, lastManualNotificationAt: firebase.firestore.Timestamp.now() } as Promoter 
                : p
            ));

        } catch (error: any) {
            console.error("Failed to send manual notification:", error);
            const detailedError = error?.details?.originalError || error.message || 'Ocorreu um erro desconhecido.';
            const providerName = error?.details?.provider || 'Brevo (v9.2)';
            alert(`Falha ao enviar notificação: ${detailedError} (Tentativa via: ${providerName})`);
        } finally {
            setNotifyingId(null);
        }
    };

    const handleRemoveFromTeam = async (promoter: Promoter) => {
        if (!canManage) return;
        if (window.confirm(`Tem certeza que deseja remover ${promoter.name} da equipe? Esta ação mudará seu status para 'Removida', a removerá da lista de aprovadas e de todas as publicações ativas. Ela precisará fazer um novo cadastro para participar futuramente.`)) {
            setProcessingId(promoter.id);
            try {
                const setPromoterStatusToRemoved = functions.httpsCallable('setPromoterStatusToRemoved');
                await setPromoterStatusToRemoved({ promoterId: promoter.id });
                alert(`${promoter.name} foi removida com sucesso.`);
                await fetchAllData(); // Refresh the entire view
            } catch (err: any) {
                alert(`Falha ao remover divulgadora: ${err.message}`);
            } finally {
                setProcessingId(null);
            }
        }
    };

    const handleDeletePromoter = async (id: string) => {
        if (!isSuperAdmin) return;
        if (window.confirm("Tem certeza que deseja excluir esta inscrição? Esta ação não pode ser desfeita.")) {
            try {
                await deletePromoter(id);
                setAllPromoters(prev => prev.filter(p => p.id !== id));
                await fetchAllData(); // Refresh stats
            } catch (error) {
                alert("Falha ao excluir a inscrição.");
            }
        }
    };

    const openPhotoViewer = (urls: string[], startIndex: number) => {
        setPhotoViewerUrls(urls);
        setPhotoViewerStartIndex(startIndex);
        setIsPhotoViewerOpen(true);
    };

    const openEditModal = (promoter: Promoter) => {
        setEditingPromoter(promoter);
        setIsEditModalOpen(true);
    };

    const openRejectionModal = async (promoter: Promoter) => {
        if (isSuperAdmin && promoter.organizationId) {
            try {
                const reasons = await getRejectionReasons(promoter.organizationId);
                setRejectionReasons(reasons);
            } catch (e) {
                console.error("Failed to fetch rejection reasons for org:", promoter.organizationId, e);
                setRejectionReasons([]);
            }
        }
        setRejectingPromoter(promoter);
        setIsRejectionModalOpen(true);
    }
    
    const handleLogout = async () => {
        try {
            // FIX: Use compat signOut method.
            await auth.signOut();
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const organizationsMap = useMemo(() => {
        return allOrganizations.reduce((acc, org) => {
            acc[org.id] = org.name;
            return acc;
        }, {} as Record<string, string>);
    }, [allOrganizations]);

    const handleLookupPromoter = async () => {
        if (!lookupEmail.trim()) return;
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(lookupEmail);
            setLookupResults(results);
        } catch (err: any) {
            setLookupError(err.message);
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleGoToPromoter = (promoter: Promoter) => {
        setFilter(promoter.status);
        setSearchQuery(promoter.email);
        if (isSuperAdmin) {
            setSelectedOrg(promoter.organizationId);
            setSelectedState(promoter.state);
            setSelectedCampaign(promoter.campaignName || 'all');
        }
        setIsLookupModalOpen(false);
    };

    const promotersWithStats = useMemo(() => {
        if (allAssignments.length === 0) {
            return allPromoters.map(p => ({ ...p, completionRate: -1 }));
        }

        const statsMap = new Map<string, { assigned: number; completed: number }>();
        allAssignments.forEach(a => {
            const stat = statsMap.get(a.promoterId) || { assigned: 0, completed: 0 };
            stat.assigned++;
            if (a.proofSubmittedAt) {
                stat.completed++;
            }
            statsMap.set(a.promoterId, stat);
        });

        return allPromoters.map(p => {
            const stats = statsMap.get(p.id);
            const completionRate = stats && stats.assigned > 0
                ? Math.round((stats.completed / stats.assigned) * 100)
                : -1;
            return { ...p, completionRate };
        });
    }, [allPromoters, allAssignments]);


    // Memoized calculation for filtering and pagination
    const processedPromoters = useMemo(() => {
        // Sort all promoters by date first
        let sorted = [...promotersWithStats].sort((a, b) => {
            const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
            const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
            return timeB - timeA;
        });

        const lowercasedQuery = searchQuery.toLowerCase().trim();
        if (lowercasedQuery !== '') {
            sorted = sorted.filter(p => {
                // Standard text search on name, email, campaign
                const textSearch =
                    (p.name && String(p.name).toLowerCase().includes(lowercasedQuery)) ||
                    (p.email && String(p.email).toLowerCase().includes(lowercasedQuery)) ||
                    (p.campaignName && String(p.campaignName).toLowerCase().includes(lowercasedQuery));

                // Phone number search, only triggered if the search query contains digits
                const searchDigits = lowercasedQuery.replace(/\D/g, '');
                const phoneSearch =
                    searchDigits.length > 0 &&
                    p.whatsapp &&
                    String(p.whatsapp).replace(/\D/g, '').includes(searchDigits);

                return textSearch || phoneSearch;
            });
        }
        
        if (colorFilter !== 'all' && filter === 'approved') {
            sorted = sorted.filter(p => {
                const rate = (p as any).completionRate;
                if (rate < 0) return false;
                if (colorFilter === 'green') return rate === 100;
                if (colorFilter === 'blue') return rate >= 60 && rate < 100;
                if (colorFilter === 'yellow') return rate >= 31 && rate < 60;
                if (colorFilter === 'red') return rate >= 0 && rate <= 30;
                return true;
            });
        }

        // Apply pagination to the filtered results
        const startIndex = (currentPage - 1) * PROMOTERS_PER_PAGE;
        const paginated = sorted.slice(startIndex, startIndex + PROMOTERS_PER_PAGE);

        return {
            displayPromoters: paginated,
            totalFilteredCount: sorted.length,
        };
    }, [promotersWithStats, searchQuery, currentPage, colorFilter, filter]);
    
    const { displayPromoters, totalFilteredCount } = processedPromoters;
    
    // Pagination Calculations
    const pageCount = Math.ceil(totalFilteredCount / PROMOTERS_PER_PAGE);

    const handleNextPage = () => {
        if (currentPage < pageCount) {
            setCurrentPage(currentPage + 1);
        }
    };
    const handlePrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage + 1);
        }
    };

    const getStatusBadge = (status: PromoterStatus) => {
        const styles = {
            pending: "bg-yellow-900/50 text-yellow-300",
            approved: "bg-green-900/50 text-green-300",
            rejected: "bg-red-900/50 text-red-300",
            rejected_editable: "bg-orange-900/50 text-orange-300",
            removed: "bg-gray-700 text-gray-400",
        };
        const text = { pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado", rejected_editable: "Correção Solicitada", removed: "Removida" };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };


    if (isLoading && allPromoters.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }
    
    return (
        <div className="space-y-6">
            <div className="bg-secondary p-4 rounded-lg shadow-lg">
                 <div className="flex flex-col md:flex-row gap-4">
                    {/* Stats section */}
                    <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center md:w-1/3">
                        <button onClick={() => setFilter('pending')} className={`p-3 rounded-lg ${filter === 'pending' ? 'bg-primary' : 'bg-dark'}`}>
                            <h4 className="text-sm font-semibold text-gray-300">Pendentes</h4>
                            <p className="text-2xl font-bold">{stats.pending}</p>
                        </button>
                        <button onClick={() => setFilter('approved')} className={`p-3 rounded-lg ${filter === 'approved' ? 'bg-primary' : 'bg-dark'}`}>
                            <h4 className="text-sm font-semibold text-gray-300">Aprovadas</h4>
                            <p className="text-2xl font-bold">{stats.approved}</p>
                        </button>
                        <button onClick={() => setFilter('rejected')} className={`p-3 rounded-lg ${filter === 'rejected' ? 'bg-primary' : 'bg-dark'}`}>
                            <h4 className="text-sm font-semibold text-gray-300">Rejeitadas</h4>
                            <p className="text-2xl font-bold">{stats.rejected}</p>
                        </button>
                         <button onClick={() => setFilter('all')} className={`p-3 rounded-lg ${filter === 'all' ? 'bg-primary' : 'bg-dark'}`}>
                            <h4 className="text-sm font-semibold text-gray-300">Total</h4>
                            <p className="text-2xl font-bold">{stats.total}</p>
                        </button>
                    </div>
                    {/* Search and Manage section */}
                     <div className="flex-grow space-y-3">
                         <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Buscar por nome, e-mail, telefone ou evento..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700"
                            />
                         </div>
                         <div className="flex flex-col sm:flex-row gap-2">
                             <input
                                type="email"
                                placeholder="Buscar todos os cadastros por e-mail..."
                                value={lookupEmail}
                                onChange={(e) => setLookupEmail(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700"
                            />
                            <button onClick={handleLookupPromoter} disabled={isLookingUp} className="px-4 py-2 bg-indigo-600 text-white rounded-md whitespace-nowrap">
                                {isLookingUp ? 'Buscando...' : 'Buscar Global'}
                            </button>
                             {canManage && organizationIdForReasons && (
                                <button onClick={() => setIsReasonsModalOpen(true)} className="px-4 py-2 bg-gray-600 text-white rounded-md whitespace-nowrap flex items-center justify-center gap-2">
                                    <CogIcon className="w-5 h-5"/>
                                    <span>Gerenciar Motivos</span>
                                </button>
                             )}
                         </div>
                     </div>
                 </div>
                 {isSuperAdmin && (
                    <div className="mt-4 flex flex-col sm:flex-row gap-2 border-t border-gray-700 pt-3">
                        <select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)} className="w-full sm:w-1/3 px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                            <option value="all">Todas as Organizações</option>
                            {allOrganizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                        </select>
                        <select value={selectedState} onChange={(e) => setSelectedState(e.target.value)} className="w-full sm:w-1/3 px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                            <option value="all">Todos os Estados</option>
                            {Object.keys(states).map(abbr => <option key={abbr} value={abbr}>{states[abbr]}</option>)}
                        </select>
                        <select value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)} className="w-full sm:w-1/3 px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                            <option value="all">Todos os Eventos</option>
                             {allCampaigns.map(c => <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>)}
                        </select>
                    </div>
                 )}
                 {filter === 'approved' && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-gray-400 border-t border-gray-700 pt-3">
                        <div className="flex items-center gap-x-4">
                            <span className="font-semibold text-gray-300">Legenda de Aproveitamento:</span>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-400"></div><span>100%</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-400"></div><span>60-99%</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-yellow-400"></div><span>31-59%</span></div>
                            <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-red-400"></div><span>0-30%</span></div>
                        </div>
                         <div className="flex items-center gap-x-2">
                            <span className="font-semibold text-gray-300">Filtrar por Cor:</span>
                            <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                                {(['all', 'green', 'blue', 'yellow', 'red'] as const).map(f => (
                                    <button key={f} onClick={() => setColorFilter(f)} className={`px-2 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 ${colorFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                        {f !== 'all' && <div className={`w-2.5 h-2.5 rounded-full ${f === 'green' ? 'bg-green-400' : f === 'blue' ? 'bg-blue-400' : f === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'}`}></div>}
                                        <span>{{'all': 'Todos', 'green': 'Verde', 'blue': 'Azul', 'yellow': 'Laranja', 'red': 'Vermelho'}[f]}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                 )}
            </div>
            
            {error && <div className="text-red-400 p-2 text-center">{error}</div>}

            {displayPromoters.map(promoter => (
                <div key={promoter.id} className="bg-secondary p-4 rounded-lg shadow-lg flex flex-col md:flex-row gap-4">
                    <div className="flex-shrink-0 grid grid-cols-2 gap-2 w-full md:w-48">
                        {promoter.photoUrls.slice(0, 4).map((url, i) => (
                           <img
                            key={i}
                            src={url}
                            alt={`Foto ${i + 1}`}
                            className="w-full h-24 object-cover rounded-md cursor-pointer"
                            onClick={() => openPhotoViewer(promoter.photoUrls, i)}
                           />
                        ))}
                    </div>
                    <div className="flex-grow">
                        <div className="flex justify-between items-start">
                           <div>
                                <h3 className="text-lg font-bold">{promoter.name}, {calculateAge(promoter.dateOfBirth)}</h3>
                                <p className="text-sm text-gray-400">{promoter.email}</p>
                                <div className="flex items-center gap-4 mt-1">
                                    <a href={`https://wa.me/55${(promoter.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline flex items-center text-sm gap-1">
                                        <WhatsAppIcon className="w-4 h-4" />
                                        <span>WhatsApp</span>
                                    </a>
                                     <a href={`https://instagram.com/${(promoter.instagram || '').replace('@','')}`} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:underline flex items-center text-sm gap-1">
                                        <InstagramIcon className="w-4 h-4" />
                                        <span>Instagram</span>
                                    </a>
                                    {promoter.tiktok && (
                                         <a href={`https://tiktok.com/@${(promoter.tiktok || '').replace('@','')}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline flex items-center text-sm gap-1">
                                            <TikTokIcon className="w-4 h-4" />
                                            <span>TikTok</span>
                                        </a>
                                    )}
                                </div>
                           </div>
                           <div className="text-right">
                                {getStatusBadge(promoter.status)}
                                <p className="text-xs text-gray-500 mt-1">
                                    {isSuperAdmin && `${organizationsMap[promoter.organizationId] || promoter.organizationId} / `}
                                    {promoter.state} / {promoter.campaignName || 'Geral'}
                                </p>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formatRelativeTime(promoter.createdAt)}
                                </p>
                           </div>
                        </div>
                        {promoter.status === 'approved' && (
                             <div className="mt-2 text-sm font-bold" title="Aproveitamento em posts">
                                <span className={getPerformanceColor((promoter as any).completionRate)}>{(promoter as any).completionRate}% de aproveitamento</span>
                             </div>
                        )}
                        {promoter.observation && (
                            <div className="mt-2 p-2 bg-dark/70 rounded text-sm text-yellow-300">
                                <strong>Obs:</strong> {promoter.observation}
                            </div>
                        )}
                         {promoter.rejectionReason && (
                            <div className="mt-2 p-2 bg-dark/70 rounded text-sm text-red-300">
                                <strong>Motivo da rejeição:</strong> {promoter.rejectionReason}
                            </div>
                        )}
                    </div>
                    {canManage && (
                         <div className="flex-shrink-0 flex flex-row md:flex-col justify-start items-stretch gap-2">
                             {promoter.status === 'pending' || promoter.status === 'rejected_editable' ? (
                                <>
                                    <button onClick={() => handleUpdatePromoter(promoter.id, { status: 'approved' })} disabled={processingId === promoter.id} className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-md">Aprovar</button>
                                    <button onClick={() => openRejectionModal(promoter)} disabled={processingId === promoter.id} className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded-md">Rejeitar</button>
                                </>
                             ) : promoter.status === 'approved' ? (
                                <div className="flex flex-row md:flex-col gap-2">
                                    <button onClick={() => handleManualNotify(promoter)} disabled={notifyingId === promoter.id} className="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded-md">
                                        {notifyingId === promoter.id ? 'Enviando...' : 'Notificar'}
                                    </button>
                                    <button onClick={() => handleRemoveFromTeam(promoter)} disabled={processingId === promoter.id} className="w-full px-3 py-2 bg-red-800 text-white text-sm rounded-md">
                                        {processingId === promoter.id ? '...' : 'Remover'}
                                    </button>
                                </div>
                             ) : promoter.status === 'rejected' ? (
                                <button onClick={() => handleUpdatePromoter(promoter.id, { status: 'approved' })} disabled={processingId === promoter.id} className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-md">Re-aprovar</button>
                             ) : null}
                             <button onClick={() => openEditModal(promoter)} className="w-full px-3 py-2 bg-gray-600 text-white text-sm rounded-md mt-auto">Detalhes</button>
                             {isSuperAdmin && <button onClick={() => handleDeletePromoter(promoter.id)} className="w-full px-3 py-2 bg-black text-red-500 text-sm rounded-md">Excluir</button>}
                         </div>
                    )}
                </div>
            ))}
            {totalFilteredCount > PROMOTERS_PER_PAGE && (
                <div className="flex justify-center items-center gap-4 mt-6 text-sm">
                    <button onClick={handlePrevPage} disabled={currentPage === 1} className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50">Anterior</button>
                    <span>Página {currentPage} de {pageCount}</span>
                    <button onClick={handleNextPage} disabled={currentPage === pageCount} className="px-4 py-2 bg-gray-700 rounded disabled:opacity-50">Próxima</button>
                </div>
            )}
            
            {displayPromoters.length === 0 && !isLoading && <p className="text-center text-gray-400 py-8">Nenhuma divulgadora encontrada com os filtros atuais.</p>}

            <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={photoViewerStartIndex} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSave={handleUpdatePromoter} promoter={editingPromoter} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => setIsRejectionModalOpen(false)} onConfirm={handleConfirmReject} reasons={rejectionReasons} />
            {organizationIdForReasons && <ManageReasonsModal isOpen={isReasonsModalOpen} onClose={() => setIsReasonsModalOpen(false)} onReasonsUpdated={() => {}} organizationId={organizationIdForReasons} />}
            <PromoterLookupModal isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} error={lookupError} results={lookupResults} onGoToPromoter={handleGoToPromoter} organizationsMap={organizationsMap} />
        </div>
    );
};
