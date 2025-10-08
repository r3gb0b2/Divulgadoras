import React, { useState, useEffect } from 'react';
import { Promoter } from '../types';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon } from './Icons';

interface EditPromoterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (promoter: Promoter) => Promise<void>;
  promoter: Promoter | null;
}

const EditPromoterModal: React.FC<EditPromoterModalProps> = ({ isOpen, onClose, onSave, promoter }) => {
  const [formData, setFormData] = useState<Partial<Promoter>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (promoter) {
      setFormData(promoter);
    }
  }, [promoter]);

  if (!isOpen || !promoter) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSave(formData as Promoter);
      onClose();
    } catch (error) {
      console.error("Failed to save promoter", error);
      // You might want to show an error message to the user here
    } finally {
      setIsSaving(false);
    }
  };
  
  const InputWithIcon: React.FC<any> = ({ Icon, ...props }) => {
    return (
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Icon className="h-5 w-5 text-gray-400" />
            </span>
            <input
                {...props}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200"
            />
        </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Editar Divulgadora</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-3xl">&times;</button>
        </div>
        
        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-4 pr-2">
            <InputWithIcon Icon={UserIcon} type="text" name="name" placeholder="Nome Completo" value={formData.name || ''} onChange={handleChange} required />
            <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="E-mail" value={formData.email || ''} onChange={handleChange} required />
            <InputWithIcon Icon={PhoneIcon} type="tel" name="whatsapp" placeholder="WhatsApp" value={formData.whatsapp || ''} onChange={handleChange} required />
            <InputWithIcon Icon={InstagramIcon} type="text" name="instagram" placeholder="Instagram" value={formData.instagram || ''} onChange={handleChange} required />
            <InputWithIcon Icon={TikTokIcon} type="text" name="tiktok" placeholder="TikTok" value={formData.tiktok || ''} onChange={handleChange} />
            <InputWithIcon Icon={CalendarIcon} type="date" name="dateOfBirth" placeholder="Data de Nascimento" value={formData.dateOfBirth ? new Date(formData.dateOfBirth).toISOString().split('T')[0] : ''} onChange={handleChange} required />
        </form>

        <div className="mt-6 flex justify-end space-x-3 border-t dark:border-gray-700 pt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500">
            Cancelar
          </button>
          <button 
            type="submit" 
            onClick={handleSubmit}
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
