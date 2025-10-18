import React, { useState, useEffect, useMemo, useCallback } from 'react';
// FIX: Removed modular signOut import to use compat syntax.
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { getAllPromoters, getPromoterStats, updatePromoter, deletePromoter, getRejectionReasons, findPromotersByEmail } from '../services/promoterService';
import { getOrganization, getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { Promoter, AdminUserData, PromoterStatus, RejectionReason, Organization, Campaign } from '../types';
import { states } from '../constants/states';
import { Link } from 'react-router-dom';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import PromoterLookupModal from '../components/PromoterLookupModal'; // Import the new modal
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon } from '../components/Icons';
import { serverTimestamp, Timestamp } from 'firebase/firestore';
import { useAdminAuth } from '../contexts/AdminAuthContext';

interface AdminPanelProps {
    adminData: AdminUserData;
}

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

const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
    const { selectedOrganizationId, clearSelectedOrganization } = useAdminAuth();

    const [allPromoters, setAllPromoters] = useState<Promoter[]>([]);
    const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [organization, setOrganization] = useState<Organization | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<PromoterStatus | 'all'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [notifyingId, setNotifyingId] = useState<string | null>(null);

    // Pagination state (client-side)
    const [currentPage, setCurrentPage] = useState(1);
    const PROMOTERS_PER_PAGE = 20;

    // State for super admin filters
    const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [selectedOrg, setSelectedOrg] = useState('all');
    const [selectedState, setSelectedState] = useState('all');
    const [selectedCampaign, setSelectedCampaign] = useState('all');

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

    const organizationIdForScope = isSuperAdmin ? null : selectedOrganizationId;

    const organizationIdForReasons = useMemo(() => {
        if (isSuperAdmin) {
            return selectedOrg !== 'all' ? selectedOrg : null;
        }
        return selectedOrganizationId || null;
    }, [isSuperAdmin, selectedOrg, selectedOrganizationId]);


    // Fetch static data (reasons, orgs, campaigns) once
    useEffect(() => {
        const fetchStaticData = async () => {
            try {
                let campaignsPromise;
                if (isSuperAdmin) {
                    campaignsPromise = getAllCampaigns();
                    const orgsData = await getOrganizations();
                    setAllOrganizations(orgsData.sort((a, b) => a.name.localeCompare(b.name)));
                } else if (selectedOrganizationId) {
                    campaignsPromise = getAllCampaigns(selectedOrganizationId);
                    const [reasonsData, orgData] = await Promise.all([
                        getRejectionReasons(selectedOrganizationId),
                        getOrganization(selectedOrganizationId),
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
    }, [adminData, isSuperAdmin, selectedOrganizationId]);

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

    // Calculate the exact list of campaigns the admin is allowed to see.
    const campaignsInScope = useMemo(() => {
        if (isSuperAdmin) return null; // null means no campaign filter
        if (!selectedOrganizationId) return []; // No org, no campaigns

        const orgCampaigns = allCampaigns.filter(c => c.organizationId === selectedOrganizationId);
        
        // If admin has no specific campaign assignments, they can see all campaigns from their org's assigned states
        if (!adminData.assignedCampaigns || Object.keys(adminData.assignedCampaigns).length === 0) {
            return orgCampaigns.map(c => c.name);
        }

        const allowedCampaignNames = new Set<string>();
        const statesForScope = getStatesForScope() || [];

        for (const stateAbbr of statesForScope) {
            const restrictedCampaigns = adminData.assignedCampaigns[stateAbbr];
            
            if (restrictedCampaigns) { // Restriction exists for this state
                if (restrictedCampaigns.length > 0) {
                    restrictedCampaigns.forEach(name => allowedCampaignNames.add(name));
                }
            } else { // No restriction for this state, so they can see all campaigns in it from their org.
                orgCampaigns
                    .filter(c => c.stateAbbr === stateAbbr)
                    .forEach(c => allowedCampaignNames.add(c.name));
            }
        }

        return Array.from(allowedCampaignNames);
    }, [isSuperAdmin, adminData, getStatesForScope, allCampaigns, selectedOrganizationId]);

    const fetchStats = useCallback(async () => {
        const orgId = isSuperAdmin ? undefined : selectedOrganizationId;
        if (!isSuperAdmin && !orgId) return;

        const statesForScope = getStatesForScope();
        if (!isSuperAdmin && (!statesForScope || statesForScope.length === 0)) {
            setStats({ total: 0, pending: 0, approved: 0, rejected: 0 });
            return;
        }
        try {
            const newStats = await getPromoterStats({ organizationId: orgId, statesForScope });
            setStats(newStats);
        } catch (err: any) {
            // Avoid overwriting a more specific error from the main fetch
            if (!error) setError(err.message);
        }
    }, [selectedOrganizationId, organization, isSuperAdmin, getStatesForScope, error]);


    // Fetch stats
    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    // Fetch all promoters based on filters
    useEffect(() => {
        const fetchAllPromoters = async () => {
            setIsLoading(true);
            setError(null);
            
            const orgId = isSuperAdmin ? undefined : selectedOrganizationId;
            if (!isSuperAdmin && !orgId) {
                 setError("Nenhuma organização selecionada.");
                 setIsLoading(false);
                 setAllPromoters([]);
                 return;
            }

            const statesForScope = getStatesForScope();

            try {
                const result = await getAllPromoters({
                    organizationId: orgId,
                    statesForScope,
                    status: filter,
                    campaignsInScope: campaignsInScope,
                    selectedCampaign: selectedCampaign,
                    filterOrgId: selectedOrg,
                    filterState: selectedState,
                });
                
                setAllPromoters(result);

            } catch(err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAllPromoters();
    }, [selectedOrganizationId, organization, isSuperAdmin, filter, selectedOrg, selectedState, selectedCampaign, getStatesForScope, campaignsInScope]);


    // Reset page number whenever filters or search query change
    useEffect(() => {
        setCurrentPage(1);
    }, [filter, selectedOrg, selectedState, selectedCampaign, searchQuery]);


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
                updatedData.statusChangedAt = serverTimestamp();
            }
            
            await updatePromoter(id, updatedData);
            
            alert("Divulgadora atualizada com sucesso.");

            // Optimistic UI update
            if (data.status && filter !== 'all' && data.status !== filter) {
                setAllPromoters(prev => prev.filter(p => p.id !== id));
            } else {
                setAllPromoters(prev => prev.map(p => 
                    p.id === id ? { ...currentPromoter, ...updatedData } as Promoter : p
                ));
            }
            
            // Refetch dashboard stats in the background
            fetchStats();

        } catch (error) {
            alert("Falha ao atualizar a divulgadora.");
            throw error;
        }
    };

    const handleGroupStatusChange = async (promoter: Promoter, hasJoined: boolean) => {
        if (hasJoined) {
            // If they are joining, just update the flag. No need to delete anything.
            await handleUpdatePromoter(promoter.id, { hasJoinedGroup: true });
        } else {
            // If they are leaving, confirm and then call the cloud function.
            if (window.confirm(`Tem certeza que deseja marcar "${promoter.name}" como fora do grupo? Isso a removerá de TODAS as publicações ativas para este evento.`)) {
                try {
                    const removePromoter = httpsCallable(functions, 'removePromoterFromAllAssignments');
                    await removePromoter({ promoterId: promoter.id });
                    
                    alert(`${promoter.name} foi removida do grupo e de todas as publicações designadas.`);
    
                    // Optimistic UI update for the checkbox.
                    setAllPromoters(prev => prev.map(p => 
                        p.id === promoter.id ? { ...p, hasJoinedGroup: false } as Promoter : p
                    ));
                     // Also refetch dashboard stats in the background
                    fetchStats();
    
                } catch (error: any) {
                    console.error("Failed to remove promoter from all assignments:", error);
                    alert(`Falha ao remover a divulgadora: ${error.message}`);
                }
            }
        }
    };
    
    const handleConfirmReject = async (reason: string, allowsResubmission: boolean) => {
        if (rejectingPromoter && canManage) {
            const updateData: Partial<Promoter> = {
                status: 'rejected',
                rejectionReason: reason,
                canResubmit: allowsResubmission,
            };
            await handleUpdatePromoter(rejectingPromoter.id, updateData);
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
            const manuallySendStatusEmail = httpsCallable(functions, 'manuallySendStatusEmail');
            const result = await manuallySendStatusEmail({ promoterId: promoter.id });
            const data = result.data as { success: boolean, message: string, provider?: string };
            const providerName = data.provider || 'Brevo (v9.2)';
            alert(`${data.message || 'Notificação enviada com sucesso!'} (Provedor: ${providerName})`);
            
            // On success, update the timestamp
            const updateData = { lastManualNotificationAt: serverTimestamp() };
            await updatePromoter(promoter.id, updateData);
            
            // Optimistic UI update for the timestamp
            setAllPromoters(prev => prev.map(p => 
                p.id === promoter.id 
                ? { ...p, lastManualNotificationAt: Timestamp.now() } as Promoter 
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

    const handleDeletePromoter = async (id: string) => {
        if (!isSuperAdmin) return;
        if (window.confirm("Tem certeza que deseja excluir esta inscrição? Esta ação não pode ser desfeita.")) {
            try {
                await deletePromoter(id);
                setAllPromoters(prev => prev.filter(p => p.id !== id));
                fetchStats(); // Also refetch stats in the background
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

    // Memoized calculation for filtering and pagination
    const processedPromoters = useMemo(() => {
        // Sort all promoters by date first
        const sorted = [...allPromoters].sort((a, b) => {
            const timeA = (a.createdAt instanceof Timestamp) ? a.createdAt.toMillis() : 0;
            const timeB = (b.createdAt instanceof Timestamp) ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        const lowercasedQuery = searchQuery.toLowerCase().trim();
        if (lowercasedQuery === '') {
            const startIndex = (currentPage - 1) * PROMOTERS_PER_PAGE;
            return {
                displayPromoters: sorted.slice(startIndex, startIndex + PROMOTERS_PER_PAGE),
                totalFilteredCount: sorted.length,
            };
        }

        const filtered = sorted.filter(p => {
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

        // Apply pagination to the filtered results
        const startIndex = (currentPage - 1) * PROMOTERS_PER_PAGE;
        const paginated = filtered.slice(startIndex, startIndex + PROMOTERS_PER_PAGE);

        return {
            displayPromoters: paginated,
            totalFilteredCount: filtered.length,
        };
    }, [allPromoters, searchQuery, currentPage]);
    
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
            pending: "bg-yellow-900/50 text-yellow-300",
            approved: "bg-green-900/50 text-green-300",
            rejected: "bg-red-900/50 text-red-300",
        };
        const text = { pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado" };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };
    
    const renderContent = () => {
        if (isLoading && allPromoters.length === 0) return <div className="text-center py-10">Carregando divulgadoras...</div>;
        if (error) return <div className="text-red-400 text-center py-10">{error}</div>;
        if (displayPromoters.length === 0) return <div className="text-center text-gray-400 py-10">Nenhuma divulgadora encontrada com o filtro selecionado.</div>;

        return (
            <div className="space-y-4">
                {displayPromoters.map(promoter => (
                    <div key={promoter.id} className="bg-dark/70 p-4 rounded-lg shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-start mb-3">
                            <div>
                                <p className="font-bold text-lg text-white">{promoter.name}</p>
                                {isSuperAdmin && <p className="text-xs text-gray-400 font-medium">{allOrganizations.find(o => o.id === promoter.organizationId)?.name || 'Organização Desconhecida'}</p>}
                                {promoter.campaignName && <p className="text-sm text-primary font-semibold">{promoter.campaignName}</p>}
                                {promoter.associatedCampaigns && promoter.associatedCampaigns.length > 0 && (
                                    <div className="mt-1">
                                        <span className="text-xs font-semibold text-gray-400">Eventos Adicionais: </span>
                                        <span className="text-xs text-gray-300">
                                            {promoter.associatedCampaigns.join(', ')}
                                        </span>
                                    </div>
                                )}
                                <p className="text-sm text-gray-400">{promoter.email}</p>
                                <p className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</p>
                            </div>
                            <div className="mt-2 sm:mt-0 flex-shrink-0 flex items-center gap-2">
                                {promoter.status === 'approved' && promoter.hasJoinedGroup === false && (
                                    <span
                                        className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-300"
                                        title="Esta divulgadora saiu ou foi removida do grupo de WhatsApp e não receberá mais publicações."
                                    >
                                        Fora do Grupo
                                    </span>
                                )}
                                {getStatusBadge(promoter.status)}
                            </div>
                        </div>

                        <div className="text-xs text-gray-500 mb-3 space-y-1">
                            <p><span className="font-semibold">Cadastrado em:</span> {formatDate(promoter.createdAt)}</p>
                            {promoter.status !== 'pending' && promoter.statusChangedAt && promoter.actionTakenByEmail && (
                                <p><span className="font-semibold">Ação por:</span> {promoter.actionTakenByEmail} em {formatDate(promoter.statusChangedAt)}</p>
                            )}
                        </div>

                        <div className="flex items-center gap-4 mb-3">
                            <span className="text-sm font-medium text-gray-300">Fotos:</span>
                            <div className="flex -space-x-2">
                                {(promoter.photoUrls || []).map((url, index) => (
                                    <img key={index} src={url} alt={`Foto ${index + 1}`} className="w-8 h-8 rounded-full object-cover border-2 border-secondary cursor-pointer" onClick={() => openPhotoViewer(promoter.photoUrls, index)}/>
                                ))}
                            </div>
                        </div>
                        
                        <div className="border-t border-gray-700 pt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                            <a href={`https://wa.me/55${(promoter.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline flex items-center"><WhatsAppIcon className="w-4 h-4 mr-2" /><span>WhatsApp</span></a>
                            <a href={`https://instagram.com/${(promoter.instagram || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark flex items-center"><InstagramIcon className="w-4 h-4 mr-2" /><span>Instagram</span></a>
                            {promoter.tiktok && <a href={`https://tiktok.com/@${(promoter.tiktok || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:underline flex items-center"><TikTokIcon className="w-4 h-4 mr-2" /><span>TikTok</span></a>}
                        </div>
                        
                        {promoter.observation && (
                            <div className="mt-3 pt-3 border-t border-gray-700">
                                <p className="text-sm text-gray-300 bg-gray-800/50 p-2 rounded-md">
                                    <span className="font-semibold text-yellow-400">Obs:</span>
                                    <span className="italic ml-2">{promoter.observation}</span>
                                </p>
                            </div>
                        )}

                        {canManage && (
                            <div className="border-t border-gray-700 mt-3 pt-3 flex flex-wrap gap-y-2 justify-between items-center text-sm font-medium">
                                <div>
                                    {promoter.status === 'approved' && (
                                        <label
                                            className={`flex items-center space-x-2 ${promoter.hasJoinedGroup === false ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                                            title={promoter.hasJoinedGroup === false ? "Para reativar, edite o perfil da divulgadora." : ""}
                                        >
                                            <input 
                                                type="checkbox" 
                                                checked={!!promoter.hasJoinedGroup} 
                                                onChange={(e) => handleGroupStatusChange(promoter, e.target.checked)}
                                                disabled={promoter.hasJoinedGroup === false}
                                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed"
                                            />
                                            <span className={`text-gray-300 ${promoter.hasJoinedGroup === false ? 'text-gray-500 italic' : ''}`}>
                                                {promoter.hasJoinedGroup === false ? 'Saiu do grupo' : 'Entrou no grupo'}
                                            </span>
                                        </label>
                                    )}
                                </div>
                                
                                <div className="flex flex-wrap gap-x-4 gap-y-2 justify-end items-center">
                                    {promoter.status === 'pending' && (
                                        <>
                                            <button onClick={() => handleUpdatePromoter(promoter.id, {status: 'approved'})} className="text-green-400 hover:text-green-300">Aprovar</button>
                                            <button onClick={() => openRejectionModal(promoter)} className="text-red-400 hover:text-red-300">Rejeitar</button>
                                        </>
                                    )}
                                    {promoter.status === 'approved' && (
                                        <div className="flex items-center gap-x-4">
                                            {promoter.lastManualNotificationAt && (
                                                <span className="text-xs text-gray-500 italic" title={formatDate(promoter.lastManualNotificationAt)}>
                                                    Último envio: {formatDate(promoter.lastManualNotificationAt)}
                                                </span>
                                            )}
                                            <button
                                                onClick={() => handleManualNotify(promoter)}
                                                disabled={notifyingId === promoter.id}
                                                className="text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-wait"
                                            >
                                                {notifyingId === promoter.id ? 'Enviando...' : 'Notificar Manualmente'}
                                            </button>
                                        </div>
                                    )}
                                    <button onClick={() => openEditModal(promoter)} className="text-indigo-400 hover:text-indigo-300">Editar</button>
                                    {isSuperAdmin && (
                                        <button onClick={() => handleDeletePromoter(promoter.id)} className="text-gray-400 hover:text-gray-300">Excluir</button>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        );
    };

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold">{organization?.name || 'Painel do Organizador'}</h1>
                <div className="flex items-center gap-2">
                     {adminData.organizationIds && adminData.organizationIds.length > 1 && (
                        <button onClick={clearSelectedOrganization} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm">
                            Trocar Organização
                        </button>
                    )}
                    {canManage && (
                        <Link to="/admin/settings" className="p-2 bg-gray-600 text-white rounded-md hover:bg-gray-500" title="Configurações">
                            <CogIcon className="w-5 h-5"/>
                        </Link>
                    )}
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                        Sair
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-secondary p-4 rounded-lg shadow"><h3 className="text-gray-400 text-sm">Total de Cadastros</h3><p className="text-2xl font-bold text-white">{stats.total}</p></div>
                <div className="bg-secondary p-4 rounded-lg shadow"><h3 className="text-gray-400 text-sm">Pendentes</h3><p className="text-2xl font-bold text-yellow-400">{stats.pending}</p></div>
                <div className="bg-secondary p-4 rounded-lg shadow"><h3 className="text-gray-400 text-sm">Aprovados</h3><p className="text-2xl font-bold text-green-400">{stats.approved}</p></div>
                <div className="bg-secondary p-4 rounded-lg shadow"><h3 className="text-gray-400 text-sm">Rejeitados</h3><p className="text-2xl font-bold text-red-400">{stats.rejected}</p></div>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
                            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${filter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                {{'pending': 'Pendentes', 'approved': 'Aprovados', 'rejected': 'Rejeitados', 'all': 'Todos'}[f]}
                            </button>
                        ))}
                    </div>
                    
                    {isSuperAdmin && (
                        <div className="flex flex-wrap gap-2 flex-grow">
                             <select value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)} className="px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm bg-gray-700 text-gray-200">
                                <option value="all">Todas Organizações</option>
                                {allOrganizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
                            </select>
                            <select value={selectedState} onChange={e => setSelectedState(e.target.value)} className="px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm bg-gray-700 text-gray-200">
                                <option value="all">Todos Estados</option>
                                {states.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
                            </select>
                             <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="px-3 py-2 border border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm bg-gray-700 text-gray-200">
                                <option value="all">Todos Eventos</option>
                                {[...new Set(allCampaigns.map(c => c.name))].sort().map(name => (
                                    <option key={name} value={name}>{name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                     <div className="relative flex-grow w-full sm:w-auto sm:max-w-xs">
                        <input 
                            type="text"
                            placeholder="Buscar por nome, e-mail, telefone, evento..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                        />
                    </div>
                </div>

                 <div className={`flex flex-wrap items-center ${isSuperAdmin ? 'justify-between' : 'justify-end'} gap-4 mb-4 border-t border-gray-700 pt-4`}>
                    {isSuperAdmin && (
                         <div className="flex-grow">
                            <label className="text-sm font-medium text-gray-300">Diagnóstico Rápido</label>
                             <div className="flex gap-2 mt-1 w-full sm:w-auto sm:max-w-sm">
                                <input 
                                    type="email"
                                    placeholder="Buscar por e-mail exato..."
                                    value={lookupEmail}
                                    onChange={(e) => setLookupEmail(e.target.value)}
                                    className="flex-grow px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                                />
                                <button 
                                    type="button" 
                                    onClick={handleLookupPromoter}
                                    disabled={isLookingUp}
                                    className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-semibold disabled:opacity-50"
                                >
                                    {isLookingUp ? '...' : 'Buscar'}
                                </button>
                            </div>
                         </div>
                    )}
                     {canManage && (
                        <button
                            onClick={() => {
                                if (organizationIdForReasons) {
                                    setIsReasonsModalOpen(true);
                                }
                            }}
                            disabled={!organizationIdForReasons}
                            className="text-sm text-primary hover:underline flex-shrink-0 disabled:text-gray-500 disabled:cursor-not-allowed disabled:no-underline"
                            title={isSuperAdmin && !organizationIdForReasons ? "Selecione uma organização para gerenciar os motivos" : "Gerenciar Motivos de Rejeição"}
                        >
                            Gerenciar Motivos
                        </button>
                    )}
                 </div>
                {renderContent()}

                {pageCount > 0 && (
                    <div className="flex flex-col sm:flex-row justify-between items-center mt-6 pt-4 border-t border-gray-700 gap-4">
                        <span className="text-sm text-gray-400">
                            Mostrando {displayPromoters.length} de {totalFilteredCount} resultados
                        </span>
                        {pageCount > 1 && (
                            <div className="flex items-center">
                                <button
                                    onClick={handlePrevPage}
                                    disabled={currentPage === 1}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                >
                                    Anterior
                                </button>
                                <span className="mx-4 text-gray-300 text-sm">
                                    Página {currentPage} de {pageCount}
                                </span>
                                <button
                                    onClick={handleNextPage}
                                    disabled={currentPage === pageCount}
                                    className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                >
                                    Próxima
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Modals */}
            <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={photoViewerStartIndex} />
            
            {canManage && editingPromoter && (
                <EditPromoterModal
                    isOpen={isEditModalOpen}
                    onClose={() => setIsEditModalOpen(false)}
                    onSave={handleUpdatePromoter}
                    promoter={editingPromoter}
                />
            )}

            {canManage && rejectingPromoter && (
                <RejectionModal
                    isOpen={isRejectionModalOpen}
                    onClose={() => setIsRejectionModalOpen(false)}
                    onConfirm={handleConfirmReject}
                    reasons={rejectionReasons}
                />
            )}
            
            {canManage && organizationIdForReasons && (
                <ManageReasonsModal
                    isOpen={isReasonsModalOpen}
                    onClose={() => setIsReasonsModalOpen(false)}
                    organizationId={organizationIdForReasons}
                    onReasonsUpdated={() => getRejectionReasons(organizationIdForReasons).then(setRejectionReasons)}
                />
            )}

            <PromoterLookupModal 
                isOpen={isLookupModalOpen}
                onClose={() => setIsLookupModalOpen(false)}
                isLoading={isLookingUp}
                error={lookupError}
                results={lookupResults}
                onGoToPromoter={handleGoToPromoter}
                organizationsMap={organizationsMap}
            />

        </div>
    );
};

export default AdminPanel;