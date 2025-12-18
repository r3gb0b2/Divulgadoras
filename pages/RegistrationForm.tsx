
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { addPromoter, getPromoterById, resubmitPromoterApplication } from '../services/promoterService';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon, ArrowLeftIcon } from '../components/Icons';
import { stateMap } from '../constants/states';

const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1000;
        const MAX_HEIGHT = 1000;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Erro na compressão'));
        }, 'image/jpeg', 0.8);
      };
    };
  });
};

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName } = useParams<{ organizationId: string; state: string; campaignName?: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = searchParams.get('edit_id');

  const [formData, setFormData] = useState({
    email: '',
    name: '',
    whatsapp: '',
    instagram: '',
    tiktok: '',
    dateOfBirth: ''
  });
  
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isProcessingPhotos, setIsProcessingPhotos] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (editId) {
      getPromoterById(editId).then(data => {
        if (data) {
          setFormData({
            email: data.email,
            name: data.name,
            whatsapp: data.whatsapp,
            instagram: data.instagram,
            tiktok: data.tiktok || '',
            dateOfBirth: data.dateOfBirth
          });
        }
      });
    }
  }, [editId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setIsProcessingPhotos(true);
      const files = Array.from(e.target.files) as File[];
      const compressedFiles: File[] = [];
      const previews: string[] = [];

      for (const file of files) {
        try {
          const blob = await compressImage(file);
          const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
          compressedFiles.push(compressedFile);
          previews.push(URL.createObjectURL(compressedFile));
        } catch (err) {
          console.error("Erro ao processar foto", err);
        }
      }
      setPhotoFiles(compressedFiles);
      setPhotoPreviews(previews);
      setIsProcessingPhotos(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photoFiles.length === 0 && !editId) {
      setSubmitError("Por favor, envie pelo menos uma foto sua.");
      return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      if (editId) {
        await resubmitPromoterApplication(editId, {
          ...formData,
          status: 'pending',
          statusChangedAt: null
        });
      } else {
        await addPromoter({
          ...formData,
          photos: photoFiles,
          state: state!,
          organizationId: organizationId!,
          campaignName: campaignName ? decodeURIComponent(campaignName) : undefined
        });
      }
      navigate('/status?email=' + encodeURIComponent(formData.email));
    } catch (err: any) {
      setSubmitError(err.message || "Erro ao enviar cadastro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="bg-secondary rounded-2xl shadow-2xl overflow-hidden border border-gray-700">
        <div className="bg-primary p-6 text-white text-center">
          <h1 className="text-3xl font-bold">Faça parte da Equipe!</h1>
          <p className="opacity-90">Cadastro para divulgadoras - {stateMap[state || ''] || state}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Dados Pessoais</h3>
            
            <div className="relative">
              <UserIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
              <input type="text" placeholder="Seu nome completo" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none" 
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <MailIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input type="email" placeholder="Seu e-mail" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                  value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
              </div>
              <div className="relative">
                <PhoneIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input type="tel" placeholder="WhatsApp (DDD+Número)" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                  value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} required />
              </div>
            </div>

            <div className="relative">
              <label className="block text-xs text-gray-400 mb-1 ml-1">Data de Nascimento</label>
              <CalendarIcon className="absolute left-3 top-8 w-5 h-5 text-gray-500" />
              <input type="date" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                value={formData.dateOfBirth} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} required style={{ colorScheme: 'dark' }} />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Redes Sociais</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <InstagramIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input type="text" placeholder="Seu @ no Instagram" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                  value={formData.instagram} onChange={e => setFormData({...formData, instagram: e.target.value})} required />
              </div>
              <div className="relative">
                <TikTokIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                <input type="text" placeholder="Seu @ no TikTok (opcional)" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                  value={formData.tiktok} onChange={e => setFormData({...formData, tiktok: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Sua Foto</h3>
            <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center bg-gray-800/50 hover:bg-gray-800 transition-colors">
              <CameraIcon className="w-12 h-12 text-primary mx-auto mb-3" />
              <p className="text-gray-300 font-medium">Fotos são fundamentais para sua aprovação!</p>
              <p className="text-xs text-gray-500 mb-4">Mínimo 1 foto de rosto ou corpo inteiro.</p>
              
              <input type="file" multiple accept="image/*" className="hidden" id="photo-input" onChange={handleFileChange} />
              <label htmlFor="photo-input" className="cursor-pointer inline-block bg-primary px-6 py-2 rounded-full text-white font-bold hover:bg-primary-dark transition-all">
                {photoFiles.length > 0 ? 'Trocar Fotos' : 'Selecionar Fotos'}
              </label>

              <div className="flex flex-wrap gap-2 mt-6 justify-center">
                {photoPreviews.map((src, i) => (
                  <img key={i} src={src} className="w-24 h-32 object-cover rounded-lg border-2 border-primary shadow-lg" alt="Preview" />
                ))}
                {isProcessingPhotos && (
                  <div className="w-24 h-32 bg-gray-700 animate-pulse rounded-lg flex items-center justify-center text-xs text-gray-400">Processando...</div>
                )}
              </div>
            </div>
          </div>

          {submitError && (
            <div className="bg-red-900/50 text-red-300 p-4 rounded-lg text-sm text-center font-bold">
              {submitError}
            </div>
          )}

          <button type="submit" disabled={isSubmitting || isProcessingPhotos} 
            className="w-full py-4 bg-primary text-white font-bold rounded-xl text-xl hover:bg-primary-dark transition-all shadow-lg shadow-primary/20 disabled:opacity-50 flex items-center justify-center gap-3">
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Enviando cadastro...
              </>
            ) : 'Enviar meu Cadastro 🚀'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
