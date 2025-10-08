import React, { useState, useEffect } from 'react';
import { Promoter } from '../types';
import { cleanSocialMediaHandle } from '../utils/formatters';

interface EditPromoterModalProps {
  promoter: Promoter | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, data: Partial<Omit<Promoter, 'id'>>) => Promise<void>;
}

const formInputStyle = "mt-1 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200 focus:outline-none focus:ring-primary focus:border-primary";

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
        notes: promoter.notes || '',
        rejectionReason: promoter.rejectionReason || '',
      });
    }
  }, [promoter]);

  if (!isOpen || !promoter) {
    return null;
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const cleanedData = {
        ...formData,
        instagram: cleanSocialMediaHandle(formData.instagram || ''),
        tiktok: cleanSocialMediaHandle(formData.tiktok || ''),
      };
      
      const dataToSave = { ...cleanedData, isArchived: promoter.isArchived ?? false };
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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Detalhes da Divulgadora</h2>
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
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nome</label>
            <input type="text" name="name" value={formData.name || ''} onChange={handleChange} className={formInputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Email</label>
            <input type="email" name="email" value={formData.email || ''} onChange={handleChange} className={formInputStyle} />
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">WhatsApp</label>
            <input type="tel" name="whatsapp" value={formData.whatsapp || ''} onChange={handleChange} className={formInputStyle} />
          </div>
           <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Instagram</label>
            <input type="text" name="instagram" value={formData.instagram || ''} onChange={handleChange} className={formInputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">TikTok</label>
            <input type="text" name="tiktok" value={formData.tiktok || ''} onChange={handleChange} className={formInputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Data de Nascimento</label>
            <input type="date" name="dateOfBirth" value={formData.dateOfBirth || ''} onChange={handleChange} className={formInputStyle} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
            <select name="status" value={formData.status || 'pending'} onChange={handleChange} className={formInputStyle}>
              <option value="pending">Pendente</option>
              <option value="approved">Aprovado</option>
              <option value="rejected">Rejeitado</option>
            </select>
          </div>

          {formData.status === 'rejected' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Motivo da Rejeição</label>
              <textarea
                name="rejectionReason"
                rows={3}
                value={formData.rejectionReason || ''}
                onChange={handleChange}
                className={`${formInputStyle} resize-y`}
                placeholder="Forneça um motivo para a rejeição..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Anotações Internas (visível apenas para admin)</label>
            <textarea
              name="notes"
              rows={4}
              value={formData.notes || ''}
              onChange={handleChange}
              className={`${formInputStyle} resize-y`}
              placeholder="Adicione observações sobre a divulgadora aqui..."
            />
          </div>

          <div className="mt-6 flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
              Cancelar
            </button>
            <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:bg-pink-300">
              {isSaving ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditPromoterModal;