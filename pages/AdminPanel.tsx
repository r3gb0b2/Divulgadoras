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
        } catch (err: unknown) {
            let errorMessage = "Ocorreu um erro desconhecido";
            if (err instanceof Error) {
                errorMessage = err.message;
            } else if (typeof err === 'string') {
                errorMessage = err;
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
            </div>

            {/* Bulk Action Bar */}
            {selectedPromoterIds.size > 0 && (
                <div className="sticky top-20 z-10 bg-blue-900/90 backdrop-blur-sm p-3 rounded-md flex flex-col sm:flex-row justify-between items-center my-4 gap-3">
                    <span className="font-semibold text-white">{selectedPromoterIds.size} selecionadas</span>
                    <div className="flex flex-wrap gap-2 justify-center">
                        <button onClick={() => handleBulkUpdate({ status: 'approved' }, 'approve')} disabled={isBulkProcessing} className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded-md text-sm font-semibold">Aprovar</button>
                        <button onClick={handleBulkRejectClick} disabled={isBulkProcessing} className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 rounded-md text-sm font-semibold">Rejeitar</button>
                        <button onClick={handleBulkRemoveClick} disabled={isBulkProcessing} className="px-3 py-1.5 bg-red-600 hover:bg-red-500 rounded-md text-sm font-semibold">Remover da Equipe</button>
                    </div>
                </div>
            )}

            {/* Promoters List */}
            {error && <p className="text-red-400 mt-4">{error}</p>}
            <div className="mt-6 space-y-4">
                {displayPromoters.map(promoter => (
                    <div key={promoter.id} className="bg-secondary shadow-md rounded-lg p-4 flex flex-col md:flex-row items-start gap-4">
                        <div className="flex-shrink-0 flex items-center gap-3">
                            {canManage && filter === 'pending' && (
                                <input type="checkbox" checked={selectedPromoterIds.has(promoter.id)} onChange={() => handleToggleSelect(promoter.id)} className="h-5 w-5 rounded border-gray-600 bg-gray-700 text-primary focus:ring-primary" />
                            )}
                            <div className="relative">
                                <img src={promoter.facePhotoUrl || promoter.photoUrls[0] || 'https://via.placeholder.com/100'} alt={promoter.name} className="w-24 h-24 object-cover rounded-md cursor-pointer" onClick={() => openPhotoViewer(promoter.photoUrls, 0)} />
                                <div className="absolute bottom-1 right-1 bg-black/50 px-1.5 py-0.5 rounded text-xs font-bold">{calculateAge(promoter.dateOfBirth)}</div>
                            </div>
                        </div>
                        <div className="flex-grow">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h3 className="text-xl font-bold text-white">{promoter.name}</h3>
                                    <p className="text-sm text-gray-400">{promoter.email}</p>
                                    <PromoterHistoryBadge promoter={promoter} allPromoters={allPromoters} onClick={handleLookupPromoter} />
                                </div>
                                {getStatusBadge(promoter.status)}
                            </div>
                            <div className="flex flex-wrap items-center gap-4 text-sm mt-2 text-gray-300">
                                <a href={`https://wa.me/55${promoter.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-green-400"><WhatsAppIcon className="w-4 h-4" /><span>{promoter.whatsapp}</span></a>
                                <a href={`https://instagram.com/${promoter.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-pink-400"><InstagramIcon className="w-4 h-4" /><span>{promoter.instagram}</span></a>
                                {promoter.tiktok && <a href={`https://tiktok.com/@${promoter.tiktok.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-blue-400"><TikTokIcon className="w-4 h-4" /><span>{promoter.tiktok}</span></a>}
                            </div>
                            <div className="text-xs text-gray-500 mt-2">
                                <span>{promoter.campaignName} ({promoter.state})</span> | <span>Cadastrado {formatRelativeTime(promoter.createdAt as Timestamp)}</span>
                            </div>
                            {promoter.observation && (
                                <p className="text-xs text-yellow-300 bg-yellow-900/30 p-2 rounded-md mt-2 italic"><strong>Obs:</strong> {promoter.observation}</p>
                            )}
                            {promoter.actionTakenByEmail && (
                                <p className="text-xs text-gray-500 mt-1">
                                    {getActionLabel(promoter.status)} {promoter.actionTakenByEmail} em {formatDate(promoter.statusChangedAt as Timestamp)}
                                </p>
                            )}
                        </div>
                        <div className="flex-shrink-0 flex flex-col md:flex-row md:items-center gap-2 w-full md:w-auto">
                            {filter === 'pending' && canManage && (
                                <>
                                    <button onClick={() => handleUpdatePromoter(promoter.id, { status: 'approved' })} className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-semibold">Aprovar</button>
                                    <button onClick={() => openRejectionModal(promoter)} className="w-full px-4 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 text-sm font-semibold">Rejeitar</button>
                                </>
                            )}
                            {filter === 'approved' && canManage && (
                                <>
                                    <button onClick={() => handleManualNotify(promoter)} disabled={notifyingId === promoter.id} className={`w-full px-4 py-2 text-white rounded-md text-sm font-semibold ${promoter.lastManualNotificationAt ? 'bg-gray-600 hover:bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}`}>
                                        {notifyingId === promoter.id ? 'Enviando...' : (promoter.lastManualNotificationAt ? 'Reenviar' : 'Notificar')}
                                    </button>
                                    <button onClick={() => handleRemoveFromTeam(promoter)} disabled={processingId === promoter.id} className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm font-semibold">Remover</button>
                                </>
                            )}
                             {isSuperAdmin && <button onClick={() => handleDeletePromoter(promoter.id)} className="w-full px-4 py-2 bg-gray-800 text-red-400 border border-red-900/50 rounded-md hover:bg-red-900/30 text-xs">Excluir Inscrição</button>}
                            <button onClick={() => openEditModal(promoter)} className="w-full px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-semibold">Detalhes</button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Pagination */}
            <div className="mt-6 flex justify-between items-center">
                <span className="text-sm text-gray-400">Página {currentPage} de {pageCount} ({totalFilteredCount} resultados)</span>
                <div className="flex gap-2">
                    <button onClick={handlePrevPage} disabled={currentPage === 1} className="px-4 py-2 bg-gray-700 rounded-md disabled:opacity-50">Anterior</button>
                    <button onClick={handleNextPage} disabled={currentPage === pageCount} className="px-4 py-2 bg-gray-700 rounded-md disabled:opacity-50">Próxima</button>
                </div>
            </div>

            {/* Modals */}
            <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={photoViewerStartIndex} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} onSave={handleUpdatePromoter} promoter={editingPromoter} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => { setIsRejectionModalOpen(false); setRejectingPromoter(null); setIsBulkRejection(false); }} onConfirm={handleConfirmReject} reasons={rejectionReasons} />
            {organizationIdForReasons && <ManageReasonsModal isOpen={isReasonsModalOpen} onClose={() => setIsReasonsModalOpen(false)} onReasonsUpdated={refreshReasons} organizationId={organizationIdForReasons} />}
            <PromoterLookupModal isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} error={lookupError} results={lookupResults} onGoToPromoter={handleGoToPromoter} organizationsMap={organizationsMap} />
        </div>
    );
};
```</change>
  <change>
    <file>components/ErrorBoundary.tsx</file>
    <description>Refatorado o ErrorBoundary para uma implementação padrão de Componente React, resolvendo erros onde `this.setState` e `this.props` não eram reconhecidos e garantindo que o aplicativo não quebre em caso de erros inesperados.</description>
    <content><![CDATA[import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // You can also log the error to an error reporting service
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Ops! Algo deu errado.</h1>
            <p className="mb-4 text-gray-300">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>
            {this.state.error && (
              <div className="bg-gray-900 p-3 rounded border border-gray-700 text-sm font-mono overflow-auto mb-4">
                <p className="text-red-400">{this.state.error.toString()}</p>
              </div>
            )}
             <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 bg-primary hover:bg-primary-dark text-white rounded transition-colors font-semibold"
            >
              Recarregar Página
            </button>
             <a href="/" className="block text-center mt-4 text-sm text-gray-400 hover:text-white underline">
                Voltar para a Página Inicial
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
]]></content>
  </change>
  <change>
    <file>src/components/ErrorBoundary.tsx</file>
    <description>Refatorado o ErrorBoundary para uma implementação padrão de Componente React, resolvendo erros onde `this.setState` e `this.props` não eram reconhecidos e garantindo que o aplicativo não quebre em caso de erros inesperados.</description>
    <content><![CDATA[import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white p-4">
          <div className="max-w-md w-full bg-gray-800 p-6 rounded-lg shadow-lg border border-red-500">
            <h1 className="text-2xl font-bold text-red-500 mb-4">Ops! Algo deu errado.</h1>
            <p className="mb-4 text-gray-300">
              Ocorreu um erro inesperado na aplicação. Por favor, tente recarregar a página.
            </p>
            {this.state.error && (
              <div className="bg-gray-900 p-3 rounded border border-gray-700 text-sm font-mono overflow-auto mb-4">
                <p className="text-red-400">{this.state.error.toString()}</p>
              </div>
            )}
             <button
              onClick={() => window.location.reload()}
              className="w-full py-2 px-4 bg-primary hover:bg-primary-dark text-white rounded transition-colors font-semibold"
            >
              Recarregar Página
            </button>
             <a href="/" className="block text-center mt-4 text-sm text-gray-400 hover:text-white underline">
                Voltar para a Página Inicial
            </a>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
]]></content>
  </change>
  <change>
    <file>pages/PostCheck.tsx</file>
    <description>O fluxo de comprovação foi redesenhado. Agora, após clicar em "Eu Publiquei!", a divulgadora pode enviar o print imediatamente. Um contador regressivo de 6 horas é exibido, e os botões de lembrete (Calendário e WhatsApp) aparecem juntos para que ela possa agendar um lembrete para si mesma antes do prazo final.</description>
    <content><![CDATA[import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter, updateAssignment } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment, Promoter, ScheduledPost, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon, CheckCircleIcon, CalendarIcon, WhatsAppIcon } from '../components/Icons';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import firebase from 'firebase/compat/app';

const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) return null;
    if (typeof timestamp.toDate === 'function') return timestamp.toDate();
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) return new Date(timestamp.seconds * 1000);
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;
    return null;
};

const extractGoogleDriveId = (url: string): string | null => {
    let id = null;
    const patterns = [ /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/, /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/, /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/ ];
    for (const pattern of patterns) { const match = url.match(pattern); if (match && match[1]) { id = match[1]; break; } }
    return id;
};

const formatDateForICS = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d\d\d/g, "");
};

const isAssignmentActive = (assignment: PostAssignment): boolean => {
    // 1. Proof Submitted -> History (Done)
    if (assignment.proofSubmittedAt) return false;

    // 2. Justification Logic
    // If status is accepted or rejected, it's history.
    if (assignment.justificationStatus === 'accepted' || assignment.justificationStatus === 'rejected') {
        return false;
    }
    // If status is pending (or legacy justification exists without status), it's active.
    if (assignment.justificationStatus === 'pending' || assignment.justification) {
        return true;
    }

    // 3. Post Deactivated -> History
    if (!assignment.post.isActive) return false;

    // 4. Check Expiration
    const now = new Date();
    const expiresAt = toDateSafe(assignment.post.expiresAt);
    
    if (expiresAt && now > expiresAt) {
        // If late submissions allowed, it's still active
        if (assignment.post.allowLateSubmissions) return true;

        // If confirmed, check the 24h window from confirmation time
        if (assignment.status === 'confirmed' && assignment.confirmedAt) {
            const confirmedAt = toDateSafe(assignment.confirmedAt);
            if (confirmedAt) {
                const deadline = new Date(confirmedAt.getTime() + 24 * 60 * 60 * 1000);
                if (now < deadline) return true; // Still in window
            }
        }
        
        // Otherwise expired/missed -> History
        return false;
    }

    return true;
};

const CountdownTimer: React.FC<{ targetDate: any, onEnd?: () => void }> = ({ targetDate, onEnd }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false);
    useEffect(() => {
        const target = toDateSafe(targetDate);
        if (!target) return;
        const updateTimer = () => {
            const now = new Date();
            const difference = target.getTime() - now.getTime();
            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                let timeString = '';
                if (days > 0) timeString += `${days}d `;
                timeString += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;
                setTimeLeft(timeString); setIsExpired(false);
            } else {
                setTimeLeft('Liberado!'); setIsExpired(true);
                if (onEnd) onEnd();
            }
        };
        updateTimer(); const timer = setInterval(updateTimer, 1000);
        return () => clearInterval(timer);
    }, [targetDate, onEnd]);
    if (!timeLeft) return null;
    return <div className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-1 ${isExpired ? 'bg-green-900/50 text-green-300' : 'bg-blue-900/50 text-blue-300'}`}><ClockIcon className="h-4 w-4" /><span>{timeLeft}</span></div>;
};

const ProofSection: React.FC<{ assignment: PostAssignment, onJustify: (assignment: PostAssignment) => void }> = ({ assignment, onJustify }) => {
    const navigate = useNavigate();
    const [timeLeft, setTimeLeft] = useState('');
    const [isButtonEnabled, setIsButtonEnabled] = useState(false);
    const allowJustification = assignment.post.allowJustification !== false;

    useEffect(() => {
        if (!assignment.confirmedAt) return;
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;
        
        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
        // The 6-hour waiting period is removed. Proof is available immediately.
        const enableTime = new Date(confirmationTime.getTime());

        const timer = setInterval(() => {
            const now = new Date();
            if (now > expireTime) {
                if (assignment.post.allowLateSubmissions) { 
                    setTimeLeft('Envio fora do prazo liberado pelo organizador.'); 
                    setIsButtonEnabled(true); 
                } else { 
                    setTimeLeft('Tempo esgotado'); 
                    setIsButtonEnabled(false); 
                }
                clearInterval(timer); 
                return;
            }
            // Always enabled now after confirmation
            const diff = expireTime.getTime() - now.getTime();
            const hours = Math.floor(diff / (1000 * 60 * 60));
            const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((diff % (1000 * 60)) / 1000);
            setTimeLeft(`Prazo final para envio em: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            setIsButtonEnabled(true);

        }, 1000);
        return () => clearInterval(timer);
    }, [assignment.confirmedAt, assignment.post.allowLateSubmissions]);

    const handleAddToCalendar = () => {
        if (!assignment.confirmedAt) return;
        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;

        const reminderTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000);
        
        const title = `Enviar Print - ${assignment.post.campaignName}`;
        const description = `Lembrete para enviar o print da sua publicação!\\n\\nAcesse o link para enviar: ${window.location.href}`;
        const endDate = new Date(reminderTime.getTime() + 30 * 60 * 1000); // 30 min duration

        const now = formatDateForICS(new Date());
        const start = formatDateForICS(reminderTime);
        const end = formatDateForICS(endDate);

        const icsContent = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Equipe Certa//NONSGML v1.0//EN',
            'BEGIN:VEVENT',
            `UID:${now}-${Math.random().toString(36).substring(2)}@equipecerta.com`,
            `DTSTAMP:${now}`,
            `DTSTART:${start}`,
            `DTEND:${end}`,
            `SUMMARY:${title}`,
            `DESCRIPTION:${description}`,
            `URL:${window.location.href}`,
            'END:VEVENT',
            'END:VCALENDAR'
        ].join('\r\n');

        const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = window.URL.createObjectURL(blob);
        link.setAttribute('download', 'lembrete_post.ics');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleWhatsAppReminder = () => {
        if (!assignment?.post?.campaignName) return;
        const promoterName = assignment.promoterName.split(' ')[0];
        const text = `Oi ${promoterName}! Lembrete para enviar o print de comprovação do evento ${assignment.post.campaignName}. O prazo está acabando! Acesse seu portal para enviar.`;
        const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
    };

    if (assignment.proofImageUrls && assignment.proofImageUrls.length > 0) {
        return (<div className="mt-4 text-center"><p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p><div className="flex justify-center gap-2">{assignment.proofImageUrls.map((url, index) => (<a key={index} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" /></a>))}</div></div>);
    }
    const isExpired = timeLeft === 'Tempo esgotado';
    
    return (
        <div className="mt-4 text-center">
            {isExpired ? (
                allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada. Por favor, procure o administrador.")} className="w-full sm:w-auto px-6 py-3 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)
            ) : (
                <div className="flex flex-col items-center gap-4">
                    <button 
                        onClick={() => navigate(`/proof/${assignment.id}`)} 
                        disabled={!isButtonEnabled} 
                        className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Comprovação de Postagem
                    </button>
                    <p className={`text-sm font-semibold -mt-2 ${isExpired ? 'text-red-400' : 'text-gray-400'}`}>{timeLeft}</p>
                    
                    <div className="border-t border-gray-700 w-full pt-4 mt-2 flex flex-col items-center gap-3">
                        <p className="text-xs text-gray-400">Não se esqueça! Agende um lembrete:</p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <button 
                                onClick={handleAddToCalendar}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-900/30 text-indigo-300 text-xs font-semibold rounded-full border border-indigo-500/30 hover:bg-indigo-900/50 transition-colors"
                            >
                                <CalendarIcon className="w-4 h-4" />
                                Lembrete (Celular)
                            </button>
                            <button 
                                onClick={handleWhatsAppReminder}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-green-900/30 text-green-300 text-xs font-semibold rounded-full border border-green-500/30 hover:bg-green-900/50 transition-colors"
                            >
                                <WhatsAppIcon className="w-4 h-4" />
                                Lembrete (WhatsApp)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const PostCard: React.FC<{ assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, onConfirm: (assignment: PostAssignment) => void, onJustify: (assignment: PostAssignment) => void }> = ({ assignment, onConfirm, onJustify }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isMediaProcessing, setIsMediaProcessing] = useState(false);
    const allowJustification = assignment.post.allowJustification !== false;

    if (!assignment.promoterHasJoinedGroup) return (<div className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-yellow-500"><h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>{assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}<p className="mt-2 text-yellow-300">Você tem uma nova publicação para este evento!</p><p className="mt-2 text-gray-300 text-sm">Para visualizar, primeiro você precisa confirmar a leitura das regras e entrar no grupo do WhatsApp.</p><div className="mt-4 text-center"><Link to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`} className="inline-block w-full sm:w-auto text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark transition-colors">Verificar Status e Aceitar Regras</Link></div></div>);

    const handleConfirm = async () => { setIsConfirming(true); try { await onConfirm(assignment); } finally { setIsConfirming(false); } };
    const handleCopyLink = () => { if (!assignment.post.postLink) return; navigator.clipboard.writeText(assignment.post.postLink).then(() => { setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }).catch(err => { console.error('Failed to copy link: ', err); alert('Falha ao copiar link.'); }); };
    const now = new Date();
    const isExpired = assignment.post.expiresAt && toDateSafe(assignment.post.expiresAt) < now;
    const isPostDownloadable = assignment.post.isActive && !isExpired;
    
    const handleFirebaseDownload = async () => {
        if (!isPostDownloadable || isMediaProcessing || !assignment.post.mediaUrl) return;
        setIsMediaProcessing(true);
        try {
            const path = assignment.post.mediaUrl;
            let finalUrl = path;
            if (!path.startsWith('http')) { const storageRef = storage.ref(path); finalUrl = await storageRef.getDownloadURL(); }
            const link = document.createElement('a'); link.href = finalUrl; const filename = finalUrl.split('/').pop()?.split('#')[0].split('?')[0] || 'download'; link.setAttribute('download', filename); link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); document.body.appendChild(link); link.click(); document.body.removeChild(link);
        } catch (error: any) { console.error('Failed to download from Firebase:', error); alert(`Não foi possível baixar a mídia do Link 1: ${error.message}`); } finally { setIsMediaProcessing(false); }
    };
    const handleGoogleDriveDownload = () => { if (!isPostDownloadable || !assignment.post.googleDriveUrl) return; const { googleDriveUrl, type } = assignment.post; let urlToOpen = googleDriveUrl; if (type === 'video') { const fileId = extractGoogleDriveId(googleDriveUrl); if (fileId) { urlToOpen = `https://drive.google.com/uc?export=download&id=${fileId}`; } } window.open(urlToOpen, '_blank'); };
    
    const renderJustificationStatus = (status: 'pending' | 'accepted' | 'rejected' | null | undefined) => { 
        const styles = { pending: "bg-yellow-900/50 text-yellow-300", accepted: "bg-green-900/50 text-green-300", rejected: "bg-red-900/50 text-red-300" }; 
        const text = { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" }; 
        const effectiveStatus = status || 'pending';
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[effectiveStatus]}`}>{text[effectiveStatus]}</span>; 
    };
    
    const hasProof = !!assignment.proofSubmittedAt;
    const hasJustification = !!assignment.justification;

    const renderActions = () => {
        if (hasProof) return (<div className="mt-4 text-center"><p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>{assignment.proofImageUrls && assignment.proofImageUrls.length > 0 ? (<div className="flex justify-center gap-2">{assignment.proofImageUrls.map((url, index) => (<a key={index} href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" /></a>))}</div>) : (<p className="text-xs text-gray-400">(Concluído automaticamente)</p>)}</div>);
        
        if (hasJustification) {
            return (
                <div className="mt-4 text-center">
                    <p className="text-sm text-yellow-300 font-semibold mb-2">Justificativa Enviada</p>
                    <p className="text-sm italic text-gray-300 bg-gray-800 p-2 rounded-md mb-2">"{assignment.justification}"</p>
                    <div className="text-xs mb-2">Status: {renderJustificationStatus(assignment.justificationStatus)}</div>
                    {assignment.justificationResponse && (<div className="mt-2 text-left bg-dark p-3 rounded-md border-l-4 border-primary"><p className="text-sm font-semibold text-primary mb-1">Resposta do Organizador:</p><p className="text-sm text-gray-300 whitespace-pre-wrap">{assignment.justificationResponse}</p></div>)}
                </div>
            );
        }

        if (assignment.status === 'pending') {
            if (!assignment.post.isActive || isExpired) {
                return (<div className="w-full flex flex-col sm:flex-row gap-2">{allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada. Por favor, procure o administrador.")} className="w-full px-6 py-3 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)}</div>);
            }
            return (<div className="w-full flex flex-col sm:flex-row gap-2">{allowJustification ? (<button onClick={() => onJustify(assignment)} className="w-full px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors">Justificar Ausência</button>) : (<button onClick={() => alert("A justificativa para esta publicação está encerrada ou não é permitida. Por favor, procure o administrador.")} className="w-full px-4 py-2 bg-gray-800 text-gray-500 font-bold rounded-lg border border-gray-700 cursor-not-allowed opacity-70">Justificar Ausência</button>)}<button onClick={handleConfirm} disabled={isConfirming} className="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50">{isConfirming ? 'Confirmando...' : 'Eu Publiquei!'}</button></div>);
        }
        if (assignment.status === 'confirmed') return <ProofSection assignment={assignment} onJustify={onJustify} />;
        return null;
    };

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-3"><div><p className="font-bold text-lg text-primary">{assignment.post.campaignName}</p>{assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}{assignment.post.postFormats && assignment.post.postFormats.length > 0 && (<div className="flex gap-2 mt-1">{assignment.post.postFormats.map(format => (<span key={format} className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-600 text-gray-200 capitalize">{format}</span>))}</div>)}</div><div className="flex flex-col items-end gap-1 flex-shrink-0">{assignment.post.expiresAt && (<div className="flex items-center gap-2"><span className="text-xs text-gray-400 font-medium">Tempo restante:</span><CountdownTimer targetDate={assignment.post.expiresAt} /></div>)}<div className="mt-1">{assignment.status === 'confirmed' ? (<span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>) : (<span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>)}</div></div></div>
            <div className="border-t border-gray-700 pt-3">
                {assignment.post.type === 'text' && (<div className="bg-gray-800 p-3 rounded-md mb-4"><pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{assignment.post.textContent}</pre></div>)}
                {(assignment.post.type === 'image' || assignment.post.type === 'video') && (assignment.post.mediaUrl || assignment.post.googleDriveUrl) && (
                    <div className="mb-4"><StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type} controls={assignment.post.type === 'video'} className="w-full max-w-sm mx-auto rounded-md" /><div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">{assignment.post.mediaUrl && (<button onClick={handleFirebaseDownload} disabled={isMediaProcessing} className={`flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold disabled:opacity-50 ${!isPostDownloadable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-500'}`} title={!isPostDownloadable ? "Download desabilitado para posts inativos" : "Baixar do nosso servidor (Firebase)"}><DownloadIcon className="w-4 h-4" /><span>Download Link 1</span></button>)}{assignment.post.googleDriveUrl && (<button onClick={handleGoogleDriveDownload} disabled={!isPostDownloadable} className={`flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold ${!isPostDownloadable ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`} title={!isPostDownloadable ? "Download desabilitado para posts inativos" : "Baixar do Google Drive"}><DownloadIcon className="w-4 h-4" /><span>Download Link 2</span></button>)}</div>{assignment.post.mediaUrl && assignment.post.googleDriveUrl && (<p className="text-center text-xs text-gray-400 mt-2">Link 1 é do servidor da plataforma, Link 2 é do Google Drive.</p>)}</div>
                )}
                <div className="space-y-2"><h4 className="font-semibold text-gray-200">Instruções:</h4><div className="bg-gray-800/50 p-3 rounded-md"><p className="text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p></div></div>
                {assignment.post.postLink && (<div className="space-y-2 mt-4"><h4 className="font-semibold text-gray-200">Link para Postagem:</h4><div className="bg-gray-800/50 p-3 rounded-md"><div className="flex items-center gap-2"><input type="text" readOnly value={assignment.post.postLink} className="flex-grow w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-sm" /><button onClick={handleCopyLink} className="flex-shrink-0 px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-semibold w-24">{linkCopied ? 'Copiado!' : 'Copiar'}</button><a href={assignment.post.postLink} target="_blank" rel="noopener noreferrer" className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-500 text-sm font-semibold"><ExternalLinkIcon className="w-4 h-4" /><span>Abrir</span></a></div></div></div>)}
            </div>
            {renderActions()}
        </div>
    );
};

const PostCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[]>([]);
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [justificationAssignment, setJustificationAssignment] = useState<PostAssignment | null>(null);
    const [justificationText, setJustificationText] = useState('');
    const [justificationFiles, setJustificationFiles] = useState<File[]>([]);
    const [isSubmittingJustification, setIsSubmittingJustification] = useState(false);
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [showHistory, setShowHistory] = useState(false);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setAssignments([]);
        setScheduledPosts([]);
        setSearched(true);
        try {
            const [promoterProfiles, fetchedAssignments, fetchedScheduled] = await Promise.all([
                findPromotersByEmail(searchEmail),
                getAssignmentsForPromoterByEmail(searchEmail),
                getScheduledPostsForPromoter(searchEmail)
            ]);

            if (promoterProfiles.length === 0) {
                setError("Nenhum cadastro encontrado com este e-mail.");
                setIsLoading(false);
                return;
            }
            
            setPromoter(promoterProfiles[0]); 

            const assignmentsWithGroupStatus = fetchedAssignments.map(assignment => {
                const promoterProfile = promoterProfiles.find(p => p.id === assignment.promoterId);
                return { ...assignment, promoterHasJoinedGroup: promoterProfile?.hasJoinedGroup || false };
            });

            setAssignments(assignmentsWithGroupStatus);
            setScheduledPosts(fetchedScheduled);

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro ao buscar.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        if (emailFromQuery) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        }
    }, [location.search, performSearch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        navigate(`/posts?email=${encodeURIComponent(email)}`); 
    };

    const handleConfirmAssignment = async (assignment: PostAssignment) => {
        try {
            await confirmAssignment(assignment.id);
            performSearch(email);
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleOpenJustification = (assignment: PostAssignment) => {
        setJustificationAssignment(assignment);
        setJustificationText('');
        setJustificationFiles([]);
    };

    const handleJustificationFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) setJustificationFiles(Array.from(e.target.files));
    };

    const handleSubmitJustification = async () => {
        if (!justificationAssignment) return;
        if (!justificationText.trim()) {
            alert("Por favor, explique o motivo.");
            return;
        }
        setIsSubmittingJustification(true);
        try {
            await submitJustification(justificationAssignment.id, justificationText, justificationFiles);
            setJustificationAssignment(null);
            performSearch(email);
        } catch (err: any) {
            alert(err.message);
        } finally {
            setIsSubmittingJustification(false);
        }
    };

    const renderScheduledPosts = () => {
        if (scheduledPosts.length === 0) return null;
        return (
            <div className="mb-8">
                <h2 className="text-xl font-bold text-gray-300 mb-4 flex items-center gap-2"><ClockIcon className="w-6 h-6" /> Em Breve</h2>
                <div className="space-y-4">
                    {scheduledPosts.map(post => (
                        <div key={post.id} className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 flex items-center justify-between">
                            <div>
                                <p className="font-semibold text-white">{post.postData.campaignName}</p>
                                <p className="text-sm text-gray-400">Agendado para: {toDateSafe(post.scheduledAt)?.toLocaleString('pt-BR')}</p>
                            </div>
                            <span className="px-3 py-1 bg-blue-900/30 text-blue-300 text-xs rounded-full border border-blue-500/30">Aguardando</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    // Filter active vs history based on updated logic
    const activeAssignments = assignments.filter(a => isAssignmentActive(a));
    const historyAssignments = assignments.filter(a => !isAssignmentActive(a));

    return (
        <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
                {promoter && <button onClick={() => setIsStatsModalOpen(true)} className="px-4 py-2 bg-gray-700 text-white rounded-md hover:bg-gray-600 text-sm font-semibold">Minhas Estatísticas</button>}
            </div>
            <div className="bg-secondary shadow-2xl rounded-lg p-8 mb-6">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Digite seu e-mail para ver suas tarefas de divulgação.</p>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200" required />
                    <button type="submit" disabled={isLoading} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50">{isLoading ? 'Buscando...' : 'Ver Tarefas'}</button>
                </form>
            </div>

            {searched && !isLoading && (
                <div className="space-y-8">
                    {renderScheduledPosts()}
                    
                    {/* Active Assignments */}
                    <div className="space-y-6">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <CheckCircleIcon className="w-6 h-6 text-primary" /> Tarefas Pendentes
                        </h2>
                        {activeAssignments.length > 0 ? (
                            activeAssignments.map(assignment => (
                                <PostCard key={assignment.id} assignment={assignment} onConfirm={handleConfirmAssignment} onJustify={handleOpenJustification} />
                            ))
                        ) : (
                            <p className="text-center text-gray-400 py-4 border border-gray-700 rounded-lg bg-dark/50">Nenhuma tarefa pendente no momento! 🎉</p>
                        )}
                    </div>

                    {/* History Assignments */}
                    {historyAssignments.length > 0 && (
                        <div className="space-y-6 pt-6 border-t border-gray-700">
                            <button 
                                onClick={() => setShowHistory(!showHistory)} 
                                className="w-full flex justify-between items-center text-xl font-bold text-gray-400 hover:text-white transition-colors"
                            >
                                <span>Histórico ({historyAssignments.length})</span>
                                <span className="text-sm bg-gray-700 px-3 py-1 rounded-full">{showHistory ? 'Ocultar' : 'Mostrar'}</span>
                            </button>
                            
                            {showHistory && (
                                <div className="space-y-6 animate-fadeIn">
                                    {historyAssignments.map(assignment => (
                                        <PostCard key={assignment.id} assignment={assignment} onConfirm={handleConfirmAssignment} onJustify={handleOpenJustification} />
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {justificationAssignment && (
                <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4">
                    <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-xl font-bold text-white mb-4">Justificar Ausência</h3>
                        <p className="text-gray-300 text-sm mb-4">Explique por que você não pôde realizar esta publicação ({justificationAssignment.post.campaignName}).</p>
                        <textarea value={justificationText} onChange={e => setJustificationText(e.target.value)} placeholder="Motivo..." rows={4} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 mb-4" />
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-300 mb-1">Anexar Print/Foto (Opcional)</label>
                            <input type="file" onChange={handleJustificationFileChange} multiple accept="image/*" className="text-sm text-gray-400" />
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => setJustificationAssignment(null)} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                            <button onClick={handleSubmitJustification} disabled={isSubmittingJustification} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">{isSubmittingJustification ? 'Enviando...' : 'Enviar'}</button>
                        </div>
                    </div>
                </div>
            )}
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
```</change>
</changes>
```