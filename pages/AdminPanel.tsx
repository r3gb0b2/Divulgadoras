import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { auth } from '../firebase/config';
import { signOut } from 'firebase/auth';
import { getPromoters, updatePromoter, deletePromoter, getRejectionReasons } from '../services/promoterService';
import { Promoter, PromoterStatus, RejectionReason } from '../types';
import { WhatsAppIcon, InstagramIcon, TikTokIcon } from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';

const AdminPanel: React.FC = () => {
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [filteredPromoters, setFilteredPromoters] = useState<Promoter[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<PromoterStatus | 'all'>('pending');
    const [searchTerm, setSearchTerm] = useState('');

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
            const data = await getPromoters();
            setPromoters(data);
        } catch (error) {
            setError("Falha ao buscar divulgadoras.");
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchReasons = useCallback(async () => {
        try {
            const data = await getRejectionReasons();
            setRejectionReasons(data);
        } catch (error) {
            setError("Falha ao buscar motivos de rejeição.");
            console.error(error);
        }
    }, []);


    useEffect(() => {
        fetchPromoters();
        fetchReasons();
    }, [fetchPromoters, fetchReasons]);
    
    const stats = useMemo(() => ({
        total: promoters.length,
        pending: promoters.filter(p => p.status === 'pending').length,
        approved: promoters.filter(p => p.status === 'approved').length,
        rejected: promoters.filter(p => p.status === 'rejected').length,
    }), [promoters]);

    useEffect(() => {
        let result = promoters;
        if (filter !== 'all') {
            result = result.filter(p => p.status === filter);
        }
        if (searchTerm) {
            const lowercasedSearchTerm = searchTerm.toLowerCase();
            result = result.filter(p =>
                p.name.toLowerCase().includes(lowercasedSearchTerm) ||
                p.email.toLowerCase().includes(lowercasedSearchTerm) ||
                p.whatsapp.includes(searchTerm) ||
                p.instagram.toLowerCase().includes(lowercasedSearchTerm)
            );
        }
        setFilteredPromoters(result);
    }, [promoters, filter, searchTerm]);

    const handleLogout = async () => {
        try {
            await signOut(auth);
            sessionStorage.removeItem('isAdminAuthenticated');
            window.location.reload(); // Simple way to reset state
        } catch (error) {
            console.error("Logout failed", error);
        }
    };
    
    const handleStatusChange = async (id: string, status: PromoterStatus, rejectionReason?: string) => {
        const originalPromoters = [...promoters];
        const updatedPromoters = promoters.map(p => p.id === id ? { ...p, status, rejectionReason: rejectionReason !== undefined ? rejectionReason : p.rejectionReason } : p);
        setPromoters(updatedPromoters);

        try {
            await updatePromoter(id, { status, rejectionReason });
        } catch (error) {
            setPromoters(originalPromoters); // Revert on error
            alert("Falha ao atualizar o status.");
        }
    };

    const handleApprove = (id: string) => {
        handleStatusChange(id, 'approved', '');
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

    const handleDelete = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir esta inscrição? Esta ação não pode ser desfeita.")) {
             const originalPromoters = [...promoters];
             setPromoters(promoters.filter(p => p.id !== id));
             try {
                await deletePromoter(id);
             } catch (error) {
                setPromoters(originalPromoters);
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

    const handleSavePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        await updatePromoter(id, data);
        await fetchPromoters(); // Re-fetch to get fresh data
    };

    const getStatusBadge = (status: PromoterStatus) => {
        const styles = {
            pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
            approved: "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300",
            rejected: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
        };
        const text = {
            pending: "Pendente",
            approved: "Aprovado",
            rejected: "Rejeitado",
        };
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold">Painel Administrativo</h1>
                <div>
                    <button onClick={() => setIsReasonsModalOpen(true)} className="mr-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-md hover:bg-gray-300 dark:hover:bg-gray-600">
                        Gerenciar Motivos
                    </button>
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
                        Sair
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Total de Cadastros</h3>
                    <p className="mt-1 text-3xl font-semibold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Pendentes</h3>
                    <p className="mt-1 text-3xl font-semibold text-yellow-500 dark:text-yellow-400">{stats.pending}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Aprovados</h3>
                    <p className="mt-1 text-3xl font-semibold text-green-500 dark:text-green-400">{stats.approved}</p>
                </div>
                <div className="bg-white dark:bg-gray-800 p-5 rounded-lg shadow">
                    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">Rejeitados</h3>
                    <p className="mt-1 text-3xl font-semibold text-red-500 dark:text-red-400">{stats.rejected}</p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail, telefone ou Instagram..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="md:col-span-2 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                    />
                    <select
                        value={filter}
                        onChange={(e) => setFilter(e.target.value as PromoterStatus | 'all')}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
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
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-700">
                                    <tr>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nome</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contato</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fotos</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredPromoters.map((promoter) => (
                                        <tr key={promoter.id}>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm font-medium text-gray-900 dark:text-white">{promoter.name}</div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">{promoter.email}</div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex flex-col space-y-2 text-sm">
                                                    <a href={`https://wa.me/${promoter.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 dark:text-green-400 hover:underline inline-flex items-center">
                                                        <WhatsAppIcon className="w-4 h-4 mr-2" />
                                                        <span>{promoter.whatsapp}</span>
                                                    </a>
                                                    <a href={promoter.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-600 dark:text-pink-400 hover:underline inline-flex items-center">
                                                        <InstagramIcon className="w-4 h-4 mr-2" />
                                                        <span>Instagram</span>
                                                    </a>
                                                    {promoter.tiktok && (
                                                        <a href={promoter.tiktok} target="_blank" rel="noopener noreferrer" className="text-gray-600 dark:text-gray-400 hover:underline inline-flex items-center">
                                                            <TikTokIcon className="w-4 h-4 mr-2" />
                                                            <span>TikTok</span>
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex -space-x-2">
                                                    {promoter.photoUrls.map((url, index) => (
                                                        <img
                                                            key={index}
                                                            src={url}
                                                            alt={`Foto ${index + 1}`}
                                                            className="w-10 h-10 rounded-full object-cover border-2 border-white dark:border-gray-800 cursor-pointer hover:z-10 transform hover:scale-125 transition-transform"
                                                            onClick={() => openPhotoViewer(promoter.photoUrls, index)}
                                                        />
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(promoter.status)}</td>
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                                <div className="flex items-center space-x-2">
                                                    {promoter.status === 'pending' && (
                                                        <>
                                                            <button onClick={() => handleApprove(promoter.id)} className="text-green-600 hover:text-green-900">Aprovar</button>
                                                            <button onClick={() => handleOpenRejectionModal(promoter)} className="text-red-600 hover:text-red-900">Rejeitar</button>
                                                        </>
                                                    )}
                                                    <button onClick={() => openEditModal(promoter)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                                    <button onClick={() => handleDelete(promoter.id)} className="text-gray-500 hover:text-gray-700">Excluir</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        
                        {/* Mobile Card View */}
                        <div className="md:hidden space-y-4">
                           {filteredPromoters.map((promoter) => (
                                <div key={promoter.id} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg shadow">
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="font-bold text-lg text-gray-900 dark:text-white">{promoter.name}</p>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">{promoter.email}</p>
                                        </div>
                                        {getStatusBadge(promoter.status)}
                                    </div>

                                    <div className="flex items-center gap-4 mb-3">
                                        <span className="text-sm font-medium text-gray-600 dark:text-gray-300">Fotos:</span>
                                        <div className="flex -space-x-2">
                                            {promoter.photoUrls.map((url, index) => (
                                                <img
                                                    key={index}
                                                    src={url}
                                                    alt={`Foto ${index + 1}`}
                                                    className="w-8 h-8 rounded-full object-cover border-2 border-white dark:border-gray-800 cursor-pointer"
                                                    onClick={() => openPhotoViewer(promoter.photoUrls, index)}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2 text-sm">
                                        <a href={`https://wa.me/${promoter.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-600 dark:text-green-400 hover:underline flex items-center">
                                            <WhatsAppIcon className="w-4 h-4 mr-2" />
                                            <span>{promoter.whatsapp}</span>
                                        </a>
                                        <a href={promoter.instagram} target="_blank" rel="noopener noreferrer" className="text-pink-600 dark:text-pink-400 hover:underline flex items-center">
                                            <InstagramIcon className="w-4 h-4 mr-2" />
                                            <span>Instagram</span>
                                        </a>
                                        {promoter.tiktok && (
                                            <a href={promoter.tiktok} target="_blank" rel="noopener noreferrer" className="text-gray-600 dark:text-gray-400 hover:underline flex items-center">
                                                <TikTokIcon className="w-4 h-4 mr-2" />
                                                <span>TikTok</span>
                                            </a>
                                        )}
                                    </div>

                                    <div className="border-t border-gray-200 dark:border-gray-700 mt-3 pt-3 flex flex-wrap gap-x-4 gap-y-2 justify-end text-sm font-medium">
                                        {promoter.status === 'pending' && (
                                            <>
                                                <button onClick={() => handleApprove(promoter.id)} className="text-green-600 hover:text-green-900">Aprovar</button>
                                                <button onClick={() => handleOpenRejectionModal(promoter)} className="text-red-600 hover:text-red-900">Rejeitar</button>
                                            </>
                                        )}
                                        <button onClick={() => openEditModal(promoter)} className="text-indigo-600 hover:text-indigo-900">Editar</button>
                                        <button onClick={() => handleDelete(promoter.id)} className="text-gray-500 hover:text-gray-700">Excluir</button>
                                    </div>
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
            <ManageReasonsModal
                isOpen={isReasonsModalOpen}
                onClose={() => setIsReasonsModalOpen(false)}
                onReasonsUpdated={fetchReasons}
            />
        </div>
    );
};

export default AdminPanel;