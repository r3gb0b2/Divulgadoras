import React, { useState, useEffect } from 'react';
import { Promoter } from '../types';

interface EditPromoterModalProps {
  promoter: Promoter | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Omit<Promoter, 'id'>>) => Promise<void>;
}

const formInputStyle = "mt-1 w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary";
const formCheckboxStyle = "h-4 w-4 text-primary rounded border-gray-300 focus:ring-primary";

const EditPromoterModal: React.FC<EditPromoterModalProps> = ({ promoter, isOpen, onClose, onSave }) => {
  const [formData, setFormData] = useState<Partial<Omit<Promoter, 'id'>>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (promoter) {
      setFormData({
        name: promoter.name,
        email: promoter.email,
        whatsapp: promoter.whatsapp,
        instagram: promoter.instagram,
        tiktok: promoter.tiktok,
        dateOfBirth: promoter.dateOfBirth,
        status: promoter.status,
        rejectionReason: promoter.rejectionReason,
        hasJoinedGroup: promoter.hasJoinedGroup,
      });
    }
  }, [promoter]);

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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const dataToSave = { ...formData };
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
            <h2 className="text-2xl font-bold text-light">Detalhes da Divulgadora</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">&times;</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="md:col-span-2">
                <h3 className="font-bold text-lg mb-2">Fotos</h3>
                <div className="flex gap-4 overflow-x-auto">
                    {promoter.photoUrls.map((url, index) => (
                        <a href={url} target="_blank" rel="noopener noreferrer" key={index}>
                            <img src={url} alt={`Foto ${index+1}`} className="w-32 h-32 object-cover rounded-lg" />
                        </a>
                    ))}
                </div>
            </div>
        </div>

        <form className="space-y-4">
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
            <label className="block text-sm font-medium text-gray-300">Status</label>
            <select name="status" value={formData.status || 'pending'} onChange={handleChange} className={formInputStyle}>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovado</option>
              <option value="rejected">Rejeitado</option>
            </select>
          </div>
          
          {formData.status === 'approved' && (
            <div className="mt-4">
                 <label className="flex items-center text-sm font-medium text-gray-300">
                    <input 
                        type="checkbox" 
                        name="hasJoinedGroup" 
                        checked={!!formData.hasJoinedGroup} 
                        onChange={handleChange}
                        className={formCheckboxStyle}
                    />
                    <span className="ml-2">Confirmar que entrou no grupo</span>
                 </label>
            </div>
          )}
          
          {formData.status === 'rejected' && (
            <div>
              <label className="block text-sm font-medium text-gray-300">Motivo da Rejeição</label>
              <textarea
                name="rejectionReason"
                value={formData.rejectionReason || ''}
                onChange={handleChange}
                className={formInputStyle + ' min-h-[60px]'}
                placeholder="Informe o motivo..."
              />
            </div>
          )}

          <div className="mt-6 flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-orange-300">
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPromoterModal;