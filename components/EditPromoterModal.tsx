
import React, { useState, useEffect, useMemo } from 'react';
import { Promoter, Campaign } from '../types';
import { getAllCampaigns } from '../services/settingsService';
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
    if (formData.status === 'approved' && !formData.campaignName) {
        alert("Por favor, selecione um evento principal antes de aprovar.");
        return;
    }

    setIsSaving(true);
    try {
      const dataToSave = { ...formData };
      if (dataToSave.email) {
        dataToSave.email = dataToSave.email.toLowerCase().trim();
      }
      
      // Garante que o campaignName atual esteja na lista de allCampaigns
      const allCampaigns = [
        dataToSave.campaignName,
        ...(dataToSave.associatedCampaigns || [])
      ].filter((c, index, self) => c && self.indexOf(c) === index); 
      
      dataToSave.allCampaigns = allCampaigns as string[];

      // O campo campaignName aqui é CRUCIAL: 
      // Ele é o que a Cloud Function usará para dizer "Você foi aprovada no Evento X" 
      // e para avisar "Temos postagens novas para o Evento X".
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
            <h2 className="text-2xl font-bold text-white">Análise de Perfil</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>

        <form className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="md:col-span-2">
                  <h3 className="font-bold text-lg mb-2 text-gray-200">Fotos Enviadas</h3>
                  <div className="flex gap-4 overflow-x-auto pb-2">
                      {(promoter.photoUrls || []).map((url, index) => (
                          <a href={url} target="_blank" rel="noopener noreferrer" key={index} className="flex-shrink-0">
                              <img src={url} alt={`Foto ${index+1}`} className="w-32 h-32 object-cover rounded-lg border border-gray-600 hover:border-primary transition-colors" />
                          </a>
                      ))}
                  </div>
              </div>
          </div>
          
          <div className="bg-primary/10 border border-primary/20 p-4 rounded-xl">
            <label className="block text-sm font-black text-primary uppercase tracking-widest mb-1">Evento de Aprovação</label>
            <p className="text-[10px] text-gray-400 mb-2 uppercase font-bold">Este nome será usado no aviso de aprovação e postagens novas.</p>
            <select 
              name="campaignName" 
              value={formData.campaignName || ''} 
              onChange={handleChange} 
              className={formInputStyle}
              required
            >
              <option value="">Selecione o Evento Alvo...</option>
              {availableCampaigns.map(c => (
                <option key={c.id} value={c.name}>{c.name} ({c.stateAbbr})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Nome</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleChange} className={formInputStyle} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Email</label>
                <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className={formInputStyle} />
              </div>
               <div>
                <label className="block text-xs font-bold text-gray-500 uppercase ml-1">WhatsApp</label>
                <input type="tel" name="whatsapp" value={formData.whatsapp || ''} onChange={handleChange} className={formInputStyle} />
              </div>
               <div>
                <label className="block text-xs font-bold text-gray-500 uppercase ml-1">Instagram</label>
                <input type="text" name="instagram" value={formData.instagram || ''} onChange={handleChange} className={formInputStyle} />
              </div>
          </div>

          <div className="bg-dark/50 p-4 rounded-xl border border-gray-700">
            <label className="block text-sm font-bold text-white mb-3 uppercase tracking-tighter">Decisão de Status</label>
            <select name="status" value={formData.status || 'pending'} onChange={handleChange} className={formInputStyle}>
              <option value="pending">⏳ Manter em Análise</option>
              <option value="approved">✅ APROVAR (Envia WhatsApp/Email)</option>
              <option value="rejected">❌ Rejeitar Definitivamente</option>
              <option value="rejected_editable">⚠️ Solicitar Correção de Dados</option>
            </select>
            
            {formData.status === 'approved' && (
                <div className="mt-4 p-3 bg-green-900/20 border border-green-800/30 rounded-lg">
                    <label className="flex items-center text-xs font-bold text-green-400 cursor-pointer uppercase">
                        <input 
                            type="checkbox" 
                            name="hasJoinedGroup" 
                            checked={!!formData.hasJoinedGroup} 
                            onChange={handleChange}
                            className={formCheckboxStyle}
                        />
                        <span className="ml-2">Já entrou no grupo (manual)</span>
                    </label>
                </div>
            )}
            
            {(formData.status === 'rejected' || formData.status === 'rejected_editable') && (
                <div className="mt-4">
                  <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Motivo enviado à divulgadora</label>
                  <textarea
                    name="rejectionReason"
                    value={formData.rejectionReason || ''}
                    onChange={handleChange}
                    className={formInputStyle + ' min-h-[60px]'}
                    placeholder="Descreva o motivo..."
                  />
                </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-gray-700">
            <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-600 text-gray-200 rounded-xl hover:bg-gray-500 font-bold uppercase text-xs">
              Cancelar
            </button>
            <button type="submit" disabled={isSaving} className="px-8 py-2 bg-primary text-white rounded-xl hover:bg-primary-dark disabled:bg-primary/50 font-black shadow-lg shadow-primary/20 uppercase text-xs tracking-widest">
              {isSaving ? 'Salvando...' : 'Aplicar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPromoterModal;
