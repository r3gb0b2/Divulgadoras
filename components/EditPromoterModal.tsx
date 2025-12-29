
import React, { useState, useEffect, useMemo } from 'react';
import { Promoter, Campaign } from '../types';
import { getAllCampaigns } from '../services/settingsService';
import { stateMap } from '../constants/states';
import { InstagramIcon, WhatsAppIcon, TikTokIcon, ExternalLinkIcon } from './Icons';

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
        observation: promoter.observation || '',
        associatedCampaigns: promoter.associatedCampaigns || [],
        campaignName: promoter.campaignName || '', 
      });
      
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
      if (dataToSave.email) {
        dataToSave.email = dataToSave.email.toLowerCase().trim();
      }
      if (dataToSave.status !== 'rejected') {
        dataToSave.rejectionReason = ''; 
      }
      if (dataToSave.status !== 'approved') {
        dataToSave.hasJoinedGroup = false; 
      }
      
      const allCampaigns = [
        dataToSave.campaignName,
        ...(dataToSave.associatedCampaigns || [])
      ].filter((c, index, self) => c && self.indexOf(c) === index); 
      
      dataToSave.allCampaigns = allCampaigns as string[];

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
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-2xl font-bold text-white">Detalhes da Divulgadora</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>

        <form className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="md:col-span-2">
                  <h3 className="font-bold text-lg mb-2 text-gray-200">Fotos</h3>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                      {(promoter.photoUrls || []).map((url, index) => (
                          <a href={url} target="_blank" rel="noopener noreferrer" key={index} className="flex-shrink-0">
                              <img src={url} alt={`Foto ${index+1}`} className="w-32 h-32 object-cover rounded-lg border border-gray-600" />
                          </a>
                      ))}
                  </div>
              </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-300">Evento Principal (Obrigatório para Aprovação)</label>
            <select 
              name="campaignName" 
              value={formData.campaignName || ''} 
              onChange={handleChange} 
              className={formInputStyle}
              required
            >
              <option value="">Selecione um evento...</option>
              {availableCampaigns.map(c => (
                <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>
              ))}
            </select>
          </div>

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
            <div className="flex gap-2">
                <input type="tel" name="whatsapp" value={formData.whatsapp || ''} onChange={handleChange} className={formInputStyle} />
                <a href={`https://wa.me/55${formData.whatsapp?.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="mt-1 p-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center justify-center">
                    <WhatsAppIcon className="w-5 h-5" />
                </a>
            </div>
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-300">Instagram</label>
            <div className="flex gap-2">
                <input type="text" name="instagram" value={formData.instagram || ''} onChange={handleChange} className={formInputStyle} />
                <a href={`https://instagram.com/${formData.instagram?.replace('@', '')}`} target="_blank" rel="noreferrer" className="mt-1 p-2 bg-pink-600 text-white rounded-md hover:bg-pink-700 flex items-center justify-center">
                    <InstagramIcon className="w-5 h-5" />
                </a>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">TikTok</label>
            <div className="flex gap-2">
                <input type="text" name="tiktok" value={formData.tiktok || ''} onChange={handleChange} className={formInputStyle} />
                {formData.tiktok && (
                    <a href={`https://tiktok.com/@${formData.tiktok?.replace('@', '')}`} target="_blank" rel="noreferrer" className="mt-1 p-2 bg-white text-black rounded-md hover:bg-gray-200 flex items-center justify-center">
                        <TikTokIcon className="w-5 h-5" />
                    </a>
                )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300">Data de Nascimento</label>
            <input type="date" name="dateOfBirth" value={formData.dateOfBirth || ''} onChange={handleChange} className={formInputStyle} />
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-300">Observação (Privada)</label>
            <textarea
                name="observation"
                value={formData.observation || ''}
                onChange={handleChange}
                className={formInputStyle + ' min-h-[60px]'}
                placeholder="Ex: Já trabalhou conosco, perfil verificado..."
            />
          </div>

          <div className="border-t border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">Adicionar a Outros Eventos</label>
            <p className="text-xs text-gray-400 mb-2">Marque abaixo se esta divulgadora também deve participar de outros eventos simultaneamente.</p>
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
                                            disabled={campaign.name === formData.campaignName}
                                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary disabled:opacity-50"
                                        />
                                        <span className={`text-sm ${campaign.name === formData.campaignName ? 'text-gray-500' : 'text-gray-200'}`}>{campaign.name}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-sm text-gray-400">Nenhum outro evento encontrado.</p>
            )}
          </div>

          <div className="bg-dark/50 p-4 rounded-xl border border-gray-700">
            <label className="block text-sm font-bold text-white mb-3">Status da Inscrição</label>
            <select name="status" value={formData.status || 'pending'} onChange={handleChange} className={formInputStyle}>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovada (Envia E-mail)</option>
              <option value="rejected">Rejeitada (Estatístico)</option>
              <option value="rejected_editable">Solicitar Correção</option>
            </select>
          </div>

          <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-primary/50 font-bold shadow-lg shadow-primary/20">
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPromoterModal;
