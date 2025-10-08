import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPromoters, updatePromoter, deletePromoter, getRejectionReasons } from '../services/promoterService';
import { Promoter, RejectionReason } from '../types';
import EditPromoterModal from '../components/EditPromoterModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import RejectionModal from '../components/RejectionModal';
import { InstagramIcon, MailIcon, WhatsAppIcon } from '../components/Icons';

const calculateAge = (dateOfBirth: string): number => {
    if (!dateOfBirth) return 0;
    const birthDate = new Date(dateOfBirth);
    // Adjust for timezone to avoid off-by-one day errors
    birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age;
};

const StatusBadge: React.FC<{ status: Promoter['status'] }> = ({ status }) => {
    const styles = {
        pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
        approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
        rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    };
    const text = {
        pending: 'Pendente',
        approved: 'Aprovado',
        rejected: 'Rejeitado',
    }
    return <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>
}

const StatsCard: React.FC<{ title: string; value: number; className?: string }> = ({ title, value, className = 'bg-gray-100 dark:bg-gray-700' }) => (
    <div className={`p-4 rounded-lg shadow ${className}`}>
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">{title}</h3>
        <p className="mt-1 text-3xl font-semibold">{value}</p>
    </div>
);


const AdminPanel: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [ageFilter, setAgeFilter] = useState<string>('');
  
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  const [promoterToReject, setPromoterToReject] = useState<Promoter | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [isManageReasonsModalOpen, setIsManageReasonsModalOpen] = useState(false);

  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [photoStartIndex, setPhotoStartIndex] = useState(0);
  
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [promotersData, reasonsData] = await Promise.all([
        getPromoters(),
        getRejectionReasons()
      ]);
      setPromoters(promotersData);
      setRejectionReasons(reasonsData);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleApprove = async (id: string) => {
    try {
        await updatePromoter(id, { status: 'approved', rejectionReason: '' });
        setPromoters(prev => prev.map(p => (p.id === id ? { ...p, status: 'approved', rejectionReason: '' } : p)));
    } catch (error) {
        console.error(error);
        alert('Falha ao aprovar.');
    }
  };
  
  const handleOpenRejectionModal = (promoter: Promoter) => {
    setPromoterToReject(promoter);
    setIsRejectionModalOpen(true);
  }
  
  const handleConfirmRejection = async (reason: string) => {
    if (!promoterToReject) return;
    try {
        await updatePromoter(promoterToReject.id, { status: 'rejected', rejectionReason: reason });
        setPromoters(prev => prev.map(p => (p.id === promoterToReject.id ? { ...p, status: 'rejected', rejectionReason: reason } : p)));
        setIsRejectionModalOpen(false);
        setPromoterToReject(null);
    } catch (error) {
        console.error(error);
        alert('Falha ao rejeitar.');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja deletar este cadastro? Esta ação não pode ser desfeita.')) {
        try {
            await deletePromoter(id);
            setPromoters(prev => prev.filter(p => p.id !== id));
        } catch (error) {
            console.error(error);
            alert('Falha ao deletar.');
        }
    }
  }

  const handleSaveFromModal = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
      await updatePromoter(id, data);
      await fetchData();
  };

  const openEditModal = (promoter: Promoter) => {
    setSelectedPromoter(promoter);
    setIsEditModalOpen(true);
  };

  const openPhotoViewer = (photos: string[], startIndex: number) => {
    setSelectedPhotos(photos);
    setPhotoStartIndex(startIndex);
    setIsPhotoViewerOpen(true);
  };
  
  const filteredPromoters = useMemo(() => {
    let promotersToFilter = promoters;

    if (filter !== 'all') {
      promotersToFilter = promotersToFilter.filter(p => p.status === filter);
    }

    if (ageFilter) {
      promotersToFilter = promotersToFilter.filter(p => calculateAge(p.dateOfBirth) === parseInt(ageFilter, 10));
    }

    return promotersToFilter;
  }, [promoters, filter, ageFilter]);

  const stats = useMemo(() => {
    return {
      total: promoters.length,
      pending: promoters.filter(p => p.status === 'pending').length,
      approved: promoters.filter(p => p.status === 'approved').length,
      rejected: promoters.filter(p => p.status === 'rejected').length,
    };
  }, [promoters]);
  
  return (
    <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-4 sm:p-8">
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Painel Administrativo</h1>
            <button
                onClick={() => setIsManageReasonsModalOpen(true)}
                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm font-medium"
            >
                Gerenciar Motivos de Rejeição
            </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatsCard title="Total de Cadastros" value={stats.total} />
            <StatsCard title="Pendentes" value={stats.pending} className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300" />
            <StatsCard title="Aprovados" value={stats.approved} className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" />
            <StatsCard title="Rejeitados" value={stats.rejected} className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" />
        </div>
        
        <div className="flex flex-wrap gap-2 items-center mb-6">
            <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'pending' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Pendentes</button>
            <button onClick={() => setFilter('approved')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'approved' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Aprovados</button>
            <button onClick={() => setFilter('rejected')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'rejected' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Rejeitados</button>
            <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Todos</button>
            <div className="ml-auto">
                <input
                    type="number"
                    placeholder="Filtrar por idade..."
                    value={ageFilter}
                    onChange={(e) => setAgeFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200"
                />
            </div>
        </div>

        {loading && <p className="text-center py-4">Carregando...</p>}
        {error && <p className="text-red-500 text-center py-4">Erro: {error}</p>}
        {!loading && !error && (
            <div>
                 {/* Desktop Table View */}
                <div className="overflow-x-auto hidden md:block">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nome</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fotos</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contato</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Data</th>
                                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredPromoters.map(p => {
                                const siteUrl = `${window.location.origin}/status`;
                                const emailSubject = `Parabéns! Seu cadastro de divulgadora foi aprovado!`;
                                const emailBody = `Olá ${p.name},\n\nSeu cadastro para se tornar uma divulgadora foi aprovado! Estamos muito felizes em ter você no time.\n\nPara continuar, por favor, acesse nosso site, verifique seu status e siga os próximos passos para ter acesso às regras e ao link do grupo exclusivo para divulgadoras.\n\nAcesse aqui: ${siteUrl}\n\nAtenciosamente,\nEquipe DivulgaAqui`;
                                const mailtoLink = `mailto:${p.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

                                const whatsappMessage = `Olá ${p.name}! Parabéns, seu cadastro de divulgadora foi aprovado! Para continuar, acesse nosso site (${siteUrl}), verifique seu status e siga os próximos passos para entrar no grupo. 🎉`;
                                const whatsappLink = `https://wa.me/${p.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;

                                return (
                                    <tr key={p.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">{p.name} ({calculateAge(p.dateOfBirth)} anos)</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center space-x-2">
                                                {p.photoUrls.slice(0, 3).map((url, index) => (
                                                    <button key={index} onClick={() => openPhotoViewer(p.photoUrls, index)}>
                                                        <img src={url} alt={`Foto ${index+1}`} className="h-12 w-12 rounded-md object-cover hover:opacity-80 transition-opacity" />
                                                    </button>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {p.email}
                                            <br/>
                                            <a href={`https://wa.me/${p.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-500 hover:text-green-400 hover:underline">
                                                {p.whatsapp}
                                            </a>
                                            {p.instagram && (
                                                <>
                                                    <br/>
                                                    <a 
                                                        href={p.instagram.startsWith('http') ? p.instagram : `https://instagram.com/${p.instagram}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer" 
                                                        className="text-pink-500 hover:text-pink-400 hover:underline flex items-center gap-1"
                                                    >
                                                        <InstagramIcon className="w-4 h-4" />
                                                        Instagram
                                                    </a>
                                                </>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={p.status} /></td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{p.createdAt?.toDate().toLocaleDateString() ?? 'N/A'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex items-center flex-wrap gap-x-4 gap-y-2">
                                                {p.status === 'pending' && (
                                                    <>
                                                        <button onClick={() => handleApprove(p.id)} className="text-green-600 hover:text-green-900 dark:hover:text-green-400 transition-colors">Aprovar</button>
                                                        <button onClick={() => handleOpenRejectionModal(p)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400 transition-colors">Rejeitar</button>
                                                    </>
                                                )}
                                                {p.status === 'approved' && (
                                                    <>
                                                        <a href={mailtoLink} className="inline-flex items-center gap-1.5 text-blue-600 hover:text-blue-900 dark:hover:text-blue-400 transition-colors" title="Notificar por E-mail">
                                                            <MailIcon className="w-4 h-4" />
                                                            E-mail
                                                        </a>
                                                        <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-green-600 hover:text-green-900 dark:hover:text-green-400 transition-colors" title="Notificar por WhatsApp">
                                                            <WhatsAppIcon className="w-4 h-4" />
                                                            WhatsApp
                                                        </a>
                                                    </>
                                                )}
                                                <button onClick={() => openEditModal(p)} className="text-indigo-600 hover:text-indigo-900 dark:hover:text-indigo-400 transition-colors">Ver/Editar</button>
                                                <button onClick={() => handleDelete(p.id)} className="text-red-600 hover:text-red-900 dark:hover:text-red-400 transition-colors">Deletar</button>
                                            </div>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Card View */}
                <div className="space-y-4 md:hidden">
                    {filteredPromoters.map(p => {
                         const siteUrl = `${window.location.origin}/status`;
                         const emailSubject = `Parabéns! Seu cadastro de divulgadora foi aprovado!`;
                         const emailBody = `Olá ${p.name},\n\nSeu cadastro para se tornar uma divulgadora foi aprovado! Estamos muito felizes em ter você no time.\n\nPara continuar, por favor, acesse nosso site, verifique seu status e siga os próximos passos para ter acesso às regras e ao link do grupo exclusivo para divulgadoras.\n\nAcesse aqui: ${siteUrl}\n\nAtenciosamente,\nEquipe DivulgaAqui`;
                         const mailtoLink = `mailto:${p.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
                         const whatsappMessage = `Olá ${p.name}! Parabéns, seu cadastro de divulgadora foi aprovado! Para continuar, acesse nosso site (${siteUrl}), verifique seu status e siga os próximos passos para entrar no grupo. 🎉`;
                         const whatsappLink = `https://wa.me/${p.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(whatsappMessage)}`;

                        return (
                            <div key={p.id} className="bg-gray-50 dark:bg-gray-900/50 p-4 rounded-lg shadow ring-1 ring-black ring-opacity-5">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">{p.name} ({calculateAge(p.dateOfBirth)} anos)</h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400">Enviado em: {p.createdAt?.toDate().toLocaleDateString() ?? 'N/A'}</p>
                                    </div>
                                    <StatusBadge status={p.status} />
                                </div>

                                {p.status === 'rejected' && p.rejectionReason && (
                                    <div className="mt-2 text-xs text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-900/40 p-2 rounded-md whitespace-pre-wrap">
                                        <span className="font-bold">Motivo:</span> {p.rejectionReason}
                                    </div>
                                )}

                                <div className="mt-4 space-y-3">
                                    <div>
                                        <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-1">Fotos:</h4>
                                        <div className="flex items-center space-x-2">
                                            {p.photoUrls.slice(0, 4).map((url, index) => (
                                                <button key={index} onClick={() => openPhotoViewer(p.photoUrls, index)}>
                                                    <img src={url} alt={`Foto ${index + 1}`} className="h-14 w-14 rounded-md object-cover hover:opacity-80 transition-opacity" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-1">Contato:</h4>
                                        <p className="text-sm text-gray-800 dark:text-gray-200 truncate">{p.email}</p>
                                        <p className="text-sm text-gray-800 dark:text-gray-200">{p.whatsapp}</p>
                                        {p.instagram && (
                                            <a href={p.instagram.startsWith('http') ? p.instagram : `https://instagram.com/${p.instagram}`} target="_blank" rel="noopener noreferrer" className="text-pink-500 hover:text-pink-400 hover:underline flex items-center gap-1 text-sm">
                                                <InstagramIcon className="w-4 h-4" />
                                                Instagram
                                            </a>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-3">
                                    <h4 className="font-semibold text-sm text-gray-600 dark:text-gray-400 mb-2">Ações:</h4>
                                    <div className="flex flex-col space-y-2">
                                        {p.status === 'pending' && (
                                            <>
                                                <button onClick={() => handleApprove(p.id)} className="w-full text-center p-2 rounded-md bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900 transition-colors font-medium">Aprovar</button>
                                                <button onClick={() => handleOpenRejectionModal(p)} className="w-full text-center p-2 rounded-md bg-red-100 text-red-800 hover:bg-red-200 dark:bg-red-900/50 dark:text-red-300 dark:hover:bg-red-900 transition-colors font-medium">Rejeitar</button>
                                            </>
                                        )}
                                        {p.status === 'approved' && (
                                            <>
                                                <a href={mailtoLink} className="flex items-center justify-center gap-2 p-2 rounded-md bg-blue-100 text-blue-800 hover:bg-blue-200 dark:bg-blue-900/50 dark:text-blue-300 dark:hover:bg-blue-900 transition-colors font-medium">
                                                    <MailIcon className="w-4 h-4" /> Notificar por E-mail
                                                </a>
                                                <a href={whatsappLink} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 p-2 rounded-md bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/50 dark:text-green-300 dark:hover:bg-green-900 transition-colors font-medium">
                                                    <WhatsAppIcon className="w-4 h-4" /> Notificar por WhatsApp
                                                </a>
                                            </>
                                        )}
                                        <button onClick={() => openEditModal(p)} className="w-full text-center p-2 rounded-md bg-indigo-100 text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-300 dark:hover:bg-indigo-900 transition-colors font-medium">Ver/Editar</button>
                                        <button onClick={() => handleDelete(p.id)} className="w-full text-center p-2 rounded-md bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 transition-colors font-medium">Deletar</button>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>

                 {filteredPromoters.length === 0 && (
                    <div className="text-center py-8">
                        <p className="text-gray-500 dark:text-gray-400">Nenhum cadastro encontrado para este filtro.</p>
                    </div>
                )}
            </div>
        )}
        {selectedPromoter && (
            <EditPromoterModal 
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                promoter={selectedPromoter}
                onSave={handleSaveFromModal}
            />
        )}
        <PhotoViewerModal
            isOpen={isPhotoViewerOpen}
            onClose={() => setIsPhotoViewerOpen(false)}
            imageUrls={selectedPhotos}
            startIndex={photoStartIndex}
        />
        <ManageReasonsModal
            isOpen={isManageReasonsModalOpen}
            onClose={() => setIsManageReasonsModalOpen(false)}
            onReasonsUpdated={fetchData}
        />
        <RejectionModal
            isOpen={isRejectionModalOpen}
            onClose={() => setIsRejectionModalOpen(false)}
            onConfirm={handleConfirmRejection}
            reasons={rejectionReasons}
        />
    </div>
  );
};

export default AdminPanel;