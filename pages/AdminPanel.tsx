import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { getPromoters, updatePromoter, deletePromoter, getRejectionReasons } from '../services/promoterService';
import { Promoter, PromoterStatus, RejectionReason, AdminUserData } from '../types';
import { WhatsAppIcon, InstagramIcon, TikTokIcon, UsersIcon, MapPinIcon, CogIcon } from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';

const calculateAge = (dateString: string | undefined): string => {
    if (!dateString) return 'N/A';
    try {
        const birthDate = new Date(dateString);
        // Adjust for timezone to get correct age calculation from YYYY-MM-DD
        birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return `${age} anos`;
    } catch (error) {
        console.error("Error calculating age:", error);
        return 'N/A';
    }
};

const formatSocialUrl = (value: string | undefined, platform: 'instagram' | 'tiktok'): string => {
    if (!value) return '#';
    // If it's already a valid URL, return it.
    if (value.startsWith('http')) return value;
    
    // Clean up common prefixes/symbols
    const cleanedIdentifier = value.split('.com/').pop()?.split('/')[0].replace('@', '').trim();

    if (platform === 'instagram') {
        return `https://www.instagram.com/${cleanedIdentifier}`;
    }
    if (platform === 'tiktok') {
        return `https://www.tiktok.com/@${cleanedIdentifier}`;
    }
    return '#';
};

interface AdminPanelProps {
    adminData: AdminUserData;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ adminData }) => {
    const [allPromoters, setAllPromoters] = useState<Promoter[]>([]);
    const [filteredPromoters, setFilteredPromoters] = useState<Promoter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<PromoterStatus | 'all'>('pending');
    const [stateFilter, setStateFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    const isSuperAdmin = adminData.role === 'superadmin';
    const canManage = adminData.role === 'superadmin' || adminData.role === 'admin';

    // Modals state
    const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
    const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
    const [photoViewerStartIndex, setPhotoViewerStartIndex] = useState(0);

    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
    
    const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
    const [rejectingPromoter, setRejectingPromoter] = useState<Promoter | null>(null);
    
    const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
    const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);

    const fetchPromoters = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const statesToFetch = isSuperAdmin ? null : adminData.assignedStates;
            const data = await getPromoters(adminData.organizationId, statesToFetch);
            setAllPromoters(data);
        } catch (error) {
            setError("Falha ao buscar divulgadoras.");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, [adminData, isSuperAdmin]);

    const fetchReasons = useCallback(async () => {
        if (!adminData.organizationId) return;
        try {
            const data = await getRejectionReasons(adminData.organizationId);
            setRejectionReasons(data);
        } catch (error) {
            setError("Falha ao buscar motivos de rejeição.");
            console.error(error);
        }
    }, [adminData.organizationId]);


    useEffect(() => {
        fetchPromoters();
        if (canManage && adminData.organizationId) {
            fetchReasons();
        }
    }, [fetchPromoters, fetchReasons, canManage, adminData.organizationId]);
    
    const promotersInScope = useMemo(() => {
        // Superadmin without org sees all. Org-admin sees their org's promoters.
        // The getPromoters function already scopes by orgId.
        // This additional filter is for campaign-level permissions for non-superadmins.
        if (isSuperAdmin || !adminData.assignedCampaigns) {
            return allPromoters;
        }
        return allPromoters.filter(promoter => {
            const stateCampaigns = adminData.assignedCampaigns?.[promoter.state];
            // If no campaigns are specified for this state, admin has access to all.
            if (!stateCampaigns || stateCampaigns.length === 0) {
                return true;
            }
            // If campaigns are specified, check if promoter's campaign is in the list.
            return promoter.campaignName && stateCampaigns.includes(promoter.campaignName);
        });
    }, [allPromoters, adminData, isSuperAdmin]);
    
    const stats = useMemo(() => ({
        total: promotersInScope.length,
        pending: promotersInScope.filter(p => p.status === 'pending').length,
        approved: promotersInScope.filter(p => p.status === 'approved').length,
        rejected: promotersInScope.filter(p => p.status === 'rejected').length,
    }), [promotersInScope]);

    const availableStates = useMemo(() => {
        if (isSuperAdmin) {
            const states = new Set(allPromoters.map(p => p.state).filter(Boolean));
            return Array.from(states).sort();
        }
        return [...adminData.assignedStates].sort();
    }, [allPromoters, adminData, isSuperAdmin]);

    useEffect(() => {
        let result = promotersInScope;
        
        if (stateFilter !== 'all') {
            result = result.filter(p => p.state === stateFilter);
        }

        if (filter !== 'all') {
            result = result.filter(p => p.status === filter);
        }
        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            result = result.filter(p =>
                (p.name || '').toLowerCase().includes(lowercasedSearchTerm) ||
                (p.email || '').toLowerCase().includes(lowercasedSearchTerm) ||
                (p.whatsapp || '').includes(searchTerm) ||
                (p.instagram || '').toLowerCase().includes(lowercasedSearchTerm)
            );
        }
        setFilteredPromoters(result);
    }, [promotersInScope, filter, stateFilter, searchTerm]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            // The context will handle state reset
        } catch (error) {
            console.error("Logout failed", error);
        }
    };
    
    const handleUpdate = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        if (!canManage) return;
        const originalPromoters = [...allPromoters];
        const updatedPromoters = allPromoters.map(p => p.id === id ? { ...p, ...data } : p);
        setAllPromoters(updatedPromoters);

        try {
            await updatePromoter(id, data);
        } catch (error) {
            setAllPromoters(originalPromoters); // Revert on error
            alert("Falha ao atualizar a divulgadora.");
        }
    };

    const handleStatusChange = async (id: string, status: PromoterStatus, rejectionReason?: string) => {
        const data: Partial<Omit<Promoter, 'id'>> = { status };
        if (rejectionReason !== undefined) {
            data.rejectionReason = rejectionReason;
        }
        // When status changes, reset group join status unless it's being approved
        if (status !== 'approved') {
            data.hasJoinedGroup = false;
        }
        await handleUpdate(id, data);
    };

    const handleApprove = (id: string) => {
        handleStatusChange(id, 'approved', '');
        alert('Divulgadora aprovada! Ela poderá ver o novo status ao consultar o site.');
    };

    const handleOpenRejectionModal = (promoter: Promoter) => {
        setRejectingPromoter(promoter);
        setIsRejectionModalOpen(true);
    };

    const handleConfirmRejection = async (reason: string) => {
        if (rejectingPromoter) {
            await handleStatusChange(rejectingPromoter.id, 'rejected', reason);
        }
        setIsRejectionModalOpen(false);
        setRejectingPromoter(null);
    };
    
    const handleGroupStatusChange = (id: string, hasJoined: boolean) => {
        handleUpdate(id, { hasJoinedGroup: hasJoined });
    };

    const handleDelete = async (id: string) => {
        if (isSuperAdmin) {
            if (window.confirm("Tem certeza que deseja excluir esta inscrição? Esta ação não pode ser desfeita.")) {
                 const originalPromoters = [...allPromoters];
                 setAllPromoters(allPromoters.filter(p => p.id !== id));
                 try {
                    await deletePromoter(id);
                 } catch (error) {
                    setAllPromoters(originalPromoters);
                    alert("Falha ao excluir a inscrição.");
                 }
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

    const handleSavePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        await handleUpdate(id, data);
        await fetchPromoters(); // Re-fetch to get fresh data
    };

    const getStatusBadge = (status: PromoterStatus | undefined) => {
        const currentStatus = status || 'pending';
        const styles = {
            pending: "bg-yellow-900/50 text-yellow-300",
            approved: "bg-green-900/50 text-green-300",
            rejected: "bg-red-900/50 text-red-300",
        };
        const text = {
            pending: "Pendente",
            approved: "Aprovado",
            rejected: "Rejeitado",
        };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[currentStatus]}`}>{text[currentStatus]}</span>;
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
                <h1 className="text-3xl font-bold">{isSuperAdmin ? 'Todas as Divulgadoras' : 'Painel do Organizador'}</h1>
                <div className="flex items-center gap-4 flex-wrap justify-end">
                    {isSuperAdmin && (
                        <Link to="/admin" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">
                            &larr; Voltar ao Dashboard
                        </Link>
                    )}
                    {isSuperAdmin && (
                         <Link to="/admin/states" className="px-4 py-2 bg-teal-600 text-white rounded-md hover:bg-teal-700 inline-flex items-center">
                            <MapPinIcon className="w-4 h-4 mr-2" />
                            Gerenciar Localidades
                        </Link>
                    )}
                    {!isSuperAdmin && adminData.organizationId && (
                         <Link to="/admin/settings" className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 inline-flex items-center">
                            <CogIcon className="w-4 h-4 mr-2" />
                            Configurações
                        </Link>
                    )}
                    {canManage && !isSuperAdmin && (
                        <button onClick={() => setIsReasonsModalOpen(true)} className="px-4 py-2 bg-gray-700 text-gray-200 rounded-md hover:bg-gray-600">
                            Gerenciar Motivos
                        </button>
                    )}
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                        Sair
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-400 truncate">Total de Cadastros</h3>
                    <p className="mt-1 text-3xl font-semibold text-white">{stats.total}</p>
                </div>
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-400 truncate">Pendentes</h3>
                    <p className="mt-1 text-3xl font-semibold text-yellow-400">{stats.pending}</p>
                </div>
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-400 truncate">Aprovados</h3>
                    <p className="mt-1 text-3xl font-semibold text-green-400">{stats.approved}</p>
                </div>
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-400 truncate">Rejeitados</h3>
                    <p className="mt-1 text-3xl font-semibold text-red-400">{stats.rejected}</p>
                </div>
            </div>

            <div className="bg-secondary shadow-lg rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail, telefone ou Instagram..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="md:col-span-2 w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                    />
                    <select
                        value={stateFilter}
                        onChange={(e) => setStateFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                    >
                        <option value="all">Todos os Estados</option>
                        {availableStates.map(state => (
                            <option key={state} value={state}>{state}</option>
                        ))}
                    </select>
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as PromoterStatus | 'all')}
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                    >
                        <option value="all">Todos os Status</option>
                        <option value="pending">Pendente</option>
                        <option value="approved">Aprovado</option>
                        <option value="rejected">Rejeitado</option>
                    </select>
                </div>

                {isLoading ? (
                    <p className="text-center py-4">Carregando...</p>
                ) : error ? (
                    <p className="text-red-500 text-center py-4">{error}</p>
                ) : (
                    <>
                        {/* Desktop Table View */}
                        <div className="hidden md:block overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-700">
                                <thead className="bg-gray-700">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Nome</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Contato</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Fotos</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                                        {canManage && <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Ações</th>}
                                    </tr>
                                </thead>
                                <tbody className="bg-secondary divide-y divide-gray-700">
                                    {filteredPromoters.map((promoter) => (
                                        <tr key={promoter.id}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center">
                                                    <div className="text-sm font-medium text-white">{promoter.name || 'N/A'}</div>
                                                    <span className="ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-900/50 text-blue-300">{promoter.state || 'N/A'}</span>
                                                </div>
                                                {promoter.campaignName && <div className="text-sm text-primary">{promoter.campaignName}</div>}
                                                <div className="text-sm text-gray-400">{promoter.email || 'N/A'}</div>
                                                <div className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col space-y-2 text-sm">
                                                    <a href={`https://wa.me/55${(promoter.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline inline-flex items-center">
                                                        <WhatsAppIcon className="w-4 h-4 mr-2" />
                                                        <span>{promoter.whatsapp || 'N/A'}</span>
                                                    </a>
                                                    <a href={formatSocialUrl(promoter.instagram, 'instagram')} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark inline-flex items-center">
                                                        <InstagramIcon className="w-4 h-4 mr-2" />
                                                        <span>Instagram</span>
                                                    </a>
                                                    {promoter.tiktok && (
                                                        <a href={formatSocialUrl(promoter.tiktok, 'tiktok')} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:underline inline-flex items-center">
                                                            <TikTokIcon className="w-4 h-4 mr-2" />
                                                            <span>TikTok</span>
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex -space-x-2">
                                                    {(promoter.photoUrls || []).map((url, index) => (
                                                        <img
                                                            key={index}
                                                            src={url}
                                                            alt={`Foto ${index + 1}`}
                                                            className="w-10 h-10 rounded-full object-cover border-2 border-secondary cursor-pointer hover:z-10 transform hover:scale-125 transition-transform"
                                                            onClick={() => openPhotoViewer(promoter.photoUrls, index)}
                                                        />
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {getStatusBadge(promoter.status)}
                                                {promoter.status === 'approved' && (
                                                    <div className="mt-2">
                                                        <label className="flex items-center text-sm text-gray-400">
                                                            <input
                                                                type="checkbox"
                                                                checked={!!promoter.hasJoinedGroup}
                                                                onChange={(e) => handleGroupStatusChange(promoter.id, e.target.checked)}
                                                                className="h-4 w-4 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary"
                                                                disabled={!canManage}
                                                            />
                                                            <span className="ml-2">Entrou no grupo</span>
                                                        </label>
                                                    </div>
                                                )}
                                            </td>
                                            {canManage && (
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                    <div className="flex items-center space-x-2">
                                                        {promoter.status === 'pending' && (
                                                            <>
                                                                <button onClick={() => handleApprove(promoter.id)} className="text-green-400 hover:text-green-300">Aprovar</button>
                                                                <button onClick={() => handleOpenRejectionModal(promoter)} className="text-red-400 hover:text-red-300">Rejeitar</button>
                                                            </>
                                                        )}
                                                        <button onClick={() => openEditModal(promoter)} className="text-indigo-400 hover:text-indigo-300">Editar</button>
                                                        {isSuperAdmin && (
                                                          <button onClick={() => handleDelete(promoter.id)} className="text-gray-400 hover:text-gray-300">Excluir</button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                           {filteredPromoters.map((promoter) => (
                                <div key={promoter.id} className="bg-dark/70 p-4 rounded-lg shadow">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="font-bold text-lg text-white">{promoter.name || 'N/A'}</p>
                                            {promoter.campaignName && <p className="text-sm text-primary font-semibold">{promoter.campaignName}</p>}
                                            <p className="text-sm text-gray-400">{promoter.email || 'N/A'}</p>
                                            <p className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            {getStatusBadge(promoter.status)}
                                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-900/50 text-blue-300">{promoter.state || 'N/A'}</span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 mb-3">
                                        <span className="text-sm font-medium text-gray-300">Fotos:</span>
                                        <div className="flex -space-x-2">
                                            {(promoter.photoUrls || []).map((url, index) => (
                                                <img
                                                    key={index}
                                                    src={url}
                                                    alt={`Foto ${index + 1}`}
                                                    className="w-8 h-8 rounded-full object-cover border-2 border-secondary cursor-pointer"
                                                    onClick={() => openPhotoViewer(promoter.photoUrls, index)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="border-t border-gray-700 pt-3 space-y-2 text-sm">
                                        <a href={`https://wa.me/55${(promoter.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline flex items-center">
                                            <WhatsAppIcon className="w-4 h-4 mr-2" />
                                            <span>{promoter.whatsapp || 'N/A'}</span>
                                        </a>
                                        <a href={formatSocialUrl(promoter.instagram, 'instagram')} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark flex items-center">
                                            <InstagramIcon className="w-4 h-4 mr-2" />
                                            <span>Instagram</span>
                                        </a>
                                        {promoter.tiktok && (
                                            <a href={formatSocialUrl(promoter.tiktok, 'tiktok')} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:underline flex items-center">
                                                <TikTokIcon className="w-4 h-4 mr-2" />
                                                <span>TikTok</span>
                                            </a>
                                        )}
                                    </div>
                                    
                                    {promoter.status === 'approved' && (
                                        <div className="border-t border-gray-700 mt-3 pt-3">
                                            <label className="flex items-center text-sm text-gray-300">
                                                <input
                                                    type="checkbox"
                                                    checked={!!promoter.hasJoinedGroup}
                                                    onChange={(e) => handleGroupStatusChange(promoter.id, e.target.checked)}
                                                    className="h-4 w-4 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary"
                                                    disabled={!canManage}
                                                />
                                                <span className="ml-2">Entrou no grupo</span>
                                            </label>
                                        </div>
                                    )}

                                    {canManage && (
                                        <div className="border-t border-gray-700 mt-3 pt-3 flex flex-wrap gap-x-4 gap-y-2 justify-end text-sm font-medium">
                                            {promoter.status === 'pending' && (
                                                <>
                                                    <button onClick={() => handleApprove(promoter.id)} className="text-green-400 hover:text-green-300">Aprovar</button>
                                                    <button onClick={() => handleOpenRejectionModal(promoter)} className="text-red-400 hover:text-red-300">Rejeitar</button>
                                                </>
                                            )}
                                            <button onClick={() => openEditModal(promoter)} className="text-indigo-400 hover:text-indigo-300">Editar</button>
                                            {isSuperAdmin && (
                                                <button onClick={() => handleDelete(promoter.id)} className="text-gray-400 hover:text-gray-300">Excluir</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {filteredPromoters.length === 0 && <p className="text-center py-4 text-gray-500">Nenhuma divulgadora encontrada.</p>}
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
            {canManage && (
                <>
                    <EditPromoterModal
                        isOpen={isEditModalOpen}
                        onClose={() => {
                            setIsEditModalOpen(false);
                            setEditingPromoter(null);
                        }}
                        onSave={handleSavePromoter}
                        promoter={editingPromoter}
                    />
                    <RejectionModal
                        isOpen={isRejectionModalOpen}
                        onClose={() => setIsRejectionModalOpen(false)}
                        onConfirm={handleConfirmRejection}
                        reasons={rejectionReasons}
                    />
                    {adminData.organizationId && <ManageReasonsModal
                        isOpen={isReasonsModalOpen}
                        onClose={() => setIsReasonsModalOpen(false)}
                        onReasonsUpdated={fetchReasons}
                        organizationId={adminData.organizationId}
                    />}
                </>
            )}
        </div>
    );
};

export default AdminPanel;