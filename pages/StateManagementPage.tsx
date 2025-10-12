import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getPromoters, updatePromoter, deletePromoter } from '../services/promoterService';
import { getStateConfig, setStatesConfig, getStatesConfig } from '../services/settingsService';
import { Promoter, StateConfig, AdminUserData, PromoterStatus } from '../types';
import { stateMap } from '../constants/states';
import { WhatsAppIcon, InstagramIcon, TikTokIcon } from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';

interface StateManagementPageProps {
  adminData: AdminUserData;
}

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

const StateManagementPage: React.FC<StateManagementPageProps> = ({ adminData }) => {
  const { stateAbbr } = useParams<{ stateAbbr: string }>();
  const stateFullName = stateAbbr ? stateMap[stateAbbr.toUpperCase()] : 'Desconhecido';

  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [stateConfig, setStateConfig] = useState<StateConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for modals
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerStartIndex, setPhotoViewerStartIndex] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
  
  const canManage = adminData.role === 'superadmin' || adminData.role === 'admin';

  const fetchData = useCallback(async () => {
    if (!stateAbbr) return;
    setIsLoading(true);
    setError(null);
    try {
      const [promotersData, configData] = await Promise.all([
        getPromoters([stateAbbr]),
        getStateConfig(stateAbbr)
      ]);
      setPromoters(promotersData);
      setStateConfig(configData);
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados da localidade.');
    } finally {
      setIsLoading(false);
    }
  }, [stateAbbr]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    return {
      total: promoters.length,
      pending: promoters.filter(p => p.status === 'pending').length,
      approved: promoters.filter(p => p.status === 'approved').length,
      rejected: promoters.filter(p => p.status === 'rejected').length,
    };
  }, [promoters]);

  const handleConfigChange = (field: keyof StateConfig, value: string | boolean) => {
    if (stateConfig) {
      setStateConfig({ ...stateConfig, [field]: value });
    }
  };

  const handleSaveConfig = async () => {
    if (!stateAbbr || !stateConfig) return;
    setIsSaving(true);
    setError(null);
    try {
      const fullConfig = await getStatesConfig();
      const updatedConfig = { ...fullConfig, [stateAbbr]: stateConfig };
      await setStatesConfig(updatedConfig);
      alert('Configurações salvas com sucesso!');
    } catch (err: any) {
      setError(err.message || 'Falha ao salvar as configurações.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleUpdatePromoter = async (id: string, data: Partial<Omit<Promoter, 'id'>>) => {
        if (!canManage) return;
        try {
            await updatePromoter(id, data);
            await fetchData(); // Refresh data
        } catch (error) {
            alert("Falha ao atualizar a divulgadora.");
        }
  };

  const handleDeletePromoter = async (id: string) => {
    if (!canManage) return;
    if (window.confirm("Tem certeza que deseja excluir esta inscrição?")) {
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

  const getStatusBadge = (status: PromoterStatus) => {
    const styles = {
        pending: "bg-yellow-900/50 text-yellow-300",
        approved: "bg-green-900/50 text-green-300",
        rejected: "bg-red-900/50 text-red-300",
    };
    const text = { pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado" };
    return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
  };


  if (isLoading) {
    return <div className="text-center py-10">Carregando dados da localidade...</div>;
  }
  
  if (error) {
    return <div className="text-red-400 text-center py-10">{error}</div>;
  }

  return (
    <div>
        <div className="mb-6">
            <Link to="/admin/states" className="text-sm text-primary hover:underline">&larr; Todas as Localidades</Link>
            <h1 className="text-3xl font-bold mt-1">Gerenciamento de {stateFullName} ({stateAbbr})</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Stats & Settings */}
            <div className="lg:col-span-1 space-y-6">
                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-xl font-semibold mb-4 text-white">Estatísticas</h3>
                    <div className="space-y-3">
                       <div className="flex justify-between items-baseline"><span className="text-gray-400">Total de Cadastros:</span><span className="font-bold text-2xl text-white">{stats.total}</span></div>
                       <div className="flex justify-between items-baseline"><span className="text-gray-400">Pendentes:</span><span className="font-bold text-2xl text-yellow-400">{stats.pending}</span></div>
                       <div className="flex justify-between items-baseline"><span className="text-gray-400">Aprovados:</span><span className="font-bold text-2xl text-green-400">{stats.approved}</span></div>
                       <div className="flex justify-between items-baseline"><span className="text-gray-400">Rejeitados:</span><span className="font-bold text-2xl text-red-400">{stats.rejected}</span></div>
                    </div>
                </div>

                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-xl font-semibold mb-4 text-white">Configurações</h3>
                    {stateConfig && (
                        <div className="space-y-4">
                             <label className="flex items-center cursor-pointer">
                              <input
                                type="checkbox"
                                checked={stateConfig.isActive}
                                onChange={(e) => handleConfigChange('isActive', e.target.checked)}
                                className="h-5 w-5 text-primary bg-gray-800 border-gray-600 focus:ring-primary rounded-sm"
                              />
                              <span className="ml-3 font-medium text-gray-200">Inscrições Ativas</span>
                            </label>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Link do Grupo WhatsApp</label>
                                <input 
                                    type="text"
                                    value={stateConfig.whatsappLink || ''}
                                    onChange={(e) => handleConfigChange('whatsappLink', e.target.value)}
                                    placeholder="https://chat.whatsapp.com/..."
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Regras da Localidade</label>
                                <textarea 
                                    value={stateConfig.rules || ''}
                                    onChange={(e) => handleConfigChange('rules', e.target.value)}
                                    placeholder="Digite as regras aqui..."
                                    className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 min-h-[150px]"
                                />
                            </div>
                            <button onClick={handleSaveConfig} disabled={isSaving} className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-primary/50">
                                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Column: Promoters List */}
            <div className="lg:col-span-2 bg-secondary p-6 rounded-lg shadow">
                 <h3 className="text-xl font-semibold mb-4 text-white">Divulgadoras - {stateFullName}</h3>
                 <div className="space-y-4">
                    {promoters.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">Nenhuma divulgadora encontrada para esta localidade.</p>
                    ) : (
                        promoters.map(promoter => (
                           <div key={promoter.id} className="bg-dark/70 p-4 rounded-lg shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                    <div>
                                        <p className="font-bold text-lg text-white">{promoter.name}</p>
                                        <p className="text-sm text-gray-400">{promoter.email}</p>
                                        <p className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</p>
                                    </div>
                                    {getStatusBadge(promoter.status)}
                                </div>

                                <div className="flex items-center gap-4 mb-3">
                                    <span className="text-sm font-medium text-gray-300">Fotos:</span>
                                    <div className="flex -space-x-2">
                                        {promoter.photoUrls.map((url, index) => (
                                            <img key={index} src={url} alt={`Foto ${index + 1}`} className="w-8 h-8 rounded-full object-cover border-2 border-secondary cursor-pointer" onClick={() => openPhotoViewer(promoter.photoUrls, index)}/>
                                        ))}
                                    </div>
                                </div>
                                
                                <div className="border-t border-gray-700 pt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                                    <a href={`https://wa.me/${(promoter.whatsapp || '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-green-400 hover:underline flex items-center"><WhatsAppIcon className="w-4 h-4 mr-2" /><span>WhatsApp</span></a>
                                    <a href={`https://instagram.com/${(promoter.instagram || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary-dark flex items-center"><InstagramIcon className="w-4 h-4 mr-2" /><span>Instagram</span></a>
                                    {promoter.tiktok && <a href={`https://tiktok.com/@${(promoter.tiktok || '').replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:underline flex items-center"><TikTokIcon className="w-4 h-4 mr-2" /><span>TikTok</span></a>}
                                </div>
                                
                                {canManage && (
                                    <div className="border-t border-gray-700 mt-3 pt-3 flex flex-wrap gap-x-4 gap-y-2 justify-end text-sm font-medium">
                                        {promoter.status === 'pending' && (
                                            <>
                                                <button onClick={() => handleUpdatePromoter(promoter.id, {status: 'approved'})} className="text-green-400 hover:text-green-300">Aprovar</button>
                                                <button onClick={() => handleUpdatePromoter(promoter.id, {status: 'rejected'})} className="text-red-400 hover:text-red-300">Rejeitar</button>
                                            </>
                                        )}
                                        <button onClick={() => openEditModal(promoter)} className="text-indigo-400 hover:text-indigo-300">Editar</button>
                                        <button onClick={() => handleDeletePromoter(promoter.id)} className="text-gray-400 hover:text-gray-300">Excluir</button>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                 </div>
            </div>
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
    </div>
  );
};

export default StateManagementPage;
