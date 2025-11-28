
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
  
  let date: Date;
  if (typeof timestamp.toDate === 'function') {
      date = timestamp.toDate();
  } else if (typeof timestamp === 'object' && (timestamp.seconds !== undefined || timestamp._seconds !== undefined)) {
      const seconds = timestamp.seconds || timestamp._seconds;
      date = new Date(seconds * 1000);
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
    
    // Handle standard Firestore Timestamp with toDate() method
    if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
    } 
    // Handle plain object Timestamp (e.g. { seconds: ..., nanoseconds: ... })
    else if (typeof timestamp === 'object' && (timestamp.seconds !== undefined || timestamp._seconds !== undefined)) {
        const seconds = timestamp.seconds || timestamp._seconds;
        date = new Date(seconds * 1000);
    } 
    // Handle Date object, string, or number
    else {
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
    if (typeof timestamp === 'object' && (timestamp.seconds !== undefined || timestamp._seconds !== undefined)) {
        const seconds = timestamp.seconds || timestamp._seconds;
        return new Date(seconds * 1000);
    }
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

    // Calculate effective org ID for logic: if regular admin, use assigned org. If superadmin, use filter if set, otherwise undefined (global scope)
    // BUT for fetching data initially, we need to respect the role scope.
    // Regular admin: scoped to selectedOrgId
    // Super admin: global
    const fetchScopeOrgId = isSuperAdmin ? undefined : selectedOrgId;

    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError('');
        try {
            // 1. Fetch Promoters
            const promotersData = await getAllPromoters({
                organizationId: fetchScopeOrgId,
                statesForScope: adminData.assignedStates && adminData.assignedStates.length > 0 ? adminData.assignedStates : null,
                status: filter,
                selectedCampaign: selectedCampaign,
                filterOrgId: selectedOrg,
                filterState: selectedState,
                assignedCampaignsForScope: adminData.assignedCampaigns
            });
            setAllPromoters(promotersData);

            // 2. Fetch Assignments (Optimized: only if needed for stats or filtering by performance)
            // We fetch assignments scoped to the org if selected, or all if superadmin global view (careful with size)
            // Ideally we only fetch stats summaries, but existing logic relies on assignments array.
            // For now, let's fetch assignments only if looking at approved or specific org context to save bandwidth
            if (fetchScopeOrgId || selectedOrg !== 'all') {
                const orgIdForAssignments = fetchScopeOrgId || selectedOrg;
                if (orgIdForAssignments && orgIdForAssignments !== 'all') {
                    const assignmentsData = await getAssignmentsForOrganization(orgIdForAssignments);
                    setAllAssignments(assignmentsData);
                } else {
                    setAllAssignments([]);
                }
            }

            // 3. Fetch Organization Metadata
            if (selectedOrgId) {
                const orgData = await getOrganization(selectedOrgId);
                setOrganization(orgData);
                
                const reasonsData = await getRejectionReasons(selectedOrgId);
                setRejectionReasons(reasonsData);
            }

            // 4. Fetch Filters Metadata (Superadmin)
            if (isSuperAdmin) {
                // Parallelize these fetches
                const [orgs, campaigns] = await Promise.all([
                    getOrganizations(),
                    getAllCampaigns()
                ]);
                setAllOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name)));
                setAllCampaigns(campaigns.sort((a,b) => a.name.localeCompare(b.name)));
            } else if (fetchScopeOrgId) {
                // Fetch campaigns for regular admin's org
                const campaigns = await getAllCampaigns(fetchScopeOrgId);
                setAllCampaigns(campaigns.sort((a,b) => a.name.localeCompare(b.name)));
            }

            // 5. Fetch Counts
            const statsData = await getPromoterStats({
                organizationId: fetchScopeOrgId,
                statesForScope: adminData.assignedStates && adminData.assignedStates.length > 0 ? adminData.assignedStates : null,
                filterOrgId: selectedOrg,
                filterState: selectedState,
                selectedCampaign: selectedCampaign
            });
            setStats(statsData);

        } catch (err: any) {
            setError(err.message || 'Falha ao carregar dados.');
        } finally {
            setIsLoading(false);
        }
    }, [fetchScopeOrgId, selectedOrgId, filter, selectedOrg, selectedState, selectedCampaign, isSuperAdmin, adminData]);

    useEffect(() => {
        fetchData();
        setCurrentPage(1);
    }, [fetchData]);

    const handleApprove = async (promoter: Promoter) => {
        if (!window.confirm(`Tem certeza que deseja aprovar ${promoter.name}?`)) return;
        setProcessingId(promoter.id);
        setError('');
        try {
            await updatePromoter(promoter.id, {
                status: 'approved',
                actionTakenByUid: adminData.uid,
                actionTakenByEmail: adminData.email,
                statusChangedAt: firebase.firestore.Timestamp.now(), // Use standard Timestamp
            });
            setAllPromoters(prev => prev.filter(p => p.id !== promoter.id));
            setStats(prev => ({ ...prev, pending: prev.pending - 1, approved: prev.approved + 1 }));
        } catch (err: any) {
            setError(err.message || 'Falha ao aprovar.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleOpenRejectionModal = (promoter: Promoter) => {
        setRejectingPromoter(promoter);
        setIsRejectionModalOpen(true);
    };

    const handleConfirmRejection = async (reason: string, allowEdit: boolean) => {
        if (!rejectingPromoter) return;
        setProcessingId(rejectingPromoter.id);
        setError('');
        setIsRejectionModalOpen(false); // Close immediately
        
        try {
            const newStatus = allowEdit ? 'rejected_editable' : 'rejected';
            await updatePromoter(rejectingPromoter.id, {
                status: newStatus,
                rejectionReason: reason,
                actionTakenByUid: adminData.uid,
                actionTakenByEmail: adminData.email,
                statusChangedAt: firebase.firestore.Timestamp.now(), // Use standard Timestamp
            });
            
            // Optimistic update
            setAllPromoters(prev => prev.filter(p => p.id !== rejectingPromoter.id));
            setStats(prev => ({ ...prev, pending: prev.pending - 1, rejected: prev.rejected + 1 }));

        } catch (err: any) {
            setError(err.message || 'Falha ao rejeitar.');
        } finally {
            setProcessingId(null);
            setRejectingPromoter(null);
        }
    };

    const handleRemove = async (promoter: Promoter) => {
        if (!window.confirm(`Tem certeza que deseja REMOVER ${promoter.name} da equipe? Ela perderá o acesso e terá que se cadastrar novamente.`)) return;
        setProcessingId(promoter.id);
        setError('');
        try {
            const setPromoterStatusToRemoved = functions.httpsCallable('setPromoterStatusToRemoved');
            await setPromoterStatusToRemoved({ promoterId: promoter.id });
            
            setAllPromoters(prev => prev.filter(p => p.id !== promoter.id));
            setStats(prev => ({ ...prev, approved: prev.approved - 1, removed: prev.removed + 1 }));
        } catch (err: any) {
            setError(err.message || 'Falha ao remover.');
        } finally {
            setProcessingId(null);
        }
    };

    const handleEditSave = async (id: string, data: Partial<Promoter>) => {
        try {
            // Include admin trace
            const updateData = {
                ...data,
                // Only update trace info if status changes
                ...(data.status && data.status !== editingPromoter?.status ? {
                    actionTakenByUid: adminData.uid,
                    actionTakenByEmail: adminData.email,
                    statusChangedAt: firebase.firestore.Timestamp.now(),
                } : {})
            };

            await updatePromoter(id, updateData);
            
            // Refresh list if status changed (it might move out of the current filter view)
            if (data.status && data.status !== filter) {
                setAllPromoters(prev => prev.filter(p => p.id !== id));
            } else {
                setAllPromoters(prev => prev.map(p => p.id === id ? { ...p, ...data } : p));
            }
            
            // Refresh stats regardless
            fetchData(); 
        } catch (err: any) {
            alert(err.message);
        }
    };

    const handleDeleteForever = async (id: string) => {
        if (!window.confirm("ATENÇÃO: Isso deletará permanentemente o registro do banco de dados. Essa ação não pode ser desfeita. Confirmar?")) return;
        setProcessingId(id);
        try {
            await deletePromoter(id);
            setAllPromoters(prev => prev.filter(p => p.id !== id));
            // Simple stat decrement, accurate fetch happens on reload/filter change
            if (filter === 'pending') setStats(prev => ({ ...prev, pending: prev.pending - 1 }));
            if (filter === 'rejected') setStats(prev => ({ ...prev, rejected: prev.rejected - 1 }));
            if (filter === 'removed') setStats(prev => ({ ...prev, removed: prev.removed - 1 }));
        } catch (err: any) {
            alert(err.message);
        } finally {
            setProcessingId(null);
        }
    }

    const openPhotoViewer = (urls: string[], index: number) => {
        setPhotoViewerUrls(urls);
        setPhotoViewerStartIndex(index);
        setIsPhotoViewerOpen(true);
    };

    const promotersWithStats = useMemo(() => {
        if (allAssignments.length === 0 && colorFilter === 'all') {
            return allPromoters.map(p => ({ ...p, completionRate: -1 }));
        }

        const statsMap = new Map<string, { assigned: number; completed: number; acceptedJustifications: number }>();
        const now = new Date();

        allAssignments.forEach(a => {
            if (!a.post) return;
            const stat = statsMap.get(a.promoterId) || { assigned: 0, completed: 0, acceptedJustifications: 0 };
            
            // Only count active or past posts, ignore future scheduled ones if they somehow appear
            // Simplified logic: assignment exists -> count it
            stat.assigned++;

            if (a.proofSubmittedAt) {
                stat.completed++;
            } else if (a.justificationStatus === 'accepted') {
                stat.acceptedJustifications++;
            }
            // Logic for pending/missed is implicit in the ratio
            statsMap.set(a.promoterId, stat);
        });

        return allPromoters.map(p => {
            const stats = statsMap.get(p.id);
            const successfulOutcomes = stats ? stats.completed + stats.acceptedJustifications : 0;
            const completionRate = stats && stats.assigned > 0
                ? Math.round((successfulOutcomes / stats.assigned) * 100)
                : -1;
            return { ...p, completionRate };
        });
    }, [allPromoters, allAssignments, colorFilter]);

    // Filtering Logic
    const filteredPromoters = useMemo(() => {
        return promotersWithStats.filter(promoter => {
            // Search Query
            const query = searchQuery.toLowerCase();
            const matchesSearch = 
                promoter.name.toLowerCase().includes(query) ||
                promoter.email.toLowerCase().includes(query) ||
                (promoter.instagram && promoter.instagram.toLowerCase().includes(query));
            
            if (!matchesSearch) return false;

            // Age Filter
            if (minAge || maxAge) {
                const age = getAgeAsNumber(promoter.dateOfBirth);
                if (age === null) return false; // Exclude if age unknown when filtering by age
                if (minAge && age < parseInt(minAge)) return false;
                if (maxAge && age > parseInt(maxAge)) return false;
            }

            // Color/Performance Filter
            if (colorFilter !== 'all') {
                const rate = promoter.completionRate;
                if (rate < 0) return false; // No data
                if (colorFilter === 'green' && rate !== 100) return false;
                if (colorFilter === 'blue' && (rate < 60 || rate >= 100)) return false;
                if (colorFilter === 'yellow' && (rate < 31 || rate >= 60)) return false;
                if (colorFilter === 'red' && (rate >= 31)) return false; // red includes 0 to 30
            }

            return true;
        });
    }, [promotersWithStats, searchQuery, minAge, maxAge, colorFilter]);

    // Pagination Logic
    const totalPages = Math.ceil(filteredPromoters.length / PROMOTERS_PER_PAGE);
    const paginatedPromoters = filteredPromoters.slice(
        (currentPage - 1) * PROMOTERS_PER_PAGE,
        currentPage * PROMOTERS_PER_PAGE
    );

    // Filter organizations for dropdown to exclude deactivated ones if needed, or just sort
    const orgsForFilter = useMemo(() => {
        return allOrganizations.sort((a,b) => a.name.localeCompare(b.name));
    }, [allOrganizations]);

    // Filter campaigns based on selected state/org context
    const campaignsForFilter = useMemo(() => {
        let filtered = allCampaigns;
        if (selectedOrg !== 'all') {
            filtered = filtered.filter(c => c.organizationId === selectedOrg);
        }
        if (selectedState !== 'all') {
            filtered = filtered.filter(c => c.stateAbbr === selectedState);
        }
        return filtered;
    }, [allCampaigns, selectedOrg, selectedState]);

    const handleLookupSearch = async () => {
        if (!lookupEmail.trim()) return;
        setIsLookingUp(true);
        setLookupError(null);
        setLookupResults(null);
        try {
            const results = await findPromotersByEmail(lookupEmail);
            setLookupResults(results);
            setIsLookupModalOpen(true);
        } catch (err: any) {
            setLookupError(err.message);
            setIsLookupModalOpen(true); // Show modal with error
        } finally {
            setIsLookingUp(false);
        }
    };

    const handleGoToPromoter = (promoter: Promoter) => {
        setIsLookupModalOpen(false);
        // Reset filters to find this promoter
        setFilter(promoter.status);
        if (isSuperAdmin) {
            setSelectedOrg(promoter.organizationId);
            setSelectedState(promoter.state);
            setSelectedCampaign(promoter.campaignName || 'all');
        }
        setSearchQuery(promoter.email); // Filter list by this email
    };

    // Helper map for org names in lookup modal
    const orgNameMap = useMemo(() => {
        return allOrganizations.reduce((acc, org) => {
            acc[org.id] = org.name;
            return acc;
        }, {} as Record<string, string>);
    }, [allOrganizations]);

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div>
                    <h1 className="text-3xl font-bold">
                        {isSuperAdmin ? 'Todas as Divulgadoras' : (organization?.name || 'Painel do Organizador')}
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">
                        Gerencie aprovações, cadastros e status da equipe.
                    </p>
                </div>
                
                <div className="flex gap-3">
                    <button onClick={() => setIsReasonsModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-md text-sm transition-colors">
                        <CogIcon className="w-4 h-4" />
                        <span>Motivos de Recusa</span>
                    </button>
                    {isSuperAdmin && (
                        <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Buscar email em tudo..." 
                                value={lookupEmail}
                                onChange={(e) => setLookupEmail(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleLookupSearch()}
                                className="pl-3 pr-10 py-2 bg-gray-800 border border-gray-600 rounded-md text-sm text-white w-64 focus:ring-1 focus:ring-primary focus:outline-none"
                            />
                            <button onClick={handleLookupSearch} disabled={isLookingUp} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                                {isLookingUp ? <div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div> : <UsersIcon className="w-4 h-4" />}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-secondary shadow-lg rounded-lg p-4 mb-6 space-y-4">
                {/* Main Filters Row */}
                <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                    {/* Status Tabs */}
                    <div className="flex space-x-1 p-1 bg-dark/50 rounded-lg overflow-x-auto w-full lg:w-auto">
                        {(['pending', 'approved', 'rejected', 'removed', 'all'] as const).map((s) => (
                            <button
                                key={s}
                                onClick={() => { setFilter(s); setCurrentPage(1); }}
                                className={`flex-1 lg:flex-none px-4 py-2 text-sm font-medium rounded-md transition-all whitespace-nowrap ${
                                    filter === s ? 'bg-primary text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-700'
                                }`}
                            >
                                {{'pending': 'Pendentes', 'approved': 'Aprovadas', 'rejected': 'Rejeitadas', 'removed': 'Removidas', 'all': 'Todas'}[s]}
                                <span className="ml-2 text-xs opacity-70 bg-black/20 px-1.5 py-0.5 rounded-full">
                                    {s === 'all' ? stats.total : stats[s as keyof typeof stats] ?? 0}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div className="relative w-full lg:w-96">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Buscar por nome, email ou @instagram..."
                            value={searchQuery}
                            onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-10 pr-4 py-2 bg-dark border border-gray-600 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary sm:text-sm"
                        />
                    </div>
                </div>

                {/* Advanced Filters Row (Collapsible or Always Visible) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-gray-700/50">
                    {/* Organization Filter (SuperAdmin Only) */}
                    {isSuperAdmin && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Organização</label>
                            <select
                                value={selectedOrg}
                                onChange={(e) => { setSelectedOrg(e.target.value); setCurrentPage(1); }}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md text-sm text-white px-2 py-1.5"
                            >
                                <option value="all">Todas</option>
                                {allOrganizations.map(org => (
                                    <option key={org.id} value={org.id}>{org.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* State Filter */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Estado</label>
                        <select
                            value={selectedState}
                            onChange={(e) => { setSelectedState(e.target.value); setCurrentPage(1); }}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md text-sm text-white px-2 py-1.5"
                        >
                            <option value="all">Todos</option>
                            {/* Filter available states based on scope */}
                            {states.filter(s => 
                                isSuperAdmin || // Superadmin sees all
                                !adminData.assignedStates || // Admin with no restriction sees all
                                adminData.assignedStates.includes(s.abbr) // Restricted admin sees only assigned
                            ).map(s => (
                                <option key={s.abbr} value={s.abbr}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Campaign Filter */}
                    <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">Evento / Gênero</label>
                        <select
                            value={selectedCampaign}
                            onChange={(e) => { setSelectedCampaign(e.target.value); setCurrentPage(1); }}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md text-sm text-white px-2 py-1.5"
                        >
                            <option value="all">Todos</option>
                            {campaignsForFilter.map(c => (
                                <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Performance/Color Filter (Only relevant for approved/all) */}
                    {filter !== 'pending' && filter !== 'rejected' && (
                        <div>
                            <label className="block text-xs font-medium text-gray-400 mb-1">Desempenho</label>
                            <div className="flex gap-1">
                                {(['all', 'green', 'blue', 'yellow', 'red'] as const).map(c => (
                                    <button
                                        key={c}
                                        onClick={() => { setColorFilter(c); setCurrentPage(1); }}
                                        className={`w-6 h-6 rounded-full border border-gray-600 flex items-center justify-center transition-transform hover:scale-110 ${
                                            colorFilter === c ? 'ring-2 ring-white scale-110' : 'opacity-70 hover:opacity-100'
                                        } ${
                                            c === 'all' ? 'bg-gray-600' :
                                            c === 'green' ? 'bg-green-500' :
                                            c === 'blue' ? 'bg-blue-500' :
                                            c === 'yellow' ? 'bg-yellow-500' :
                                            'bg-red-500'
                                        }`}
                                        title={c === 'all' ? 'Todos' : 'Filtrar por cor'}
                                    >
                                        {c === 'all' && <span className="text-[10px]">T</span>}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content Table */}
            <div className="bg-secondary shadow-lg rounded-lg overflow-hidden">
                {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700/50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider w-16">Foto</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Dados Pessoais</th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Local & Evento</th>
                                        {filter !== 'pending' && <th className="px-6 py-3 text-center text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>}
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-secondary divide-y divide-gray-700">
                                    {paginatedPromoters.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-10 text-center text-gray-400">
                                                Nenhum registro encontrado com os filtros atuais.
                                            </td>
                                        </tr>
                                    ) : (
                                        paginatedPromoters.map((promoter) => (
                                            <tr key={promoter.id} className="hover:bg-gray-700/30 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="flex items-center">
                                                        <div className="h-12 w-12 rounded-lg overflow-hidden bg-gray-700 flex-shrink-0 border border-gray-600 relative group cursor-pointer" onClick={() => openPhotoViewer(promoter.photoUrls, 0)}>
                                                            {promoter.photoUrls.length > 0 ? (
                                                                <img className="h-full w-full object-cover" src={promoter.photoUrls[0]} alt="" />
                                                            ) : (
                                                                <UsersIcon className="h-6 w-6 text-gray-400 m-auto" />
                                                            )}
                                                            <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center">
                                                                <span className="text-xs text-white">Ver</span>
                                                            </div>
                                                        </div>
                                                        {promoter.facePhotoUrl && (
                                                            <div 
                                                                className="h-8 w-8 rounded-full overflow-hidden bg-gray-700 border-2 border-gray-800 -ml-3 z-10 cursor-pointer hover:scale-110 transition-transform" 
                                                                title="Foto de Rosto"
                                                                onClick={() => openPhotoViewer([promoter.facePhotoUrl!], 0)}
                                                            >
                                                                <img className="h-full w-full object-cover" src={promoter.facePhotoUrl} alt="Rosto" />
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <span className={`text-sm font-medium ${getPerformanceColor(promoter.completionRate)}`}>
                                                            {promoter.name}
                                                        </span>
                                                        <span className="text-xs text-gray-400">{promoter.email}</span>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            <a href={`https://wa.me/55${promoter.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:text-green-300 transition-colors" title="WhatsApp">
                                                                <WhatsAppIcon className="w-4 h-4" />
                                                            </a>
                                                            <a href={`https://instagram.com/${promoter.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-pink-400 hover:text-pink-300 transition-colors" title="Instagram">
                                                                <InstagramIcon className="w-4 h-4" />
                                                            </a>
                                                            {promoter.tiktok && (
                                                                <a href={`https://tiktok.com/@${promoter.tiktok.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-white transition-colors" title="TikTok">
                                                                    <TikTokIcon className="w-4 h-4" />
                                                                </a>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-gray-500 mt-1">
                                                            {calculateAge(promoter.dateOfBirth)}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-200">{promoter.state ? stateMap[promoter.state.toUpperCase()] : 'N/A'}</div>
                                                    <div className="text-xs text-primary mt-0.5">{promoter.campaignName || 'Geral'}</div>
                                                    <div className="text-xs text-gray-500 mt-1" title={new Date( (promoter.createdAt as any).seconds * 1000).toLocaleString()}>
                                                        {formatRelativeTime(promoter.createdAt)}
                                                    </div>
                                                    <PromoterHistoryBadge promoter={promoter} allPromoters={allPromoters} onClick={setSearchQuery} />
                                                </td>
                                                
                                                {/* Info/Status Column */}
                                                {filter !== 'pending' && (
                                                    <td className="px-6 py-4 whitespace-nowrap text-center">
                                                        <div className="flex flex-col items-center">
                                                            {/* Group Status */}
                                                            {promoter.hasJoinedGroup ? (
                                                                <span className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300 mb-1" title="Entrou no Grupo">
                                                                    No Grupo
                                                                </span>
                                                            ) : (
                                                                <span className="px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-700 text-gray-400 mb-1" title="Ainda não entrou">
                                                                    Pendente
                                                                </span>
                                                            )}
                                                            
                                                            {/* Action By Info */}
                                                            {promoter.statusChangedAt && (
                                                                <div className="text-[10px] text-gray-500 mt-1 flex flex-col items-center group relative cursor-help">
                                                                    <span>{formatDate(promoter.statusChangedAt)}</span>
                                                                    {promoter.actionTakenByEmail && (
                                                                        <div className="hidden group-hover:block absolute bottom-full mb-1 bg-black text-white text-xs p-1 rounded z-10 whitespace-nowrap">
                                                                            {getActionLabel(promoter.status)}: {promoter.actionTakenByEmail}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                )}

                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex justify-end gap-2">
                                                        {filter === 'pending' && (
                                                            <>
                                                                <button 
                                                                    onClick={() => handleApprove(promoter)} 
                                                                    disabled={processingId === promoter.id}
                                                                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
                                                                >
                                                                    Aprovar
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleOpenRejectionModal(promoter)} 
                                                                    disabled={processingId === promoter.id}
                                                                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded transition-colors disabled:opacity-50"
                                                                >
                                                                    Rejeitar
                                                                </button>
                                                            </>
                                                        )}
                                                        <button 
                                                            onClick={() => { setEditingPromoter(promoter); setIsEditModalOpen(true); }}
                                                            className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-700"
                                                            title="Editar"
                                                        >
                                                            <CogIcon className="w-5 h-5" />
                                                        </button>
                                                        {filter !== 'pending' && filter !== 'removed' && (
                                                            <button 
                                                                onClick={() => handleRemove(promoter)}
                                                                disabled={processingId === promoter.id}
                                                                className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-gray-700"
                                                                title="Remover da Equipe"
                                                            >
                                                                <LogoutIcon className="w-5 h-5" />
                                                            </button>
                                                        )}
                                                        {isSuperAdmin && (
                                                            <button
                                                                onClick={() => handleDeleteForever(promoter.id)}
                                                                className="text-red-600 hover:text-red-500 p-1 rounded hover:bg-gray-700 ml-2"
                                                                title="Deletar Permanentemente (SuperAdmin)"
                                                            >
                                                                X
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {filteredPromoters.length > PROMOTERS_PER_PAGE && (
                            <div className="bg-gray-700/50 px-4 py-3 flex items-center justify-between border-t border-gray-700 sm:px-6">
                                <div className="flex-1 flex justify-between sm:hidden">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center px-4 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-200 bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={currentPage === totalPages}
                                        className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-600 text-sm font-medium rounded-md text-gray-200 bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
                                    >
                                        Próxima
                                    </button>
                                </div>
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-sm text-gray-400">
                                            Mostrando <span className="font-medium">{(currentPage - 1) * PROMOTERS_PER_PAGE + 1}</span> a <span className="font-medium">{Math.min(currentPage * PROMOTERS_PER_PAGE, filteredPromoters.length)}</span> de <span className="font-medium">{filteredPromoters.length}</span> resultados
                                        </p>
                                    </div>
                                    <div>
                                        <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                            {Array.from({ length: totalPages }, (_, i) => (
                                                <button
                                                    key={i + 1}
                                                    onClick={() => setCurrentPage(i + 1)}
                                                    aria-current={currentPage === i + 1 ? 'page' : undefined}
                                                    className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                                                        currentPage === i + 1
                                                            ? 'z-10 bg-primary border-primary text-white'
                                                            : 'bg-gray-800 border-gray-600 text-gray-400 hover:bg-gray-700'
                                                    } ${i === 0 ? 'rounded-l-md' : ''} ${i === totalPages - 1 ? 'rounded-r-md' : ''}`}
                                                >
                                                    {i + 1}
                                                </button>
                                            ))}
                                        </nav>
                                    </div>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Modals */}
            <PhotoViewerModal
                isOpen={isPhotoViewerOpen}
                onClose={() => setIsPhotoViewerOpen(false)}
                imageUrls={photoViewerUrls}
                startIndex={photoViewerStartIndex}
            />
            
            <EditPromoterModal 
                isOpen={isEditModalOpen} 
                onClose={() => setIsEditModalOpen(false)} 
                promoter={editingPromoter} 
                onSave={handleEditSave}
            />

            <RejectionModal
                isOpen={isRejectionModalOpen}
                onClose={() => setIsRejectionModalOpen(false)}
                onConfirm={handleConfirmRejection}
                reasons={rejectionReasons}
            />

            <ManageReasonsModal
                isOpen={isReasonsModalOpen}
                onClose={() => setIsReasonsModalOpen(false)}
                onReasonsUpdated={fetchData} // Refresh reasons after update
                organizationId={selectedOrgId || ''}
            />

            <PromoterLookupModal
                isOpen={isLookupModalOpen}
                onClose={() => setIsLookupModalOpen(false)}
                isLoading={isLookingUp}
                error={lookupError}
                results={lookupResults}
                onGoToPromoter={handleGoToPromoter}
                organizationsMap={orgNameMap}
            />
        </div>
    );
};
