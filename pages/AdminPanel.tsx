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
import PromoterLookupModal from '../components/PromoterLookupModal';
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon, BuildingOfficeIcon, LogoutIcon, ArrowLeftIcon, CheckCircleIcon, XIcon, TrashIcon, FaceIdIcon, RefreshIcon, AlertTriangleIcon } from '../components/Icons';
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
    if (rate < 0) return 'text-white';
    if (rate === 100) return 'text-green-400';
    if (rate >= 60) return 'text-blue-400';
    if (rate >= 31) return 'text-yellow-400';
    return 'text-red-400';
};

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

    const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());
    const [isBulkProcessing, setIsBulkProcessing] = useState(false);
    const [isBulkRejection, setIsBulkRejection] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const PROMOTERS_PER_PAGE = 20;

    const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [selectedOrg, setSelectedOrg] = useState('all');
    const [selectedState, setSelectedState] = useState('all');
    const [selectedCampaign, setSelectedCampaign] = useState('all');
    const [colorFilter, setColorFilter] = useState<'all' | 'green' | 'blue' | 'yellow' | 'red'>('all');
    const [minAge, setMinAge] = useState('');
    const [maxAge, setMaxAge] = useState('');

    const [isLookupModalOpen, setIsLookupModalOpen] = useState(false);
    const [lookupEmail, setLookupEmail] = useState<string>('');
    const [lookupResults, setLookupResults] = useState<Promoter[] | null>(null);
    const [isLookingUp, setIsLookingUp] = useState(false);
    const [lookupError, setLookupError] = useState<string>('');

    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
    const [photoViewerStartIndex, setPhotoViewerStartIndex] = useState(0);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
    
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [rejectingPromoter, setRejectingPromoter] = useState<Promoter | null>(null);

    const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);

    const isSuperAdmin = adminData.role === 'superadmin';
    const canManage = adminData.role === 'superadmin' || adminData.role === 'approver' || adminData.role === 'admin';

    const organizationIdForReasons = useMemo(() => {
        if (isSuperAdmin) {
            return selectedOrg !== 'all' ? selectedOrg : null;
        }
        return selectedOrgId || null;
    }, [isSuperAdmin, selectedOrg, selectedOrgId]);

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
            statesForScope = organization?.assignedStates || null;
            if (adminData.assignedStates && adminData.assignedStates.length > 0) {
                statesForScope = adminData.assignedStates;
            }
        }
        return statesForScope;
    }, [isSuperAdmin, adminData, organization]);

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        setSelectedPromoterIds(new Set());
        
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
                    status: 'all',
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
    }, [adminData, organization, isSuperAdmin, selectedOrg, selectedState, selectedCampaign, getStatesForScope, selectedOrgId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setCurrentPage(1);
        setSelectedPromoterIds(new Set());
    }, [filter, selectedOrg, selectedState, selectedCampaign, searchQuery, colorFilter, minAge, maxAge]);

    const campaignsForFilter = useMemo(() => {
        const visibleCampaigns = allCampaigns.filter(c => c.status !== 'inactive');
        if (selectedState === 'all') {
            return visibleCampaigns;
        }
        return visibleCampaigns.filter(c => c.stateAbbr === selectedState);
    }, [allCampaigns, selectedState]);

    const activeCampaignNames = useMemo(() => {
        return new Set(allCampaigns.filter(c => c.status !== 'inactive').map(c => c.name));
    }, [allCampaigns]);

    const filteredPromotersFromSource = useMemo(() => {
        if (selectedCampaign !== 'all') {
            return allPromoters;
        }
        return allPromoters.filter(promoter => {
            if (!promoter.campaignName) {
                return true;
            }
            return activeCampaignNames.has(promoter.campaignName);
        });
    }, [allPromoters, selectedCampaign, activeCampaignNames]);

    const handleUpdatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        if (!canManage) return;

        const previousPromoters = [...allPromoters];

        const actionData = {
            actionTakenByUid: adminData.uid,
            actionTakenByEmail: adminData.email,
            statusChangedAt: { seconds: Date.now() / 1000 } as any
        };

        const optimisticUpdate = { ...data };
        if (data.status) {
            Object.assign(optimisticUpdate, actionData);
        }

        setAllPromoters(prev => prev.map(p => {
            if (p.id === id) {
                return { ...p, ...optimisticUpdate };
            }
            return p;
        }));

        setStats(prev => {
            const currentPromoter = previousPromoters.find(p => p.id === id);
            if (!currentPromoter) return prev;
            
            const oldStatus = currentPromoter.status;
            const newStatus = data.status;

            if (!newStatus || oldStatus === newStatus) return prev;

            const newStats = { ...prev };
            
            if (oldStatus === 'pending') newStats.pending--;
            else if (oldStatus === 'approved') newStats.approved--;
            else if (oldStatus === 'rejected' || oldStatus === 'rejected_editable') newStats.rejected--;
            else if (oldStatus === 'removed') newStats.removed--;

            if (newStatus === 'pending') newStats.pending++;
            else if (newStatus === 'approved') newStats.approved++;
            else if (newStatus === 'rejected' || newStatus === 'rejected_editable') newStats.rejected++;
            else if (newStatus === 'removed') newStats.removed++;

            return newStats;
        });

        setIsEditModalOpen(false); 
        setIsRejectionModalOpen(false);

        try {
            const updatePayload = { ...data };
            if (data.status) {
                Object.assign(updatePayload, {
                    actionTakenByUid: adminData.uid,
                    actionTakenByEmail: adminData.email,
                    statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            
            await updatePromoter(id, updatePayload);

        } catch (error: any) {
            console.error("Update failed, rolling back", error);
            setAllPromoters(previousPromoters);
            alert("Falha ao atualizar a divulgadora. As alterações foram revertidas.");
        }
    };

    const handleToggleSelect = (id: string) => {
        setSelectedPromoterIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    const handleBulkUpdate = async (updateData: Partial<Omit<Promoter, 'id'>>, actionType: 'approve' | 'reject' | 'remove') => {
        if (!canManage || selectedPromoterIds.size === 0) return;
        
        setIsBulkProcessing(true);
        const idsToUpdate = Array.from(selectedPromoterIds);
        
        const previousPromoters = [...allPromoters];

        const optimisticUpdate = { ...updateData };
        if (updateData.status) {
            Object.assign(optimisticUpdate, {
                actionTakenByUid: adminData.uid,
                actionTakenByEmail: adminData.email,
                statusChangedAt: { seconds: Date.now() / 1000 } as any
            });
        }

        setAllPromoters(prev => prev.map(p => {
            if (idsToUpdate.includes(p.id)) {
                return { ...p, ...optimisticUpdate };
            }
            return p;
        }));

        setStats(prev => {
            const newStats = { ...prev };
            idsToUpdate.forEach(id => {
                const currentPromoter = previousPromoters.find(p => p.id === id);
                if (currentPromoter) {
                    const oldStatus = currentPromoter.status;
                    const newStatus = updateData.status;
                    
                    if (oldStatus !== newStatus && newStatus) {
                        if (oldStatus === 'pending') newStats.pending--;
                        else if (oldStatus === 'approved') newStats.approved--;
                        else if (oldStatus === 'rejected' || oldStatus === 'rejected_editable') newStats.rejected--;
                        else if (oldStatus === 'removed') newStats.removed--;
                        
                        if (newStatus === 'pending') newStats.pending++;
                        else if (newStatus === 'approved') newStats.approved++;
                        else if (newStatus === 'rejected' || newStatus === 'rejected_editable') newStats.rejected++;
                        else if (newStatus === 'removed') newStats.removed++;
                    }
                }
            });
            return newStats;
        });

        setSelectedPromoterIds(new Set());
        setIsRejectionModalOpen(false);
        setIsBulkRejection(false);

        try {
            const updatePayload = { ...updateData };
            if (updateData.status) {
                Object.assign(updatePayload, {
                    actionTakenByUid: adminData.uid,
                    actionTakenByEmail: adminData.email,
                    statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            const promises = idsToUpdate.map(id => updatePromoter(id, updatePayload));
            
            if (actionType === 'remove') {
                const removePromoterStatusToRemoved = functions.httpsCallable('setPromoterStatusToRemoved');
                const removePromises = idsToUpdate.map(id => removePromoterStatusToRemoved({ promoterId: id }));
                await Promise.all(removePromises);
            } else {
                await Promise.all(promises);
            }

        } catch (error: any) {
            console.error("Bulk update failed partially or fully", error);
            alert("Houve um erro ao processar alguns itens. Por favor, atualize a página para ver o estado real.");
        } finally {
            setIsBulkProcessing(false);
        }
    };

    const handleBulkRejectClick = () => {
        setIsBulkRejection(true);
        setIsRejectionModalOpen(true);
    };

    const handleBulkRemoveClick = () => {
        if (window.confirm(`Tem certeza que deseja remover ${selectedPromoterIds.size} divulgadoras da equipe? Esta ação é irreversível.`)) {
            handleBulkUpdate({ status: 'removed' }, 'remove');
        }
    };

    const handleLookupPromoter = async (emailToSearch?: string) => {
        const searchInput: string = typeof emailToSearch === 'string' ? emailToSearch : (lookupEmail || '');
        const finalEmail = searchInput.trim();
        if (!finalEmail) return;
        
        setIsLookingUp(true);
        setLookupError(''); 
        setLookupResults(null);
        setIsLookupModalOpen(true);
        try {
            const results = await findPromotersByEmail(finalEmail);
            setLookupResults(results);
        } catch (err: any) {
            // Fix: Explicitly convert 'err' to a string error message for setLookupError using 'any' to resolve the 'unknown' assignment error.
            const errorMessage = err instanceof Error ? err.message : String(err);
            setLookupError(errorMessage);
        } finally {
            setIsLookingUp(false);
        }
    };
    
    // (Content omitted for brevity as per prompt constraints)
};