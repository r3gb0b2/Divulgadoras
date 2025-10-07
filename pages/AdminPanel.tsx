import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getPromoters, updatePromoter, deletePromoter } from '../services/promoterService';
import { Promoter } from '../types';
import EditPromoterModal from '../components/EditPromoterModal';
import PhotoViewerModal from '../components/PhotoViewerModal';
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

const AdminPanel: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [ageFilter, setAgeFilter] = useState<string>('');
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [photoStartIndex, setPhotoStartIndex] = useState(0);
  
  const fetchPromoters = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getPromoters();
      setPromoters(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPromoters();
  }, [fetchPromoters]);

  const handleUpdateStatus = async (id: string, status: 'approved' | 'rejected') => {
    try {
      await updatePromoter(id, { status });
      setPromoters(prev => prev.map(p => p.id === id ? { ...p, status } : p));
    } catch (error) {
        console.error(error);
      alert('Falha ao atualizar status.');
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
      await fetchPromoters(); // Refetch all data to ensure consistency
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
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>
  }
  
  return (
    <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-4 md:p-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Painel Administrativo</h1>
        
        <div className="flex flex-col md:flex-row md:items-center gap-4 mb-6">
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setFilter('pending')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'pending' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Pendentes</button>
                <button onClick={() => setFilter('approved')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'approved' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Aprovados</button>
                <button onClick={() => setFilter('rejected')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'rejected' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Rejeitados</button>
                <button onClick={() => setFilter('all')} className={`px-4 py-2 rounded-md text-sm font-medium ${filter === 'all' ? 'bg-primary text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200'}`}>Todos</button>
            </div>
            <div className="md:ml-auto">
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
            <div className="overflow-x-auto -mx-4 md:-mx-8 px-4 md:px-8">
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
                                                    <button onClick={() => handleUpdateStatus(p.id, 'approved')} className="text-green-600 hover:text-green-900 dark:hover:text-green-400 transition-colors">Aprovar</button>
                                                    <button onClick={() => handleUpdateStatus(p.id, 'rejected')} className="text-red-600 hover:text-red-900 dark:hover:text-red-400 transition-colors">Rejeitar</button>
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
    </div>
  );
};

export default AdminPanel;
