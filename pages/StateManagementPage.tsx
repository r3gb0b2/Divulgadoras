import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { getPromoters, updatePromoter, deletePromoter, getRejectionReasons } from '../services/promoterService';
import { getStateConfig, setStatesConfig, getStatesConfig, getCampaigns, addCampaign, updateCampaign, deleteCampaign, getAllCampaigns } from '../services/settingsService';
import { getOrganizations, getOrganization } from '../services/organizationService';
import { Promoter, StateConfig, AdminUserData, PromoterStatus, Campaign, Organization, RejectionReason } from '../types';
import { stateMap } from '../constants/states';
import { WhatsAppIcon, InstagramIcon, TikTokIcon, ArrowLeftIcon } from '../components/Icons';
import PhotoViewerModal from '../components/PhotoViewerModal';
import EditPromoterModal from '../components/EditPromoterModal';
import RejectionModal from '../components/RejectionModal';
import { serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

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

const StateManagementPage: React.FC<StateManagementPageProps> = ({ adminData }) => {
  const { stateAbbr } = useParams<{ stateAbbr: string }>();
  const stateFullName = stateAbbr ? stateMap[stateAbbr.toUpperCase()] : 'Desconhecido';
  const navigate = useNavigate();

  const [promoters, setPromoters] = useState<Promoter[]>([]);
  const [stateConfig, setStateConfig] = useState<StateConfig | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [allOrgCampaigns, setAllOrgCampaigns] = useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<RejectionReason[]>([]);
  const [notifyingId, setNotifyingId] = useState<string | null>(null);
  
  // State for modals
  const [isPhotoViewerOpen, setIsPhotoViewerOpen] = useState(false);
  const [photoViewerUrls, setPhotoViewerUrls] = useState<string[]>([]);
  const [photoViewerStartIndex, setPhotoViewerStartIndex] = useState(0);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPromoter, setEditingPromoter] = useState<Promoter | null>(null);
  const [isRejectionModalOpen, setIsRejectionModalOpen] = useState(false);
  const [rejectingPromoter, setRejectingPromoter] = useState<Promoter | null>(null);


  // State for campaign form
  const [campaignForm, setCampaignForm] = useState<Partial<Campaign>>({ name: '', description: '', isActive: true, whatsappLink: '', rules: '' });
  
  const canManage = adminData.role === 'superadmin' || adminData.role === 'admin';
  const isSuperAdmin = adminData.role === 'superadmin';

  const fetchData = useCallback(async () => {
    if (!stateAbbr) return;
    
    if (!isSuperAdmin && !adminData.organizationId) {
         setError("Organização não encontrada para este administrador.");
         setIsLoading(false);
         return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const orgId = adminData.organizationId;
      const reasonsPromise = !isSuperAdmin && orgId ? getRejectionReasons(orgId) : Promise.resolve([]);

      const promises = [
        getPromoters(orgId, [stateAbbr]),
        getStateConfig(stateAbbr),
        getCampaigns(stateAbbr, orgId),
        isSuperAdmin ? getOrganizations() : getOrganization(orgId!),
        isSuperAdmin ? Promise.resolve([]) : getAllCampaigns(orgId!),
        reasonsPromise,
      ];

      const [
        promotersData,
        configData,
        campaignsData,
        orgsOrOrgData,
        allCampaignsForOrgData,
        reasonsData
      ] = await Promise.all(promises);
      
      setRejectionReasons(reasonsData as RejectionReason[]);
      
      if (isSuperAdmin) {
        setOrganizations(orgsOrOrgData as Organization[]);
        setOrganization(null);
        setAllOrgCampaigns([]);
      } else {
        setOrganizations([]);
        setOrganization(orgsOrOrgData as Organization);
        setAllOrgCampaigns(allCampaignsForOrgData as Campaign[]);
      }

      const assignedCampaignsForState = adminData.assignedCampaigns?.[stateAbbr];
      const hasSpecificCampaigns = !isSuperAdmin && assignedCampaignsForState && assignedCampaignsForState.length > 0;
      
      const filteredPromoters = hasSpecificCampaigns
        ? (promotersData as Promoter[]).filter(p => p.campaignName && assignedCampaignsForState.includes(p.campaignName))
        : (promotersData as Promoter[]);

      const filteredCampaigns = hasSpecificCampaigns
        ? (campaignsData as Campaign[]).filter(c => assignedCampaignsForState.includes(c.name))
        : (campaignsData as Campaign[]);

      setPromoters(filteredPromoters);
      setStateConfig(configData as StateConfig | null);
      setCampaigns(filteredCampaigns);

    } catch (err: any) {
      setError(err.message || 'Falha ao carregar dados da localidade.');
    } finally {
      setIsLoading(false);
    }
  }, [stateAbbr, adminData, isSuperAdmin]);

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

  const campaignLimit = useMemo(() => {
    if (isSuperAdmin || !organization) return Infinity;
    if (organization.status === 'trial') return 1;
    if (organization.planId === 'basic') return 5;
    if (organization.planId === 'professional') return Infinity;
    return 0; // Default for expired or other statuses
  }, [organization, isSuperAdmin]);

  const canCreateCampaign = useMemo(() => {
    if (isSuperAdmin) return true;
    return allOrgCampaigns.length < campaignLimit;
  }, [isSuperAdmin, allOrgCampaigns, campaignLimit]);

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
        const currentPromoter = promoters.find(p => p.id === id);
        const updatedData = { ...data };

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
        const manuallySendEmail = httpsCallable(functions, 'manuallySendStatusEmail');
        const result = await manuallySendEmail({ promoterId });
        const data = result.data as { success: boolean, message: string };
        alert(data.message || 'Notificação enviada com sucesso!');
    } catch (error: any) {
        console.error("Failed to send manual notification:", error);
        const errorMessage = error.details?.message || error.message;
        alert(`Falha ao enviar notificação: ${errorMessage}`);
    } finally {
        setNotifyingId(null);
    }
  };

  const handleDeletePromoter = async (id: string) => {
    if (!isSuperAdmin) return;
    if (window.confirm("Tem certeza que deseja excluir esta inscrição?")) {
         try {
            await deletePromoter(id);
            await fetchData(); // Refresh data
         } catch (error) {
            alert("Falha ao excluir a inscrição.");
         }
    }
  };

  const handleCampaignFormChange = (field: keyof Omit<Campaign, 'id' | 'stateAbbr'>, value: any) => {
    setCampaignForm(prev => ({...prev, [field]: value}));
  }

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stateAbbr || !campaignForm.name) return;

    if (!campaignForm.id && !canCreateCampaign) {
        alert(`Você atingiu o limite de ${campaignLimit} evento(s) para o seu plano. Para criar mais, entre em contato com o suporte.`);
        return;
    }
    
    if (!isSuperAdmin && !adminData.organizationId) {
      alert('Apenas administradores de uma organização podem criar campanhas.');
      return;
    }
    
    if (isSuperAdmin && !campaignForm.organizationId) {
       alert('Como Super Admin, você deve selecionar uma organização para criar um novo evento/gênero.');
       return;
    }

    setIsSaving(true);
    try {
      const orgId = isSuperAdmin 
        ? campaignForm.organizationId 
        : adminData.organizationId;
        
      if (!orgId) throw new Error("Organization ID is missing");

      const dataToSave: any = {
        name: campaignForm.name || '',
        description: campaignForm.description || '',
        isActive: campaignForm.isActive !== false,
        whatsappLink: campaignForm.whatsappLink || '',
        rules: campaignForm.rules || '',
        stateAbbr,
        organizationId: orgId,
      };

      if (campaignForm.id) { // Editing existing
        await updateCampaign(campaignForm.id, dataToSave);
      } else { // Adding new
        await addCampaign(dataToSave);
      }
      setCampaignForm({ name: '', description: '', isActive: true, whatsappLink: '', rules: '' }); // Reset form
      await fetchData(); // Refresh
    } catch (err) {
      alert('Falha ao salvar evento/gênero.');
    } finally {
      setIsSaving(false);
    }
  }

  const handleDeleteCampaign = async (id: string) => {
    if (window.confirm("Tem certeza que deseja excluir este evento/gênero?")) {
      try {
        await deleteCampaign(id);
        await fetchData();
      } catch (err) {
        alert('Falha ao excluir evento/gênero.');
      }
    }
  }
  
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
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-2">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar para Localidades</span>
            </button>
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

                {isSuperAdmin && (
                  <div className="bg-secondary p-5 rounded-lg shadow">
                      <h3 className="text-xl font-semibold mb-4 text-white">Configurações Gerais da Localidade</h3>
                      {stateConfig && (
                          <div className="space-y-4">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={stateConfig.isActive}
                                  onChange={(e) => handleConfigChange('isActive', e.target.checked)}
                                  className="h-5 w-5 text-primary bg-gray-800 border-gray-600 focus:ring-primary rounded-sm"
                                />
                                <span className="ml-3 font-medium text-gray-200">Inscrições Ativas na Localidade</span>
                              </label>
                              <div>
                                  <label className="block text-sm font-medium text-gray-300 mb-1">Regras Gerais (Fallback)</label>
                                  <textarea 
                                      value={stateConfig.rules || ''}
                                      onChange={(e) => handleConfigChange('rules', e.target.value)}
                                      placeholder="Regras gerais caso um evento não tenha regras específicas..."
                                      className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 min-h-[150px]"
                                  />
                              </div>
                              <button onClick={handleSaveConfig} disabled={isSaving} className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-primary/50">
                                  {isSaving ? 'Salvando...' : 'Salvar Config. da Localidade'}
                              </button>
                          </div>
                      )}
                  </div>
                )}


                <div className="bg-secondary p-5 rounded-lg shadow">
                    <h3 className="text-xl font-semibold mb-4 text-white">Eventos / Gêneros</h3>
                    <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
                        {campaigns.map(c => (
                            <div key={c.id} className="p-2 bg-gray-700/50 rounded-md text-sm">
                                <div className="flex justify-between items-center">
                                    <p className="font-semibold text-gray-200">{c.name}</p>
                                    <span className={`px-2 py-0.5 text-xs rounded-full ${c.isActive ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>{c.isActive ? 'Ativo' : 'Inativo'}</span>
                                </div>
                                <p className="text-gray-400 text-xs">{c.description}</p>
                                {c.whatsappLink && <p className="text-gray-400 text-xs truncate">Link: {c.whatsappLink}</p>}
                                <div className="flex gap-2 justify-end mt-1">
                                    <button onClick={() => setCampaignForm(c)} className="text-indigo-400 hover:underline text-xs">Editar</button>
                                    {isSuperAdmin && <button onClick={() => handleDeleteCampaign(c.id)} className="text-red-400 hover:underline text-xs">Excluir</button>}
                                </div>
                            </div>
                        ))}
                    </div>
                    {canManage && (
                        <div className="border-t border-gray-700 pt-4">
                            {!isSuperAdmin && campaignLimit !== Infinity && organization && (
                                <div className="p-3 bg-gray-800 rounded-md mb-4 text-sm text-center">
                                    <p className="font-semibold text-white">{allOrgCampaigns.length} / {campaignLimit} eventos criados</p>
                                    <p className="text-gray-400">Seu plano "{organization.planId}" permite até {campaignLimit} evento(s).</p>
                                </div>
                            )}

                            {canCreateCampaign || campaignForm.id ? (
                                <form onSubmit={handleSaveCampaign} className="space-y-3">
                                    <h4 className="font-semibold text-gray-200">{campaignForm.id ? 'Editar Evento/Gênero' : 'Adicionar Novo'}</h4>
                                    
                                    {isSuperAdmin && (
                                        <div>
                                            <label className="block text-sm font-medium text-gray-300">Organização</label>
                                            <select
                                            name="organizationId"
                                            value={campaignForm.organizationId || ''}
                                            onChange={(e) => handleCampaignFormChange('organizationId' as any, e.target.value)}
                                            required
                                            className="w-full mt-1 px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 text-sm"
                                            >
                                            <option value="" disabled>Selecione a organização</option>
                                            {organizations.map(org => (
                                                <option key={org.id} value={org.id}>{org.name}</option>
                                            ))}
                                            </select>
                                        </div>
                                        )}

                                    <input type="text" placeholder="Nome" value={campaignForm.name || ''} onChange={(e) => handleCampaignFormChange('name', e.target.value)} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 text-sm"/>
                                    <input type="text" placeholder="Descrição (opcional)" value={campaignForm.description || ''} onChange={(e) => handleCampaignFormChange('description', e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 text-sm"/>
                                    <input type="text" placeholder="Link do Grupo WhatsApp" value={campaignForm.whatsappLink || ''} onChange={(e) => handleCampaignFormChange('whatsappLink', e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 text-sm"/>
                                    <textarea placeholder="Regras do Evento/Gênero" value={campaignForm.rules || ''} onChange={(e) => handleCampaignFormChange('rules', e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200 text-sm min-h-[100px]"/>
                                    <label className="flex items-center text-sm"><input type="checkbox" checked={campaignForm.isActive !== false} onChange={e => handleCampaignFormChange('isActive', e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-600 rounded"/> <span className="ml-2">Ativo</span></label>
                                    <div className="flex gap-2">
                                        <button type="submit" disabled={isSaving} className="flex-grow px-4 py-2 bg-primary text-white rounded-md text-sm disabled:opacity-50">{isSaving ? '...' : 'Salvar Evento'}</button>
                                        {campaignForm.id && <button type="button" onClick={() => setCampaignForm({name: '', description: '', isActive: true, whatsappLink: '', rules: ''})} className="px-3 py-2 bg-gray-600 text-white rounded-md text-sm">Cancelar</button>}
                                    </div>
                                </form>
                             ) : (
                                <div className="text-center text-gray-400 p-4 bg-gray-800 rounded-md">
                                    <p>Você atingiu o limite de eventos para o seu plano.</p>
                                </div>
                            )}
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
                                        {promoter.campaignName && <p className="text-sm text-primary font-semibold">{promoter.campaignName}</p>}
                                        <p className="text-sm text-gray-400">{promoter.email}</p>
                                        <p className="text-sm text-gray-400">{calculateAge(promoter.dateOfBirth)}</p>
                                    </div>
                                    {getStatusBadge(promoter.status)}
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
                                        {promoter.photoUrls.map((url, index) => (
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
                                    <div className="border-t border-gray-700 mt-3 pt-3 flex flex-wrap gap-x-4 gap-y-2 justify-end text-sm font-medium">
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
        {canManage && rejectingPromoter && (
            <RejectionModal
                isOpen={isRejectionModalOpen}
                onClose={() => setIsRejectionModalOpen(false)}
                onConfirm={handleConfirmReject}
                reasons={rejectionReasons}
            />
        )}
    </div>
  );
};

export default StateManagementPage;
