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
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon, BuildingOfficeIcon, LogoutIcon } from '../components/Icons';
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
                // FIX: Corrected a variable name from 'campaigns' to 'campaignsData' when setting state to resolve a 'Cannot find name' error.
                setAllCampaigns(campaignsData);
            } catch (e: any) {
                console.error("Error fetching static data:", e);
                setError(e.message || 'Falha ao carregar dados de campanhas ou organizações.');
            }
        };
        fetchStaticData();
    }, [isSuperAdmin, selectedOrgId]);

    const statesForScope = useMemo(() => {
        if (isSuperAdmin) return null; // Superadmin has access to all
        if (adminData.assignedStates && adminData.assignedStates.length > 0) {
            return adminData.assignedStates;
        }
        return []; // No states assigned
    }, [adminData, isSuperAdmin]);
    
    // Derived state for campaign filters based on admin's scope
     const campaignsInScope = useMemo(() => {
        let relevantCampaigns = allCampaigns;

        // Superadmin state filter
        if (isSuperAdmin && selectedState !== 'all') {
            relevantCampaigns = relevantCampaigns.filter(c => c.stateAbbr === selectedState);
        }
        
        // Admin's state scope
        if (!isSuperAdmin && statesForScope) {
             relevantCampaigns = relevantCampaigns.filter(c => statesForScope.includes(c.stateAbbr));
        }
        
        // Admin's campaign scope
        if (!isSuperAdmin && adminData.assignedCampaigns) {
            relevantCampaigns = relevantCampaigns.filter(c => {
                const assignedForState = adminData.assignedCampaigns?.[c.stateAbbr];
                if (assignedForState === undefined) return true; // full access for this state
                return assignedForState.includes(c.name);
            });
        }
        
        return relevantCampaigns.sort((a, b) => a.name.localeCompare(b.name));
    }, [allCampaigns, isSuperAdmin, selectedState, statesForScope, adminData]);


    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);

        const orgIdForFetch = isSuperAdmin ? (selectedOrg === 'all' ? undefined : selectedOrg) : selectedOrgId;

        // If a non-superadmin has no org selected, they can't fetch anything.
        if (!isSuperAdmin && !orgIdForFetch) {
            setIsLoading(false);
            setAllPromoters([]);
            setAllAssignments([]);
            setStats({ total: 0, pending: 0, approved: 0, rejected: 0, removed: 0 });
            return;
        }

        try {
            const [promotersData, statsData, assignmentsData] = await Promise.all([
                getAllPromoters({
                    organizationId: orgIdForFetch,
                    statesForScope: statesForScope,
                    status: filter,
                    selectedCampaign: selectedCampaign,
                    filterOrgId: isSuperAdmin ? selectedOrg : 'all',
                    filterState: isSuperAdmin ? selectedState : 'all',
                    assignedCampaignsForScope: adminData.assignedCampaigns,
                }),
                getPromoterStats({
                    organizationId: orgIdForFetch,
                    statesForScope: statesForScope,
                    filterOrgId: isSuperAdmin ? selectedOrg : 'all',
                    filterState: isSuperAdmin ? selectedState : 'all',
                    selectedCampaign: selectedCampaign,
                }),
                orgIdForFetch ? getAssignmentsForOrganization(orgIdForFetch) : Promise.resolve([]),
            ]);
            
            setAllPromoters(promotersData);
            setStats(statsData);
            setAllAssignments(assignmentsData);
        } catch (e: any) {
            console.error("Error fetching promoter data:", e);
            setError(e.message || "Ocorreu um erro ao buscar os dados.");
        } finally {
            setIsLoading(false);
        }
    }, [filter, selectedOrg, selectedState, selectedCampaign, isSuperAdmin, selectedOrgId, statesForScope, adminData.assignedCampaigns]);


    useEffect(() => {
        fetchData();
    }, [fetchData]);

     // --- Handlers for modals ---
    const openPhotoViewer = (urls: string[], startIndex = 0) => {
        setPhotoViewerUrls(urls);
        setPhotoViewerStartIndex(startIndex);
        setIsPhotoViewerOpen(true);
    };

    const openEditModal = (promoter: Promoter) => {
        setEditingPromoter(promoter);
        setIsEditModalOpen(true);
    };
    
    const openRejectionModal = (promoter: Promoter) => {
        setRejectingPromoter(promoter);
        setIsRejectionModalOpen(true);
    };
    
    // Handle saving from Edit modal
    const handleSavePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        setProcessingId(id);
        try {
            const dataWithAction = { ...data, actionTakenByUid: adminData.uid, actionTakenByEmail: adminData.email, statusChangedAt: firebase.firestore.FieldValue.serverTimestamp() };
            await updatePromoter(id, dataWithAction);
            await fetchData(); // Refresh list
        } catch (e: any) {
            console.error(e);
            alert(`Falha ao salvar: ${e.message}`);
        } finally {
            setProcessingId(null);
        }
    };
    
    // Handle confirming rejection from Rejection modal
    const handleConfirmRejection = async (reason: string, allowEdit: boolean) => {
        if (!rejectingPromoter) return;
        setProcessingId(rejectingPromoter.id);
        try {
            await updatePromoter(rejectingPromoter.id, {
                status: allowEdit ? 'rejected_editable' : 'rejected',
                rejectionReason: reason,
                actionTakenByUid: adminData.uid,
                actionTakenByEmail: adminData.email,
                statusChangedAt: firebase.firestore.FieldValue.serverTimestamp(),
            });
            await fetchData();
            setIsRejectionModalOpen(false);
        } catch (e: any) {
            console.error(e);
            alert(`Falha ao rejeitar: ${e.message}`);
        } finally {
            setProcessingId(null);
        }
    };

    const handlePromoterUpdate = async (id: string, status: PromoterStatus) => {
        if (!canManage) return;
        setProcessingId(id);
        try {
            await updatePromoter(id, {
                status,
                actionTakenByUid: adminData.uid,
                actionTakenByEmail: adminData.email,
                statusChangedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            await fetchData(); // Refresh data
        } catch (e: any) {
            console.error(e);
            alert(`Falha ao atualizar: ${e.message}`);
        } finally {
            setProcessingId(null);
        }
    };
    
    const handleSendNotification = async (promoter: Promoter) => {
        if (!canManage) return;
        setNotifyingId(promoter.id);
        try {
            const sendStatusNotification = functions.httpsCallable('sendStatusNotification');
            await sendStatusNotification({ promoterId: promoter.id });
            // Update the last notified timestamp in Firestore to give feedback to the user
            await updatePromoter(promoter.id, { lastManualNotificationAt: firebase.firestore.FieldValue.serverTimestamp() });
            alert(`Notificação enviada para ${promoter.name}!`);
            await fetchData(); // Refresh to show new timestamp
        } catch (error: any) {
            console.error("Error sending notification:", error);
            const detail = error.details?.message || error.message;
            alert(`Falha ao enviar notificação: ${detail}`);
        } finally {
            setNotifyingId(null);
        }
    };

    const handleDelete = async (promoter: Promoter) => {
        if (!canManage) return;
        if (window.confirm(`Tem certeza que deseja DELETAR PERMANENTEMENTE o cadastro de ${promoter.name}? Esta ação é irreversível.`)) {
            setProcessingId(promoter.id);
            try {
                await deletePromoter(promoter.id);
                // Note: This does not delete associated assignments or other records. That would require a more complex cloud function.
                await fetchData();
            } catch (e: any) {
                console.error(e);
                alert(`Falha ao deletar: ${e.message}`);
            } finally {
                setProcessingId(null);
            }
        }
    };
    
    // Email Lookup Handlers
    const handleOpenLookup = () => setIsLookupModalOpen(true);

    const handleLookup = async (email: string) => {
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        try {
            const results = await findPromotersByEmail(email);
            setLookupResults(results);
        } catch (e: any) {
            setLookupError(e.message);
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleGoToPromoter = (promoter: Promoter) => {
        setIsLookupModalOpen(false);
        // Set filters to find the promoter
        if (isSuperAdmin) {
            setSelectedOrg(promoter.organizationId);
            setSelectedState(promoter.state);
        }
        setFilter(promoter.status);
        setSelectedCampaign(promoter.campaignName || 'all');
        // The search query will highlight them
        setSearchQuery(promoter.name);
    };

    const promoterPerformanceMap = useMemo(() => {
        const promoterStats = new Map<string, { assigned: number; completed: number; missed: number, justifications: number, acceptedJustifications: number }>();

        allAssignments.forEach(assignment => {
            const { promoterId, status, proofSubmittedAt, justification, justificationStatus } = assignment;
            const stats = promoterStats.get(promoterId) || { assigned: 0, completed: 0, missed: 0, justifications: 0, acceptedJustifications: 0 };
            
            stats.assigned++;
            if (proofSubmittedAt) {
                stats.completed++;
            } else if (justification) {
                stats.justifications++;
                if (justificationStatus === 'accepted') stats.acceptedJustifications++;
                if (justificationStatus === 'rejected') stats.missed++;
            } else {
                const deadline = toDateSafe(assignment.post?.expiresAt);
                if (deadline && deadline < new Date()) {
                    stats.missed++;
                }
            }
            promoterStats.set(promoterId, stats);
        });

        const performanceMap = new Map<string, number>();
        promoterStats.forEach((stats, promoterId) => {
            if (stats.assigned > 0) {
                const successfulOutcomes = stats.completed + stats.acceptedJustifications;
                performanceMap.set(promoterId, Math.round((successfulOutcomes / stats.assigned) * 100));
            }
        });
        return performanceMap;

    }, [allAssignments]);

    const filteredPromoters = useMemo(() => {
        let promoters = allPromoters;

        // Search query filter
        if (searchQuery) {
            const lowercasedQuery = searchQuery.toLowerCase();
            promoters = promoters.filter(p =>
                p.name.toLowerCase().includes(lowercasedQuery) ||
                p.email.toLowerCase().includes(lowercasedQuery) ||
                (p.instagram && p.instagram.toLowerCase().includes(lowercasedQuery))
            );
        }
        
        // Color/performance filter
        if (colorFilter !== 'all') {
            promoters = promoters.filter(p => {
                const rate = promoterPerformanceMap.get(p.id);
                if (rate === undefined || rate < 0) return false;

                if (colorFilter === 'green') return rate === 100;
                if (colorFilter === 'blue') return rate >= 60 && rate < 100;
                if (colorFilter === 'yellow') return rate >= 31 && rate < 60;
                if (colorFilter === 'red') return rate <= 30;
                return false;
            });
        }
        
        // Age filter
        const min = parseInt(minAge, 10);
        const max = parseInt(maxAge, 10);
        if (!isNaN(min) || !isNaN(max)) {
            promoters = promoters.filter(p => {
                const age = getAgeAsNumber(p.dateOfBirth);
                if (age === null) return false;
                const passesMin = isNaN(min) || age >= min;
                const passesMax = isNaN(max) || age <= max;
                return passesMin && passesMax;
            });
        }
        
        // Sorting
        promoters.sort((a, b) => {
            const aPerf = promoterPerformanceMap.get(a.id) ?? -1;
            const bPerf = promoterPerformanceMap.get(b.id) ?? -1;
            
            if (aPerf !== bPerf) {
                return bPerf - aPerf; // Higher performance first
            }
            // Fallback to creation date if performance is equal
            const timeA = (a.createdAt as Timestamp)?.toMillis() || 0;
            const timeB = (b.createdAt as Timestamp)?.toMillis() || 0;
            return timeB - timeA;
        });

        return promoters;

    }, [allPromoters, searchQuery, promoterPerformanceMap, colorFilter, minAge, maxAge]);
    
    const paginatedPromoters = useMemo(() => {
        const startIndex = (currentPage - 1) * PROMOTERS_PER_PAGE;
        return filteredPromoters.slice(startIndex, startIndex + PROMOTERS_PER_PAGE);
    }, [filteredPromoters, currentPage]);

    const totalPages = Math.ceil(filteredPromoters.length / PROMOTERS_PER_PAGE);
    
    // --- Render Functions ---
    const renderPagination = () => (
        <div className="flex justify-between items-center mt-6 text-sm">
            <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-gray-600 rounded-md disabled:opacity-50"
            >
                Anterior
            </button>
            <span>Página {currentPage} de {totalPages} ({filteredPromoters.length} resultados)</span>
            <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-4 py-2 bg-gray-600 rounded-md disabled:opacity-50"
            >
                Próxima
            </button>
        </div>
    );
    
    const renderSuperAdminFilters = () => (
         <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <select value={selectedOrg} onChange={e => setSelectedOrg(e.target.value)} className="w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-700">
                <option value="all">Todas Organizações</option>
                {allOrganizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}
            </select>
            <select value={selectedState} onChange={e => setSelectedState(e.target.value)} className="w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-700">
                <option value="all">Todos Estados</option>
                {states.map(s => <option key={s.abbr} value={s.abbr}>{s.name}</option>)}
            </select>
             <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-700">
                <option value="all">Todos Eventos</option>
                {campaignsInScope.map(c => <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>)}
            </select>
        </div>
    );
    
    const renderAdminFilters = () => (
        <div className="flex gap-4 mb-4">
            <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} className="w-full md:w-1/3 px-3 py-1.5 border border-gray-600 rounded-md bg-gray-700">
                <option value="all">Todos meus eventos</option>
                {campaignsInScope.map(c => <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>)}
            </select>
        </div>
    );

    const renderPromoterCard = (promoter: Promoter) => {
        const perfRate = promoterPerformanceMap.get(promoter.id);
        const isLoadingAction = processingId === promoter.id;
        const isNotifyingAction = notifyingId === promoter.id;
        return (
            <div key={promoter.id} className="bg-dark/70 rounded-lg shadow-sm flex flex-col overflow-hidden">
                <div className="p-4 flex flex-col flex-grow">
                    <div className="flex justify-between items-start">
                        <div className="flex items-center gap-4">
                            <img
                                src={promoter.photoUrls[0]}
                                alt={promoter.name}
                                className="w-16 h-16 object-cover rounded-full cursor-pointer"
                                onClick={() => openPhotoViewer(promoter.photoUrls)}
                            />
                            <div>
                                <p className="font-bold text-lg text-white">{promoter.name}</p>
                                <p className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</p>
                                {isSuperAdmin && <p className="text-xs text-gray-500">{promoter.organizationId.substring(0,8)}</p>}
                            </div>
                        </div>
                         <div className="text-right flex-shrink-0">
                            {perfRate !== undefined && perfRate >= 0 && (
                                <p className={`text-xl font-bold ${getPerformanceColor(perfRate)}`}>{perfRate}%</p>
                            )}
                            <p className="text-xs text-gray-400">{promoter.campaignName || 'Geral'}</p>
                        </div>
                    </div>
                     <div className="flex items-center gap-4 text-sm text-gray-400 mt-3">
                        <a href={`https://instagram.com/${promoter.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><InstagramIcon className="w-4 h-4"/> <span>{promoter.instagram}</span></a>
                        {promoter.tiktok && <a href={`https://tiktok.com/${promoter.tiktok.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-primary"><TikTokIcon className="w-4 h-4"/> <span>{promoter.tiktok}</span></a>}
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Cadastro: {formatRelativeTime(promoter.createdAt as Timestamp)}</p>
                    {promoter.lastManualNotificationAt && <p className="text-xs text-blue-400 mt-1">Última notificação: {formatRelativeTime(promoter.lastManualNotificationAt as Timestamp)}</p>}

                    <div className="mt-auto pt-4 border-t border-gray-700/50 mt-4">
                         {filter === 'pending' && canManage && (
                             <div className="flex gap-2">
                                <button onClick={() => handlePromoterUpdate(promoter.id, 'approved')} disabled={isLoadingAction} className="flex-1 px-3 py-2 bg-green-600 text-white rounded-md text-sm font-semibold disabled:opacity-50">Aprovar</button>
                                <button onClick={() => openRejectionModal(promoter)} disabled={isLoadingAction} className="flex-1 px-3 py-2 bg-red-600 text-white rounded-md text-sm font-semibold disabled:opacity-50">Rejeitar</button>
                            </div>
                         )}
                         {(filter === 'approved' || filter === 'rejected_editable') && canManage && (
                             <button onClick={() => handleSendNotification(promoter)} disabled={isNotifyingAction} className="w-full px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold disabled:opacity-50">
                                {isNotifyingAction ? 'Enviando...' : 'Reenviar Notificação'}
                            </button>
                         )}
                    </div>
                </div>
                <div className="bg-black/20 p-2 flex justify-end gap-3 text-sm">
                    <button onClick={() => openEditModal(promoter)} className="text-indigo-400 hover:text-indigo-300">Detalhes</button>
                    {canManage && <button onClick={() => handleDelete(promoter)} disabled={isLoadingAction} className="text-red-400 hover:text-red-300 disabled:opacity-50">Deletar</button>}
                </div>
            </div>
        );
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                 <div>
                    <h1 className="text-3xl font-bold">Painel de Divulgadoras</h1>
                    <p className="text-gray-400">{organization?.name || (isSuperAdmin ? 'Todas as Organizações' : '')}</p>
                </div>
                <div className="flex items-center gap-4">
                     <button onClick={handleOpenLookup} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-semibold">
                        Buscar por Email
                    </button>
                    {canManage && <Link to="/admin/settings" className="p-2.5 bg-gray-600 rounded-md hover:bg-gray-500"><CogIcon className="w-5 h-5"/></Link>}
                </div>
            </div>
            
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 text-center">
                {(['all', 'pending', 'approved', 'rejected', 'removed'] as const).map(f => (
                    <button key={f} onClick={() => setFilter(f)} className={`p-4 rounded-lg transition-all ${filter === f ? 'bg-primary text-white scale-105 shadow-lg' : 'bg-secondary hover:bg-gray-700/50'}`}>
                        <p className="text-sm uppercase tracking-wider opacity-80">{{all: 'Total', pending: 'Pendentes', approved: 'Aprovadas', rejected: 'Rejeitadas', removed: 'Removidas'}[f]}</p>
                        <p className="text-3xl font-bold">{f === 'all' ? stats.total : stats[f]}</p>
                    </button>
                ))}
            </div>

            <div className="bg-secondary p-4 rounded-lg shadow-lg">
                {isSuperAdmin ? renderSuperAdminFilters() : renderAdminFilters()}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <input type="text" placeholder="Buscar por nome, email, @" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full col-span-1 sm:col-span-2 px-3 py-1.5 border border-gray-600 rounded-md bg-gray-700" />
                    <div className="flex items-center gap-2">
                        <input type="number" placeholder="Idade Mín." value={minAge} onChange={e => setMinAge(e.target.value)} className="w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-700" />
                        <input type="number" placeholder="Idade Máx." value={maxAge} onChange={e => setMaxAge(e.target.value)} className="w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-700" />
                    </div>
                     <div className="flex space-x-1 p-1 bg-dark/70 rounded-lg">
                        {(['all', 'green', 'blue', 'yellow', 'red'] as const).map(f => (
                            <button key={f} onClick={() => setColorFilter(f)} className={`flex-1 px-2 py-1 text-xs font-medium rounded-md transition-colors ${colorFilter === f ? 'bg-primary text-white' : 'text-gray-300 hover:bg-gray-700'}`}>
                                {{'all': 'Todos', 'green': 'Verde', 'blue': 'Azul', 'yellow': 'Laranja', 'red': 'Vermelho'}[f]}
                            </button>
                        ))}
                    </div>
                </div>

                {isLoading ? <div className="text-center py-10">Carregando divulgadoras...</div> : error ? <div className="text-red-400 text-center py-10">{error}</div> : (
                    <>
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {paginatedPromoters.map(renderPromoterCard)}
                        </div>
                        {filteredPromoters.length === 0 && <p className="text-center text-gray-400 py-10">Nenhuma divulgadora encontrada com os filtros atuais.</p>}
                        {totalPages > 1 && renderPagination()}
                    </>
                )}
            </div>

            {/* Modals */}
            <PhotoViewerModal isOpen={isPhotoViewerOpen} onClose={() => setIsPhotoViewerOpen(false)} imageUrls={photoViewerUrls} startIndex={photoViewerStartIndex} />
            <EditPromoterModal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} promoter={editingPromoter} onSave={handleSavePromoter} />
            <RejectionModal isOpen={isRejectionModalOpen} onClose={() => setIsRejectionModalOpen(false)} onConfirm={handleConfirmRejection} reasons={rejectionReasons} />
            {canManage && <ManageReasonsModal isOpen={isReasonsModalOpen} onClose={() => setIsReasonsModalOpen(false)} onReasonsUpdated={async () => setRejectionReasons(await getRejectionReasons(organizationIdForReasons!))} organizationId={organizationIdForReasons!} />}
            {isSuperAdmin && <PromoterLookupModal isOpen={isLookupModalOpen} onClose={() => setIsLookupModalOpen(false)} isLoading={isLookingUp} error={lookupError} results={lookupResults} onGoToPromoter={handleGoToPromoter} organizationsMap={Object.fromEntries(allOrganizations.map(o => [o.id, o.name]))} />}
        </div>
    );
};
