
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
// FIX: Changed to a named import to resolve module export error.
import { PhotoViewerModal } from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import PromoterLookupModal from '../components/PromoterLookupModal'; // Import the new modal
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon, BuildingOfficeIcon, LogoutIcon, ArrowLeftIcon } from '../components/Icons';
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
                <div className="mt-3 flex flex-col sm:flex-row gap-2 items-center">
                    <label htmlFor="min-age" className="text-sm font-medium text-gray-300 flex-shrink-0">Filtrar por idade:</label>
                    <input
                        id="min-age"
                        type="number"
                        placeholder="De"
                        value={minAge}
                        onChange={(e) => setMinAge(e.target.value)}
                        className="w-full sm:w-24 px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-sm"
                        min="14"
                    />
                    <span className="text-sm text-gray-400">até</span>
                    <input
                        id="max-age"
                        type="number"
                        placeholder="Até"
                        value={maxAge}
                        onChange={(e) => setMaxAge(e.target.value)}
                        className="w-full sm:w-24 px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-sm"
                        min="14"
                    />
                </div>
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
                            <div className="flex space-x-1 p-1 bg-dark bg-opacity-70 rounded-lg">
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

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {displayPromoters.map(promoter => (
                    <div key={promoter.id} className="bg-secondary rounded-lg shadow-lg flex flex-col border border-gray-700/50 overflow-hidden">
                        <div className="relative">
                            <img
                                src={promoter.photoUrls[0]}
                                alt={promoter.name}
                                className="w-full h-48 object-cover cursor-pointer"
                                onClick={() => openPhotoViewer(promoter.photoUrls, 0)}
                            />
                            <div className="absolute top-2 right-2">{getStatusBadge(promoter.status)}</div>
                        </div>
                        <div className="p-4 flex-grow flex flex-col">
                            <h3 className="text-lg font-bold truncate" title={promoter.name}>{promoter.name}</h3>
                            <PromoterHistoryBadge promoter={promoter} allPromoters={allPromoters} onClick={handleLookupPromoter} />
                            <p className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</p>
                            
                            <div className="flex items-center gap-4 mt-2">
                                <a href={`https://wa.me/55${(promoter.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300"><WhatsAppIcon className="w-5 h-5" /></a>
                                <a href={`https://instagram.com/${(promoter.instagram || '').replace('@','')}`} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300"><InstagramIcon className="w-5 h-5" /></a>
                                {promoter.tiktok && <a href={`https://tiktok.com/@${(promoter.tiktok || '').replace('@','')}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300"><TikTokIcon className="w-5 h-5" /></a>}
                            </div>
                    
                            <p className="text-xs text-gray-500 mt-2">
                                {isSuperAdmin && `${organizationsMap[promoter.organizationId] || promoter.organizationId} / `}
                                {promoter.state} / {promoter.campaignName || 'Geral'}
                            </p>
                    
                            {promoter.status === 'approved' && (
                                <div className="mt-2 text-sm font-bold" title="Aproveitamento em posts">
                                    <span className={getPerformanceColor((promoter as any).completionRate)}>{(promoter as any).completionRate >= 0 ? `${(promoter as any).completionRate}% aproveitamento` : 'Sem dados'}</span>
                                </div>
                            )}
                            
                            <div className="flex-grow">
                                {promoter.observation && (
                                    <div className="mt-2 p-2 bg-dark/70 rounded text-xs text-yellow-300"><strong>Obs:</strong> {promoter.observation}</div>
                                )}
                                {promoter.rejectionReason && (
                                    <div className="mt-2 p-2 bg-dark/70 rounded text-xs text-red-300"><strong>Motivo:</strong> {promoter.rejectionReason}</div>
                                )}
                                
                                {promoter.status !== 'pending' && promoter.actionTakenByEmail && (
                                    <div className="mt-3 pt-2 border-t border-gray-700/50 text-xs">
                                        <p className="text-gray-500">
                                            {getActionLabel(promoter.status)}: <span className="text-gray-300 font-medium">{promoter.actionTakenByEmail}</span>
                                        </p>
                                        {promoter.statusChangedAt && (
                                            <p className="text-gray-600 mt-0.5">{formatDate(promoter.statusChangedAt)}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                    
                            {canManage && (
                                <div className="border-t border-gray-700 mt-3 pt-3 flex flex-wrap items-center justify-end gap-2">
                                    {promoter.status === 'pending' || promoter.status === 'rejected_editable' ? (
                                        <>
                                            <button onClick={() => handleUpdatePromoter(promoter.id, { status: 'approved' })} disabled={processingId === promoter.id} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md">Aprovar</button>
                                            <button onClick={() => openRejectionModal(promoter)} disabled={processingId === promoter.id} className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md">Rejeitar</button>
                                        </>
                                    ) : promoter.status === 'approved' ? (
                                        <>
                                            <button onClick={() => handleManualNotify(promoter)} disabled={notifyingId === promoter.id} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md">{notifyingId === promoter.id ? '...' : 'Notificar'}</button>
                                            <button onClick={() => handleRemoveFromTeam(promoter)} disabled={processingId === promoter.id} className="px-3 py-1.5 bg-red-800 text-white text-sm rounded-md">{processingId === promoter.id ? '...' : 'Remover'}</button>
                                        </>
                                    ) : promoter.status === 'rejected' ? (
                                        <button onClick={() => handleUpdatePromoter(promoter.id, { status: 'approved' })} disabled={processingId === promoter.id} className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md">Re-aprovar</button>
                                    ) : null}
                                    <button onClick={() => openEditModal(promoter)} className="px-3 py-1.5 bg-gray-600 text-white text-sm rounded-md">Detalhes</button>
                                    {isSuperAdmin && <button onClick={() => handleDeletePromoter(promoter.id)} className="px-3 py-1.5 bg-black text-red-500 text-sm rounded-md">Excluir</button>}
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            
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
            {organizationIdForReasons && <ManageReasonsModal isOpen={isReasonsModalOpen} onClose={() => setIsReasonsModalOpen(false)} onReasonsUpdated={refreshReasons} organizationId={organizationIdForReasons} />}
            <PromoterLookupModal isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} error={lookupError} results={lookupResults} onGoToPromoter={handleGoToPromoter} organizationsMap={organizationsMap} />
        </div>
    );
};
