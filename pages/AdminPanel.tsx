import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getPromoters, updatePromoter, deletePromoter, getRejectionReasons } from '../services/promoterService';
import { Promoter, RejectionReason } from '../types';
import { WhatsAppIcon, InstagramIcon, TikTokIcon } from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';
import RejectionModal from '../components/RejectionModal';
import ManageReasonsModal from '../components/ManageReasonsModal';
import EditPromoterModal from '../components/EditPromoterModal';

const AdminPanel: React.FC = () => {
  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [viewerImages, setViewerImages] = useState<{ urls: string[], index: number }>({ urls: [], index: 0 });
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [isReasonsModalOpen, setIsReasonsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedPromoter, setSelectedPromoter] = useState<Promoter | null>(null);
  
  const fetchPromoters = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await getPromoters();
      setPromoters(data);
    } catch (err: any) {
      setError(err.message || 'Falha ao buscar divulgadoras.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchRejectionReasons = useCallback(async () => {
      try {
          const data = await getRejectionReasons();
          setRejectionReasons(data);
      } catch (err) {
          console.error("Failed to fetch rejection reasons", err);
          setError('Falha ao carregar motivos de rejeição.');
      }
  }, []);

  useEffect(() => {
    fetchPromoters();
    fetchRejectionReasons();
  }, [fetchPromoters, fetchRejectionReasons]);

  const handleStatusChange = async (id: string, status: 'approved' | 'rejected', reason?: string) => {
    try {
        const dataToUpdate: Partial<Omit<Promoter, 'id'>> = { status };
        if (status === 'rejected') {
            dataToUpdate.rejectionReason = reason;
        } else {
             dataToUpdate.rejectionReason = ''; // Clear reason on approval
        }
      await updatePromoter(id, dataToUpdate);
      fetchPromoters(); // Refresh list
    } catch (err) {
      setError('Falha ao atualizar status.');
    }
  };
  
  const handleSavePromoter = async (promoterToSave: Promoter) => {
      if (!promoterToSave) return;
      try {
          const { id, ...data } = promoterToSave;
          await updatePromoter(id, data);
          fetchPromoters();
      } catch (err) {
          setError('Falha ao salvar alterações.');
          throw err; // Re-throw to keep modal open with error
      }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta divulgadora permanentemente? Esta ação não pode ser desfeita.')) {
      try {
        await deletePromoter(id);
        fetchPromoters(); // Refresh list
      } catch (err) {
        setError('Falha ao excluir divulgadora.');
      }
    }
  };

  const openPhotoViewer = (urls: string[], startIndex: number) => {
    setViewerImages({ urls, index: startIndex });
    setIsPhotoViewerOpen(true);
  };
  
  const openRejectionModal = (promoter: Promoter) => {
      setSelectedPromoter(promoter);
      setIsRejectionModalOpen(true);
  };

  const confirmRejection = (reason: string) => {
    if (selectedPromoter) {
        handleStatusChange(selectedPromoter.id, 'rejected', reason);
    }
    setIsRejectionModalOpen(false);
    setSelectedPromoter(null);
  };

  const openEditModal = (promoter: Promoter) => {
      setSelectedPromoter(promoter);
      setIsEditModalOpen(true);
  };

  const filteredPromoters = useMemo(() => {
    return promoters
      .filter(p => filter === 'all' || p.status === filter)
      .filter(p => 
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.instagram.toLowerCase().includes(searchTerm.toLowerCase())
      );
  }, [promoters, filter, searchTerm]);
  
  const getStatusPill = (status: 'pending' | 'approved' | 'rejected') => {
      const styles = {
          pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
          approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
          rejected: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
      };
      const text = {
          pending: 'Pendente',
          approved: 'Aprovada',
          rejected: 'Rejeitada',
      }
      return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>
  }
  
  const calculateAge = (dateString: string) => {
      if (!dateString) return '';
      const birthDate = new Date(dateString);
      // Adjust for timezone differences
      birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const m = today.getMonth() - birthDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
          age--;
      }
      return age;
  };

  return (
    <div className="container mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">Painel de Administração</h1>

      {error && <p className="text-red-500 bg-red-100 dark:bg-red-900/50 p-3 rounded-md mb-4">{error}</p>}
      
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
              <div className="w-full sm:w-auto flex-grow">
                  <input 
                      type="text"
                      placeholder="Buscar por nome, e-mail, instagram..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                  />
              </div>
              <div className="flex items-center gap-4">
                  <select
                      value={filter}
                      onChange={e => setFilter(e.target.value as any)}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                  >
                      <option value="pending">Pendentes</option>
                      <option value="approved">Aprovadas</option>
                      <option value="rejected">Rejeitadas</option>
                      <option value="all">Todas</option>
                  </select>
                   <button onClick={() => setIsReasonsModalOpen(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 whitespace-nowrap">
                       Gerenciar Motivos
                    </button>
              </div>
          </div>
          
          <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                      <tr>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Nome</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Contatos</th>
                           <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Fotos</th>
                          <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                          <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                      </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {isLoading ? (
                          <tr><td colSpan={5} className="text-center py-8">Carregando...</td></tr>
                      ) : filteredPromoters.length > 0 ? (
                          filteredPromoters.map(promoter => (
                              <tr key={promoter.id}>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="text-sm font-medium text-gray-900 dark:text-white">{promoter.name}</div>
                                      <div className="text-sm text-gray-500 dark:text-gray-400">{calculateAge(promoter.dateOfBirth)} anos</div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                      <div>{promoter.email}</div>
                                      <div className="flex items-center gap-2 mt-1">
                                         <a href={`https://wa.me/${promoter.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-green-500"><WhatsAppIcon className="w-5 h-5" /></a>
                                         <a href={`https://instagram.com/${promoter.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="hover:text-pink-500"><InstagramIcon className="w-5 h-5" /></a>
                                         {promoter.tiktok && <a href={`https://tiktok.com/${promoter.tiktok}`} target="_blank" rel="noopener noreferrer" className="hover:text-blue-400"><TikTokIcon className="w-5 h-5" /></a>}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">
                                      <div className="flex -space-x-2">
                                          {promoter.photoUrls.map((url, index) => (
                                              <img key={index} src={url} alt={`Foto ${index+1}`} className="h-10 w-10 rounded-full border-2 border-white dark:border-gray-800 object-cover cursor-pointer hover:scale-110 transition-transform" onClick={() => openPhotoViewer(promoter.photoUrls, index)} />
                                          ))}
                                      </div>
                                  </td>
                                  <td className="px-6 py-4 whitespace-nowrap">{getStatusPill(promoter.status)}</td>
                                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                     {promoter.status === 'pending' && (
                                         <>
                                             <button onClick={() => handleStatusChange(promoter.id, 'approved')} className="text-green-600 hover:text-green-900 mr-3">Aprovar</button>
                                             <button onClick={() => openRejectionModal(promoter)} className="text-red-600 hover:text-red-900">Rejeitar</button>
                                         </>
                                     )}
                                     {promoter.status !== 'pending' && (
                                         <button onClick={() => openEditModal(promoter)} className="text-indigo-600 hover:text-indigo-900 mr-3">Editar</button>
                                     )}
                                     <button onClick={() => handleDelete(promoter.id)} className="text-gray-500 hover:text-gray-700 ml-2">Excluir</button>
                                  </td>
                              </tr>
                          ))
                      ) : (
                          <tr><td colSpan={5} className="text-center py-8">Nenhuma divulgadora encontrada.</td></tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
      
      <PhotoViewerModal
        isOpen={isPhotoViewerOpen}
        onClose={() => setIsPhotoViewerOpen(false)}
        imageUrls={viewerImages.urls}
        startIndex={viewerImages.index}
      />

      <RejectionModal
        isOpen={isRejectionModalOpen}
        onClose={() => {setIsRejectionModalOpen(false); setSelectedPromoter(null);}}
        onConfirm={confirmRejection}
        reasons={rejectionReasons}
      />
      
      <ManageReasonsModal
        isOpen={isReasonsModalOpen}
        onClose={() => setIsReasonsModalOpen(false)}
        onReasonsUpdated={fetchRejectionReasons}
      />

      <EditPromoterModal
        isOpen={isEditModalOpen}
        onClose={() => { setIsEditModalOpen(false); setSelectedPromoter(null); }}
        onSave={handleSavePromoter}
        promoter={selectedPromoter}
      />

    </div>
  );
};

export default AdminPanel;
