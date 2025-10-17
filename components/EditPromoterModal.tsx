import React, { useState, useEffect, useMemo } from 'react';
import { Promoter, Campaign } from '../types';
import { getAllCampaigns } from '../services/settingsService';
import { cancelPendingAssignmentsForPromoter } from '../services/postService';
import { stateMap } from '../constants/states';

interface EditPromoterModalProps {
  promoter: Promoter | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Omit<Promoter, 'id'>>) => Promise<void>;
}

const formInputStyle = "mt-1 w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary";
const formCheckboxStyle = "h-4 w-4 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary";

const EditPromoterModal: React.FC<EditPromoterModalProps> = ({ promoter, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState<Partial<Omit<Promoter, 'id'>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);

  useEffect(() => {
    if (promoter) {
      setFormData({
        name: promoter.name,
        email: promoter.email,
        whatsapp: promoter.whatsapp,
        instagram: promoter.instagram,
        tiktok: promoter.tiktok || '',
        dateOfBirth: promoter.dateOfBirth,
        status: promoter.status,
        rejectionReason: promoter.rejectionReason || '',
        hasJoinedGroup: promoter.hasJoinedGroup || false,
        leftGroup: promoter.leftGroup || false,
        observation: promoter.observation || '',
        associatedCampaigns: promoter.associatedCampaigns || [],
      });
      
      // Fetch campaigns for this promoter's organization
      if (isOpen) {
        setIsLoadingCampaigns(true);
        getAllCampaigns(promoter.organizationId)
          .then(campaigns => setAvailableCampaigns(campaigns))
          .catch(err => console.error("Failed to load campaigns", err))
          .finally(() => setIsLoadingCampaigns(false));
      }

    }
  }, [promoter, isOpen]);

  const campaignsByState = useMemo(() => {
    return availableCampaigns.reduce((acc, campaign) => {
        if (!acc[campaign.stateAbbr]) {
            acc[campaign.stateAbbr] = [];
        }
        acc[campaign.stateAbbr].push(campaign);
        return acc;
    }, {} as Record<string, Campaign[]>);
  }, [availableCampaigns]);

  if (!isOpen || !promoter) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const isCheckbox = type === 'checkbox';
    
    setFormData(prev => ({ 
        ...prev, 
        [name]: isCheckbox ? (e.target as HTMLInputElement).checked : value 
    }));
  };
  
  const handleCampaignToggle = (campaignName: string) => {
    setFormData(prev => {
        const currentAssociated = prev.associatedCampaigns || [];
        const newAssociated = currentAssociated.includes(campaignName)
            ? currentAssociated.filter(name => name !== campaignName)
            : [...currentAssociated, campaignName];
        return { ...prev, associatedCampaigns: newAssociated };
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataToSave = { ...formData };
      
      const wasMarkedAsLeft = dataToSave.leftGroup && !promoter.leftGroup;

      if (wasMarkedAsLeft) {
          if (!window.confirm("Atenção: Marcar que esta divulgadora saiu do grupo irá cancelar todas as suas postagens pendentes. Deseja continuar?")) {
              setIsSaving(false);
              return; // Abort save
          }
          await cancelPendingAssignmentsForPromoter(promoter.id);
      }
      
      if (dataToSave.email) {
        dataToSave.email = dataToSave.email.toLowerCase().trim();
      }
      if (dataToSave.status !== 'rejected') {
        dataToSave.rejectionReason = ''; // Clear reason if not rejected
      }
      if (dataToSave.status !== 'approved') {
        dataToSave.hasJoinedGroup = false; // Clear group status if not approved
      }
      await onSave(promoter.id, dataToSave);
      onClose();
    } catch (error) {
      console.error("Failed to save promoter", error);
      alert("Falha ao salvar. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Detalhes da Divulgadora</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="md:col-span-2">
                <h3 className="font-bold text-lg mb-2 text-gray-200">Fotos</h3>
                <div className="flex gap-4 overflow-x-auto">
                    {(promoter.photoUrls || []).map((url, index) => (
                        <a href={url} target="_blank" rel="noopener noreferrer" key={index}>
                            <img src={url} alt={`Foto ${index+1}`} className="w-32 h-32 object-cover rounded-lg" />
                        </a>
                    ))}
                </div>
            </div>
        </div>

        <form className="space-y-4">
          {promoter.campaignName && (
            <div>
              <label className="block text-sm font-medium text-gray-300">Evento / Gênero</label>
              <input type="text" value={promoter.campaignName} readOnly className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-400 cursor-not-allowed" />
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300">Nome</label>
            <input type="text" name="name" value={formData.name || ''} onChange={handleChange} className={formInputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Email</label>
            <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className={formInputStyle} />
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-300">WhatsApp</label>
            <input type="tel" name="whatsapp" value={formData.whatsapp || ''} onChange={handleChange} className={formInputStyle} />
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-300">Instagram</label>
            <input type="text" name="instagram" value={formData.instagram || ''} onChange={handleChange} className={formInputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">TikTok</label>
            <input type="text" name="tiktok" value={formData.tiktok || ''} onChange={handleChange} className={formInputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Data de Nascimento</label>
            <input type="date" name="dateOfBirth" value={formData.dateOfBirth || ''} onChange={handleChange} className={formInputStyle} />
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-300">Observação (visível apenas para admins)</label>
            <textarea
                name="observation"
                value={formData.observation || ''}
                onChange={handleChange}
                className={formInputStyle + ' min-h-[60px]'}
                placeholder="Adicione uma nota rápida aqui..."
            />
          </div>

          <div className="border-t border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Eventos Associados</label>
            <p className="text-xs text-gray-400 mb-2">Associe esta divulgadora a outros eventos. O evento original do cadastro é: <strong>{promoter.campaignName || 'N/A'}</strong></p>
            {isLoadingCampaigns ? (
                <p className="text-sm text-gray-400">Carregando eventos...</p>
            ) : Object.keys(campaignsByState).length > 0 ? (
                <div className="max-h-48 overflow-y-auto space-y-3 p-2 border border-gray-600 rounded-md">
                    {Object.entries(campaignsByState).sort(([stateA], [stateB]) => (stateMap[stateA] || stateA).localeCompare(stateMap[stateB] || stateB)).map(([stateAbbr, campaigns]) => (
                        <div key={stateAbbr}>
                            <h4 className="font-semibold text-primary">{stateMap[stateAbbr] || stateAbbr}</h4>
                            <div className="pl-2 space-y-1">
                                {(campaigns as Campaign[]).map(campaign => (
                                    <label key={campaign.id} className="flex items-center space-x-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={(formData.associatedCampaigns || []).includes(campaign.name)}
                                            onChange={() => handleCampaignToggle(campaign.name)}
                                            className={formCheckboxStyle}
                                            disabled={promoter.campaignName === campaign.name}
                                        />
                                        <span className={promoter.campaignName === campaign.name ? "text-gray-500" : ""}>{campaign.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : <p className="text-sm text-gray-400">Nenhum outro evento disponível.</p>}
          </div>

          <div className="border-t border-gray-700 pt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300">Status</label>
              <select name="status" value={formData.status || ''} onChange={handleChange} className={formInputStyle}>
                <option value="pending">Pendente</option>
                <option value="approved">Aprovado</option>
                <option value="rejected">Rejeitado</option>
              </select>
            </div>
            {formData.status === 'rejected' && (
              <div>
                <label className="block text-sm font-medium text-gray-300">Motivo da Rejeição</label>
                <input type="text" name="rejectionReason" value={formData.rejectionReason || ''} onChange={handleChange} className={formInputStyle} />
              </div>
            )}
            {formData.status === 'approved' && (
                <label className="flex items-center space-x-2">
                    <input type="checkbox" name="hasJoinedGroup" checked={formData.hasJoinedGroup || false} onChange={handleChange} className={formCheckboxStyle} />
                    <span>Entrou no grupo de divulgação</span>
                </label>
            )}
          </div>
          
          <div className="border-t border-red-700/50 bg-red-900/20 p-4 mt-4 rounded-md">
            <label className="flex items-center space-x-3 cursor-pointer">
                <input
                    type="checkbox"
                    name="leftGroup"
                    checked={formData.leftGroup || false}
                    onChange={handleChange}
                    className="h-5 w-5 text-red-500 rounded border-gray-500 bg-gray-700 focus:ring-red-500"
                />
                <div className="flex flex-col">
                    <span className="font-semibold text-red-300">Marcar que divulgadora saiu do grupo</span>
                    <span className="text-xs text-red-300/80">Esta ação cancelará todas as publicações pendentes dela.</span>
                </div>
            </label>
          </div>

        </form>

        <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
            Cancelar
          </button>
          <button 
            type="button" 
            onClick={handleSave} 
            disabled={isSaving}
            className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50"
          >
            {isSaving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EditPromoterModal;