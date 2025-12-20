
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { addPromoter, getPromoterById, resubmitPromoterApplication } from '../services/promoterService';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon, LockClosedIcon, CheckCircleIcon, XIcon } from '../components/Icons';
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
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 1200;
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
        }, 'image/jpeg', 0.7);
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
    cpf: '',
    rg: '',
    dateOfBirth: ''
  });
  
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [docPreviews, setDocPreviews] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
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
            cpf: data.cpf || '',
            rg: data.rg || '',
            dateOfBirth: data.dateOfBirth
          });
        }
      });
    }
  }, [editId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'profile' | 'docs') => {
    if (e.target.files) {
      setIsProcessingPhotos(true);
      const files = Array.from(e.target.files) as File[];
      const newCompressedFiles: File[] = [];
      const newPreviews: string[] = [];

      for (const file of files) {
        try {
          const blob = await compressImage(file);
          const compressedFile = new File([blob], file.name, { type: 'image/jpeg' });
          newCompressedFiles.push(compressedFile);
          newPreviews.push(URL.createObjectURL(compressedFile));
        } catch (err) {
          console.error("Erro ao processar foto", err);
        }
      }

      if (type === 'profile') {
        setPhotoFiles(prev => [...prev, ...newCompressedFiles]);
        setPhotoPreviews(prev => [...prev, ...newPreviews]);
      } else {
        setDocFiles(prev => [...prev, ...newCompressedFiles]);
        setDocPreviews(prev => [...prev, ...newPreviews]);
      }
      setIsProcessingPhotos(false);
    }
  };

  const removePhoto = (index: number, type: 'profile' | 'docs') => {
    if (type === 'profile') {
      setPhotoFiles(prev => prev.filter((_, i) => i !== index));
      setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
    } else {
      setDocFiles(prev => prev.filter((_, i) => i !== index));
      setDocPreviews(prev => prev.filter((_, i) => i !== index));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photoFiles.length === 0 && !editId) {
      setSubmitError("Por favor, envie pelo menos uma foto de perfil.");
      return;
    }

    if (docFiles.length === 0 && !editId) {
        setSubmitError("Por favor, envie uma foto do seu documento de identificação.");
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
          documentPhotos: docFiles,
          state: state!,
          organizationId: organizationId!,
          campaignName: campaignName ? decodeURIComponent(campaignName) : undefined
        });
      }
      setIsSuccess(true);
      setTimeout(() => navigate('/status?email=' + encodeURIComponent(formData.email)), 3000);
    } catch (err: any) {
      setSubmitError(err.message || "Erro ao enviar cadastro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center">
        <div className="bg-secondary p-10 rounded-3xl border border-green-500 shadow-2xl">
          <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-white mb-4">Cadastro Enviado!</h1>
          <p className="text-gray-300 text-lg">Sua solicitação foi recebida com sucesso. Nossa equipe entrará em contato em breve.</p>
          <p className="text-gray-500 mt-4 text-sm">Redirecionando para a consulta de status...</p>
        </div>
      </div>
    );
  }

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
              <input type="text" placeholder="Nome Completo" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none" 
                value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="relative">
                    <LockClosedIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                    <input type="text" placeholder="CPF" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                        value={formData.cpf} onChange={e => setFormData({...formData, cpf: e.target.value})} required />
                </div>
                <div className="relative">
                    <LockClosedIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
                    <input type="text" placeholder="RG" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                        value={formData.rg} onChange={e => setFormData({...formData, rg: e.target.value})} required />
                </div>
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
                <input type="text" placeholder="Seu @ no TikTok" className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:ring-2 focus:ring-primary outline-none"
                  value={formData.tiktok} onChange={e => setFormData({...formData, tiktok: e.target.value})} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Fotos de Perfil</h3>
            <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center bg-gray-800/50 hover:bg-gray-800 transition-colors">
              <CameraIcon className="w-12 h-12 text-primary mx-auto mb-3" />
              <p className="text-gray-300 font-medium">Fotos são fundamentais para sua aprovação!</p>
              
              <input type="file" multiple accept="image/*" className="hidden" id="photo-input" onChange={e => handleFileChange(e, 'profile')} />
              <label htmlFor="photo-input" className="cursor-pointer inline-block bg-primary px-6 py-2 rounded-full text-white font-bold hover:bg-primary-dark transition-all mb-4">
                Adicionar Fotos de Perfil
              </label>

              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                {photoPreviews.map((src, i) => (
                  <div key={i} className="relative group">
                    <img src={src} className="w-24 h-32 object-cover rounded-lg border-2 border-primary shadow-lg" alt="Preview" />
                    <button type="button" onClick={() => removePhoto(i, 'profile')} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-700">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-white border-b border-gray-700 pb-2">Documento de Identificação</h3>
            <div className="border-2 border-dashed border-gray-600 rounded-xl p-8 text-center bg-gray-800/50 hover:bg-gray-800 transition-colors">
              <LockClosedIcon className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
              <p className="text-gray-300 font-medium mb-4">Foto do Documento (RG ou CNH)</p>
              
              <input type="file" multiple accept="image/*" className="hidden" id="doc-input" onChange={e => handleFileChange(e, 'docs')} />
              <label htmlFor="doc-input" className="cursor-pointer inline-block bg-indigo-600 px-6 py-2 rounded-full text-white font-bold hover:bg-indigo-700 transition-all mb-4">
                Adicionar Documento
              </label>

              <div className="flex flex-wrap gap-3 mt-4 justify-center">
                {docPreviews.map((src, i) => (
                  <div key={i} className="relative group">
                    <img key={i} src={src} className="w-32 h-24 object-cover rounded-lg border-2 border-indigo-500 shadow-lg" alt="Doc Preview" />
                    <button type="button" onClick={() => removePhoto(i, 'docs')} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 shadow-md hover:bg-red-700">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </div>
                ))}
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
