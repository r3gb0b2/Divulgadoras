

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { signOut } from 'firebase/auth';
import { auth, functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { getPromoters, updatePromoter, deletePromoter, getRejectionReasons } from '../services/promoterService';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { Promoter, AdminUserData, PromoterStatus, RejectionReason, Organization, Campaign } from '../types';
import { states } from '../constants/states';
import { Link } from 'react-router-dom';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import { CogIcon, UsersIcon, WhatsAppIcon, InstagramIcon, TikTokIcon } from '../components/Icons';
import { serverTimestamp } from 'firebase/firestore';

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
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<PromoterStatus | 'all'>('pending');
    const [searchQuery, setSearchQuery] = useState('');
    const [notifyingId, setNotifyingId] = useState<string | null>(null);

    // State for super admin filters
    const [allOrganizations, setAllOrganizations] = useState<Organization[]>([]);
    const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
    const [selectedOrg, setSelectedOrg] = useState('all');
    const [selectedState, setSelectedState] = useState('all');
    const [selectedCampaign, setSelectedCampaign] = useState('all');


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
            // For superadmin, only enable if a specific organization is selected
            return selectedOrg !== 'all' ? selectedOrg : null;
        }
        // For regular admin, use their own organizationId
        return adminData.organizationId || null;
    }, [isSuperAdmin, selectedOrg, adminData.organizationId]);


    const fetchData = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const orgId = isSuperAdmin ? undefined : adminData.organizationId;
            const states = isSuperAdmin ? null : adminData.assignedStates;
            
            if (!isSuperAdmin && !orgId) {
                throw new Error("Administrador não está vinculado a uma organização.");
            }

            // Base promises for all roles
            const promotersPromise = getPromoters(orgId, states);
            const reasonsPromise = orgId ? getRejectionReasons(orgId) : Promise.resolve([]);

            if (isSuperAdmin) {
                // Superadmin fetches everything
                const orgsPromise = getOrganizations();
                const campaignsPromise = getAllCampaigns();
    
                const [promotersData, reasonsData, orgsData, campaignsData] = await Promise.all([
                    promotersPromise,
                    reasonsPromise, // This will be an empty array as orgId is undefined
                    orgsPromise,
                    campaignsPromise,
                ]);
    
                setPromoters(promotersData);
                setRejectionReasons(reasonsData); // Empty, which is fine. The button is hidden.
                setAllOrganizations(orgsData.sort((a,b) => a.name.localeCompare(b.name)));
                setAllCampaigns(campaignsData);

            } else {
                 // Regular admin fetches scoped data
                const [promotersData, reasonsData] = await Promise.all([promotersPromise, reasonsPromise]);

                setRejectionReasons(reasonsData);
                
                // Further client-side filtering based on assigned campaigns for non-superadmins
                if (adminData.assignedCampaigns) {
                    const filtered = promotersData.filter(p => {
                        const campaignsForState = adminData.assignedCampaigns?.[p.state];
                        // If no campaigns are assigned for the state, admin can see all for that state.
                        if (!campaignsForState || campaignsForState.length === 0) return true;
                        // Otherwise, only show promoters from assigned campaigns.
                        return p.campaignName && campaignsForState.includes(p.campaignName);
                    });
                    setPromoters(filtered);
                } else {
                    setPromoters(promotersData);
                }
            }

        } catch (err: any) {
            setError(err.message || 'Não foi possível carregar as divulgadoras.');
        } finally {
            setIsLoading(false);
        }
    }, [adminData, isSuperAdmin]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleUpdatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        if (!canManage) return;
        try {
            const currentPromoter = promoters.find(p => p.id === id);
            const updatedData = { ...data };

            // If status is being set and is different from the current promoter's status
            if (data.status && data.status !== currentPromoter?.status) {
                updatedData.actionTakenByUid = adminData.uid;
                updatedData.actionTakenByEmail = adminData.email;
                updatedData.statusChangedAt = serverTimestamp();
            }
            
            await updatePromoter(id, updatedData);
            await fetchData(); // Refresh data
            alert("Status da divulgadora atualizado com sucesso.");
        } catch (error) {
            alert("Falha ao atualizar a divulgadora.");
            throw error;
        }
    };
    
    const handleConfirmReject = async (reason: string) => {
        if (rejectingPromoter && canManage) {
            await handleUpdatePromoter(rejectingPromoter.id, { status: 'rejected', rejectionReason: reason });
        }
        setIsRejectionModalOpen(false);
        setRejectingPromoter(null);
    };

    const handleManualNotify = async (promoterId: string) => {
        if (notifyingId) return;
        if (!window.confirm("Isso enviará um e-mail de notificação para esta divulgadora com base no seu status atual (Aprovado/Rejeitado). Deseja continuar?")) {
            return;
        }
        
        setNotifyingId(promoterId);
        try {
            const manuallySendStatusEmail = httpsCallable(functions, 'manuallySendStatusEmail');
            const result = await manuallySendStatusEmail({ promoterId });
            const data = result.data as { success: boolean, message: string, provider?: string };
            const providerName = data.provider || 'Brevo (v9.1)';
            alert(`${data.message || 'Notificação enviada com sucesso!'} (Provedor: ${providerName})`);
        } catch (error: any) {
            console.error("Failed to send manual notification:", error);
            const detailedError = error?.details?.originalError || error.message || 'Ocorreu um erro desconhecido.';
            const providerName = error?.details?.provider || 'Brevo (v9.1)';
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
                await fetchData(); // Refresh data
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
        // If superadmin, fetch reasons for the specific promoter's org
        if (isSuperAdmin && promoter.organizationId) {
            try {
                const reasons = await getRejectionReasons(promoter.organizationId);
                setRejectionReasons(reasons);
            } catch (e) {
                console.error("Failed to fetch rejection reasons for org:", promoter.organizationId, e);
                // Set to empty array to not show stale reasons from another org
                setRejectionReasons([]);
            }
        }
        setRejectingPromoter(promoter);
        setIsRejectionModalOpen(true);
    }
    
    const handleLogout = async () => {
        try {
            await signOut(auth);
            // The auth context will handle navigation
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

    const stats = useMemo(() => {
        const promoterSource = promoters; // Use all promoters before filtering for stats
        return {
          total: promoterSource.length,
          pending: promoterSource.filter(p => p.status === 'pending').length,
          approved: promoterSource.filter(p => p.status === 'approved').length,
          rejected: promoterSource.filter(p => p.status === 'rejected').length,
        };
      }, [promoters]);

    const filteredPromoters = useMemo(() => {
        const lowercasedQuery = searchQuery.toLowerCase().trim();
        
        return promoters.filter(p => {
            const statusMatch = filter === 'all' || p.status === filter;
            if (!statusMatch) return false;

            const queryMatch = lowercasedQuery === '' ||
                p.name.toLowerCase().includes(lowercasedQuery) ||
                p.email.toLowerCase().includes(lowercasedQuery) ||
                (p.whatsapp && p.whatsapp.replace(/\D/g, '').includes(lowercasedQuery.replace(/\D/g, ''))) ||
                (p.campaignName && p.campaignName.toLowerCase().includes(lowercasedQuery));
            if (!queryMatch) return false;

            if (isSuperAdmin) {
                const orgMatch = selectedOrg === 'all' || p.organizationId === selectedOrg;
                if (!orgMatch) return false;

                const stateMatch = selectedState === 'all' || p.state === selectedState;
                if (!stateMatch) return false;

                const campaignMatch = selectedCampaign === 'all' || p.campaignName === selectedCampaign;
                if (!campaignMatch) return false;
            }
            
            return true;
        });
    }, [promoters, filter, searchQuery, isSuperAdmin, selectedOrg, selectedState, selectedCampaign]);
    
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
        if (isLoading) return <div className="text-center py-10">Carregando divulgadoras...</div>;
        if (error) return <div className="text-red-400 text-center py-10">{error}</div>;
        if (filteredPromoters.length === 0) return <div className="text-center text-gray-400 py-10">Nenhuma divulgadora encontrada com o filtro selecionado.</div>;

        return (
            <div className="space-y-4">
                {filteredPromoters.map(promoter => (
                    <div key={promoter.id} className="bg-dark/70 p-4 rounded-lg shadow-sm">
                        <div className="flex flex-col sm:flex-row justify-between sm:items-start mb-3">
                            <div>
                                <p className="font-bold text-lg text-white">{promoter.name}</p>
                                {isSuperAdmin && <p className="text-xs text-gray-400 font-medium">{allOrganizations.find(o => o.id === promoter.organizationId)?.name || 'Organização Desconhecida'}</p>}
                                {promoter.campaignName && <p className="text-sm text-primary font-semibold">{promoter.campaignName}</p>}
                                <p className="text-sm text-gray-400">{promoter.email}</p>
                                <p className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</p>
                            </div>
                            <div className="mt-2 sm:mt-0 flex-shrink-0">{getStatusBadge(promoter.status)}</div>
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
                        
                        {canManage && (
                            <div className="border-t border-gray-700 mt-3 pt-3 flex flex-wrap gap-y-2 justify-between items-center text-sm font-medium">
                                <div>
                                    {promoter.status === 'approved' && (
                                        <label className="flex items-center space-x-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={!!promoter.hasJoinedGroup} 
                                                onChange={(e) => handleUpdatePromoter(promoter.id, { hasJoinedGroup: e.target.checked })}
                                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                            />
                                            <span className="text-gray-300">Entrou no grupo</span>
                                        </label>
                                    )}
                                </div>
                                
                                <div className="flex flex-wrap gap-x-4 gap-y-2 justify-end">
                                    {promoter.status === 'pending' && (
                                        <>
                                            <button onClick={() => handleUpdatePromoter(promoter.id, {status: 'approved'})} className="text-green-400 hover:text-green-300">Aprovar</button>
                                            <button onClick={() => openRejectionModal(promoter)} className="text-red-400 hover:text-red-300">Rejeitar</button>
                                        </>
                                    )}
                                    {(promoter.status === 'approved' || promoter.status === 'rejected') && (
                                        <button
                                            onClick={() => handleManualNotify(promoter.id)}
                                            disabled={notifyingId === promoter.id}
                                            className="text-blue-400 hover:text-blue-300 disabled:text-gray-500 disabled:cursor-wait"
                                        >
                                            {notifyingId === promoter.id ? 'Enviando...' : 'Notificar Manualmente'}
                                        </button>
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
                <h1 className="text-3xl font-bold">Painel do Organizador</h1>
                <div className="flex items-center gap-2">
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
                    onReasonsUpdated={fetchData}
                />
            )}

        </div>
    );
};

export default AdminPanel;