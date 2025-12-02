
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import firebase from 'firebase/compat/app';
import { auth, functions } from '../firebase/config';
import { getAllPromoters, getPromoterStats, updatePromoter, deletePromoter, getRejectionReasons, findPromotersByEmail } from '../services/promoterService';
import { getOrganization, getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getAssignmentsForOrganization } from '../services/postService';
import { Promoter, AdminUserData, PromoterStatus, RejectionReason, Organization, Campaign, PostAssignment, Timestamp } from '../types';
import { states, stateMap } from '../constants/states';
import { Link, useNavigate } from 'react-router-dom';
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import PromoterLookupModal from '../components/PromoterLookupModal'; // Import the new modal
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon, BuildingOfficeIcon, LogoutIcon, ArrowLeftIcon, CheckCircleIcon, XIcon, TrashIcon } from '../components/Icons';
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

const getAgeAsNumber = (dateString: string | undefined): number | null => {
    if (!dateString) return null;
    try {
        const birthDate = new Date(dateString);
        birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
        if (isNaN(birthDate.getTime())) return null;

        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    } catch (e) {
        return null;
    }
};

const formatDate = (timestamp: any): string => {
    if (!timestamp) return 'N/A';
    let date: Date;
    if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } else if (timestamp && typeof timestamp === 'object' && typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }

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

// Helper to safely convert various date formats to a Date object, needed for stats calculation
const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const getActionLabel = (status: PromoterStatus) => {
    switch (status) {
        case 'approved': return 'Aprovado por';
        case 'rejected': return 'Rejeitado por';
        case 'rejected_editable': return 'Correção solicitada por';
        case 'removed': return 'Removido por';
        default: return 'Atualizado por';
    }
};

const PromoterHistoryBadge: React.FC<{ promoter: Promoter, allPromoters: Promoter[], onClick: (email: string) => void }> = ({ promoter, allPromoters, onClick }) => {
    if (promoter.status !== 'pending' && promoter.status !== 'rejected_editable') {
        return null;
    }

    const otherProfiles = allPromoters.filter(p => p.email === promoter.email && p.id !== promoter.id);

    if (otherProfiles.length === 0) {
        return null;
    }

    const isApprovedElsewhere = otherProfiles.some(p => p.status === 'approved');

    if (isApprovedElsewhere) {
        return (
            <button
                onClick={() => onClick(promoter.email)}
                className="mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-900/50 text-blue-300 inline-block hover:bg-blue-800/50 transition-colors"
                title="Clique para ver outros cadastros.">
                Já aprovada em outro evento
            </button>
        );
    }

    return (
        <button
            onClick={() => onClick(promoter.email)}
            className="mt-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-600 text-gray-300 inline-block hover:bg-gray-500 transition-colors"
            title="Clique para ver outros cadastros.">
            Possui outros cadastros
        </button>
    );
};


export const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
    const { selectedOrgId } = useAdminAuth();
    const navigate = useNavigate();

    const [allPromoters, setAllPromoters] = useState<Promoter[]>([]);
    const [allAssignments, setAllAssignments] = useState<PostAssignment[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<PromoterStatus | 'all'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [notifyingId, setNotifyingId] = useState<string | null>(null);
    const [processingId, setProcessingId] = useState<string | null>(null);

    // Bulk Actions State
    const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isBulkRejection, setIsBulkRejection] = useState(false);

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
    const [minAge, setMinAge] = useState('');
    const [maxAge, setMaxAge] = useState('');

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

    // Add function to refresh reasons when modal updates them
    const refreshReasons = async () => {
        if (organizationIdForReasons) {
            try {
                const reasonsData = await getRejectionReasons(organizationIdForReasons);
                setRejectionReasons(reasonsData);
            } catch (e) {
                console.error("Failed to refresh rejection reasons", e);
            }
        }
    };

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
        setSelectedPromoterIds(new Set()); // Clear selection on refresh/filter change
        
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
                getPromoterStats({
                    organizationId: orgId,
                    statesForScope,
                    filterOrgId: selectedOrg,
                    filterState: selectedState,
                    selectedCampaign: selectedCampaign,
                }),
            ];

             if (orgIdForAssignments) {
                promises.push(getAssignmentsForOrganization(orgIdForAssignments));
            }

            const [promotersResult, statsResult, assignmentsResult] = await Promise.all(promises);
            
            setAllPromoters(promotersResult);
            setStats(statsResult);
            setAllAssignments(assignmentsResult || []);

        } catch(err: any) {
            setError(err.message || "Erro desconhecido.");
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
        setSelectedPromoterIds(new Set()); // Clear selection when filters change
    }, [filter, selectedOrg, selectedState, selectedCampaign, searchQuery, colorFilter, minAge, maxAge]);

    const campaignsForFilter = useMemo(() => {
        if (selectedState === 'all') {
            return allCampaigns;
        }
        return allCampaigns.filter(c => c.stateAbbr === selectedState);
    }, [allCampaigns, selectedState]);

    const activeCampaignNames = useMemo(() => {
        return new Set(allCampaigns.filter(c => c.status === 'active').map(c => c.name));
    }, [allCampaigns]);

    const filteredPromotersFromSource = useMemo(() => {
        // If a specific campaign is selected, we show all promoters from it, regardless of the campaign's status.
        if (selectedCampaign !== 'all') {
            return allPromoters; // The service layer already filtered by the selected campaign.
        }

        // If "All Events" is selected, filter out promoters from inactive/hidden campaigns.
        return allPromoters.filter(promoter => {
            // Keep promoters with no specific campaign (general)
            if (!promoter.campaignName) {
                return true;
            }
            // Keep promoters whose campaign is active
            return activeCampaignNames.has(promoter.campaignName);
        });
    }, [allPromoters, selectedCampaign, activeCampaignNames]);


    const handleUpdatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        if (!canManage) return;

        // 1. Store previous state for rollback
        const previousPromoters = [...allPromoters];

        // 2. Prepare Optimistic Data
        const actionData = {
            actionTakenByUid: adminData.uid,
            actionTakenByEmail: adminData.email,
            statusChangedAt: { seconds: Date.now() / 1000 } as any // Client-side timestamp
        };

        const optimisticUpdate = { ...data };
        // Only add audit fields if status is changing
        if (data.status) {
            Object.assign(optimisticUpdate, actionData);
        }

        // 3. Optimistic Update: Update UI Immediately
        setAllPromoters(prev => prev.map(p => {
            if (p.id === id) {
                return { ...p, ...optimisticUpdate };
            }
            return p;
        }));

        // 4. Update Stats Locally (Simple increment/decrement)
        setStats(prev => {
            const currentPromoter = previousPromoters.find(p => p.id === id);
            if (!currentPromoter) return prev;
            
            const oldStatus = currentPromoter.status;
            const newStatus = data.status;

            if (!newStatus || oldStatus === newStatus) return prev;

            const newStats = { ...prev };
            
            // Decrement old logic (Updated)
            if (oldStatus === 'pending') newStats.pending--;
            else if (oldStatus === 'approved') newStats.approved--;
            else if (oldStatus === 'rejected' || oldStatus === 'rejected_editable') newStats.rejected--;
            else if (oldStatus === 'removed') newStats.removed--;

            // Increment new logic (Updated)
            if (newStatus === 'pending') newStats.pending++;
            else if (newStatus === 'approved') newStats.approved++;
            else if (newStatus === 'rejected' || newStatus === 'rejected_editable') newStats.rejected++;
            else if (newStatus === 'removed') newStats.removed++;

            return newStats;
        });

        // 5. Close Modals immediately if they are open (for better UX)
        setIsEditModalOpen(false); 
        setIsRejectionModalOpen(false);

        try {
            // 6. Perform Actual API Call
            // We include the audit fields here as well to ensure server data is correct
            const updatePayload = { ...data };
            if (data.status) {
                Object.assign(updatePayload, {
                    actionTakenByUid: adminData.uid,
                    actionTakenByEmail: adminData.email,
                    statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            await updatePromoter(id, updatePayload);
            // Success! No need to alert or refresh, UI is already up to date.

        } catch (error) {
            // 7. Rollback on Error
            console.error("Update failed, rolling back", error);
            setAllPromoters(previousPromoters);
            // You might want to revert stats too if you are implementing complex rollback
            alert("Falha ao atualizar a divulgadora. As alterações foram revertidas.");
        }
    };

    // --- Bulk Action Handlers ---

    const handleToggleSelect = (id: string) => {
        setSelectedPromoterIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleSelectAll = (visibleIds: string[]) => {
        if (selectedPromoterIds.size === visibleIds.length) {
            setSelectedPromoterIds(new Set()); // Deselect all if all visible are selected
        } else {
            setSelectedPromoterIds(new Set(visibleIds)); // Select all visible
        }
    };

    const handleBulkUpdate = async (updateData: Partial<Omit<Promoter, 'id'>>, actionType: 'approve' | 'reject' | 'remove') => {
        if (!canManage || selectedPromoterIds.size === 0) return;
        
        setIsBulkProcessing(true);
        const idsToUpdate = Array.from(selectedPromoterIds);
        
        // 1. Store previous state for rollback
        const previousPromoters = [...allPromoters];

        // 2. Prepare Optimistic Update
        const optimisticUpdate = { ...updateData };
        if (updateData.status) {
            Object.assign(optimisticUpdate, {
                actionTakenByUid: adminData.uid,
                actionTakenByEmail: adminData.email,
                statusChangedAt: { seconds: Date.now() / 1000 } as any
            });
        }

        // 3. Optimistic UI Update
        setAllPromoters(prev => prev.map(p => {
            if (idsToUpdate.includes(p.id)) {
                return { ...p, ...optimisticUpdate };
            }
            return p;
        }));

        // 4. Optimistic Stats Update
        setStats(prev => {
            const newStats = { ...prev };
            idsToUpdate.forEach(id => {
                const currentPromoter = previousPromoters.find(p => p.id === id);
                if (currentPromoter) {
                    const oldStatus = currentPromoter.status;
                    const newStatus = updateData.status;
                    
                    if (oldStatus !== newStatus && newStatus) {
                        // Decrement
                        if (oldStatus === 'pending') newStats.pending--;
                        else if (oldStatus === 'approved') newStats.approved--;
                        else if (oldStatus === 'rejected' || oldStatus === 'rejected_editable') newStats.rejected--;
                        else if (oldStatus === 'removed') newStats.removed--;
                        // Increment
                        if (newStatus === 'pending') newStats.pending++;
                        else if (newStatus === 'approved') newStats.approved++;
                        else if (newStatus === 'rejected' || newStatus === 'rejected_editable') newStats.rejected++;
                        else if (newStatus === 'removed') newStats.removed++;
                    }
                }
            });
            return newStats;
        });

        // Clear Selection & Close Modals
        setSelectedPromoterIds(new Set());
        setIsRejectionModalOpen(false);
        setIsBulkRejection(false);

        // 5. API Calls in Background
        try {
            const updatePayload = { ...updateData };
            if (updateData.status) {
                Object.assign(updatePayload, {
                    actionTakenByUid: adminData.uid,
                    actionTakenByEmail: adminData.email,
                    statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            // Using separate calls for better error handling/retry logic if needed, or batching.
            // Since `updatePromoter` handles cloud function triggers individually, we loop.
            const promises = idsToUpdate.map(id => updatePromoter(id, updatePayload));
            
            // If action is remove, we also need to call the specific remove function
            if (actionType === 'remove') {
                const removePromises = idsToUpdate.map(id => {
                    const setPromoterStatusToRemoved = functions.httpsCallable('setPromoterStatusToRemoved');
                    return setPromoterStatusToRemoved({ promoterId: id });
                });
                await Promise.all(removePromises);
            } else {
                await Promise.all(promises);
            }

        } catch (error) {
            console.error("Bulk update failed partially or fully", error);
            // In a real robust app, we'd handle partial failures. For now, revert all on catastrophic failure or warn.
            // setAllPromoters(previousPromoters); // Revert is risky if some succeeded.
            alert("Houve um erro ao processar alguns itens. Por favor, atualize a página para ver o estado real.");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleBulkRejectClick = () => {
        setIsBulkRejection(true);
        // We pass a dummy promoter or null, but the modal needs reasons.
        // If we are superadmin, we might need to fetch reasons if mixed orgs, but for bulk rejection usually we provide a generic reason or the modal handles it.
        // RejectionModal expects a `reasons` prop which is already loaded.
        setIsRejectionModalOpen(true);
    };

    const handleBulkRemoveClick = () => {
        if (window.confirm(`Tem certeza que deseja remover ${selectedPromoterIds.size} divulgadoras da equipe? Esta ação é irreversível.`)) {
            handleBulkUpdate({ status: 'removed' }, 'remove');
        }
    };

    const handleConfirmReject = async (reason: string, allowEdit: boolean) => {
        if (isBulkRejection) {
            const newStatus = allowEdit ? 'rejected_editable' : 'rejected';
            await handleBulkUpdate({ status: newStatus, rejectionReason: reason }, 'reject');
        } else if (rejectingPromoter && canManage) {
            const newStatus = allowEdit ? 'rejected_editable' : 'rejected';
            await handleUpdatePromoter(rejectingPromoter.id, { status: newStatus, rejectionReason: reason });
        }
        setRejectingPromoter(null);
        setIsBulkRejection(false);
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
            
            // On success, update the timestamp locally first
            setAllPromoters(prev => prev.map(p => 
                p.id === promoter.id 
                ? { ...p, lastManualNotificationAt: { seconds: Date.now() / 1000 } as any } 
                : p
            ));

            // Then background update
            const updateData = { lastManualNotificationAt: firebase.firestore.FieldValue.serverTimestamp() };
            await updatePromoter(promoter.id, updateData);

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
                
                // Manually remove from local list or change status locally to avoid full fetch
                setAllPromoters(prev => prev.map(p => 
                    p.id === promoter.id ? { ...p, status: 'removed' } : p
                ));
                // Update stats locally
                setStats(prev => ({
                    ...prev,
                    approved: prev.approved > 0 ? prev.approved - 1 : 0,
                    removed: prev.removed + 1
                }));

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
                // Recalculate stats approx
                setStats(prev => ({ ...prev, total: prev.total - 1 })); // Ideally adjust specific status count too
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
            await auth.signOut();
            navigate('/admin/login');
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

    const handleLookupPromoter = async (emailToSearch?: string) => {
        const email = (typeof emailToSearch === 'string' ? emailToSearch : '') || lookupEmail;
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
            } else {
                errorMessage = String(err);
            }
            setLookupError(errorMessage);
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
            return filteredPromotersFromSource.map(p => ({ ...p, completionRate: -1 }));
        }
    
        const statsMap = new Map<string, { assigned: number; completed: number; acceptedJustifications: number; missed: number; pending: number }>();
        const now = new Date();
    
        allAssignments.forEach(a => {
            if (!a.post) return;
    
            const stat = statsMap.get(a.promoterId) || { assigned: 0, completed: 0, acceptedJustifications: 0, missed: 0, pending: 0 };
            stat.assigned++;
    
            if (a.proofSubmittedAt) {
                stat.completed++;
            } else if (a.justification) {
                if (a.justificationStatus === 'accepted') {
                    stat.acceptedJustifications++;
                } else if (a.justificationStatus === 'rejected') {
                    stat.missed++;
                } else { // 'pending'
                    stat.pending++;
                }
            } else {
                let deadlineHasPassed = false;
                if (!a.post.allowLateSubmissions) {
                    const confirmedAt = toDateSafe(a.confirmedAt);
                    if (confirmedAt) {
                        const proofDeadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                        if (now > proofDeadline) {
                            deadlineHasPassed = true;
                        }
                    }
                    if (!deadlineHasPassed) {
                        const postExpiresAt = toDateSafe(a.post.expiresAt);
                        if (postExpiresAt && now > postExpiresAt) {
                            deadlineHasPassed = true;
                        }
                    }
                }
                if (deadlineHasPassed) {
                    stat.missed++;
                } else {
                    stat.pending++;
                }
            }
            statsMap.set(a.promoterId, stat);
        });
    
        return filteredPromotersFromSource.map(p => {
            const stats = statsMap.get(p.id);
            const successfulOutcomes = stats ? stats.completed + stats.acceptedJustifications : 0;
            const completionRate = stats && stats.assigned > 0
                ? Math.round((successfulOutcomes / stats.assigned) * 100)
                : -1;
            return { ...p, completionRate };
        });
    }, [filteredPromotersFromSource, allAssignments]);


    // Memoized calculation for filtering and pagination
    const processedPromoters = useMemo(() => {
        // Sort all promoters by date first
        let sorted = [...promotersWithStats].sort((a, b) => {
            const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
            const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
            return timeB - timeA;
        });

        // Filter by Status (Client-side enforcement for Optimistic UI)
        if (filter !== 'all') {
            if (filter === 'rejected') {
                sorted = sorted.filter(p => p.status === 'rejected' || p.status === 'rejected_editable');
            } else {
                sorted = sorted.filter(p => p.status === filter);
            }
        }

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

        const min = minAge ? parseInt(minAge, 10) : null;
        const max = maxAge ? parseInt(maxAge, 10) : null;

        if (min !== null || max !== null) {
            sorted = sorted.filter(p => {
                const age = getAgeAsNumber(p.dateOfBirth);
                if (age === null) return false; // Don't show promoters without a valid age if filtering

                const minCondition = min !== null ? age >= min : true;
                const maxCondition = max !== null ? age <= max : true;

                return minCondition && maxCondition;
            });
        }

        // Apply pagination to the filtered results
        const startIndex = (currentPage - 1) * PROMOTERS_PER_PAGE;
        const paginated = sorted.slice(startIndex, startIndex + PROMOTERS_PER_PAGE);

        return {
            displayPromoters: paginated,
            totalFilteredCount: sorted.length,
        };
    }, [promotersWithStats, searchQuery, currentPage, colorFilter, filter, minAge, maxAge]);
    
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
            setCurrentPage(currentPage - 1);
        }
    };

    const getStatusBadge = (status: PromoterStatus) => {
        const styles = {
            pending: "bg-yellow-900 bg-opacity-50 text-yellow-300",
            approved: "bg-green-900 bg-opacity-50 text-green-300",
            rejected: "bg-red-900 bg-opacity-50 text-red-300",
            rejected_editable: "bg-orange-900 bg-opacity-50 text-orange-300",
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
            <div className="flex justify-between items-center">
                <div>
                    <button onClick={() => navigate('/admin')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Voltar ao Painel</span>
                    </button>
                    <h1 className="text-3xl font-bold mt-1">Painel de Divulgadoras</h1>
                </div>
                <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center justify-center gap-2">
                    <LogoutIcon className="w-5 h-5" />
                    <span>Sair</span>
                </button>
            </div>
            
            <div className="bg-secondary p-4 rounded-lg shadow-lg">
                <div className="flex flex-col md:flex-row gap-4">
                    {/* Stats section */}
                    <div className="flex-shrink-0 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
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
                         <button onClick={() => setFilter('removed')} className={`p-3 rounded-lg ${filter === 'removed' ? 'bg-primary' : 'bg-dark'}`}>
                            <h4 className="text-sm font-semibold text-gray-300">Removidas</h4>
                            <p className="text-2xl font-bold">{stats.removed}</p>
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
                            <button onClick={() => handleLookupPromoter()} disabled={isLookingUp} className="px-4 py-2 bg-indigo-600 text-white rounded-md whitespace-nowrap">
                                {isLookingUp ? 'Buscando...' : 'Buscar Global'}
                            </button>
                            {canManage && (
                                adminData.role === 'superadmin' ? (
                                    <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md whitespace-nowrap flex items-center justify-center gap-2" title="Voltar ao painel principal">
                                        <BuildingOfficeIcon className="w-5 h-5"/>
                                        <span>Painel Principal</span>
                                    </Link>
                                ) : (
                                    <Link to="/admin/settings" className="px-4 py-2 bg-gray-600 text-white rounded-md whitespace-nowrap flex items-center justify-center gap-2">
                                        <CogIcon className="w-5 h-5"/>
                                        <span>Configurações</span>
                                    </Link>
                                )
                            )}
                            {canManage && organizationIdForReasons && (
                                <button onClick={() => setIsReasonsModalOpen(true)} className="px-4 py-2 bg-gray-600 text-white rounded-md whitespace-nowrap flex items-center justify-center gap-2">
                                    <CogIcon className="w-5 h-5"/>
                                    <span>Gerenciar Motivos</span>
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="mt-4 flex flex-col sm:flex-row gap-2 border-t border-gray-700 pt-3">
                    {isSuperAdmin && (
                        <select value={selectedOrg} onChange={(e) => setSelectedOrg(e.target.value)} className="w-full sm:w-auto flex-grow px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                            <option value="all">Todas as Organizações</option>
                            {allOrganizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                        </select>
                    )}
                    <select value={selectedState} onChange={(e) => setSelectedState(e.target.value)} className="w-full sm:w-auto flex-grow px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                        <option value="all">Todos os Estados</option>
                        {(isSuperAdmin ? states.map(s => s.abbr) : (getStatesForScope() || [])).map(abbr => <option key={abbr} value={abbr}>{stateMap[abbr]}</option>)}
                    </select>
                    <select value={selectedCampaign} onChange={(e) => setSelectedCampaign(e.target.value)} className="w-full sm:w-auto flex-grow px-3 py-2 border border-gray-600 rounded-md bg-gray-700">
                        <option value="all">Todos os Eventos</option>
                        {campaignsForFilter.map(c => <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>)}
                    </select>
                </div>
