
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { addPromoter } from '../services/promoterService';
import { 
  UserIcon, 
  MailIcon, 
  PhoneIcon, 
  InstagramIcon, 
  TikTokIcon, 
  CalendarIcon, 
  CameraIcon, 
  ArrowLeftIcon,
  CheckCircleIcon 
} from '../components/Icons';
import { stateMap } from '../constants/states';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName } = useParams<{ 
    organizationId: string; 
    state: string; 
    campaignName?: string 
  }>();
  const navigate = useNavigate();
  const stateFullName = state ? stateMap[state.toUpperCase()] : 'Brasil';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    whatsapp: '',
    instagram: '',
    tiktok: '',
    dateOfBirth: '',
  });

  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).slice(0, 5);
      setPhotos(filesArray);
      
      // Gerar previews
      // Fix line 52: Cast 'file' to 'Blob' to resolve 'unknown' type error in URL.createObjectURL
      const newPreviews = filesArray.map(file => URL.createObjectURL(file as Blob));
      setPreviews(newPreviews);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !state) return;
    if (photos.length === 0) {
      setError("Por favor, envie ao menos uma foto sua.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addPromoter({
        ...formData,
        photos,
        state,
        campaignName: campaignName ? decodeURIComponent(campaignName) : undefined,
        organizationId
      });
      setIsSuccess(true);
      setTimeout(() => navigate('/status'), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao realizar cadastro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto text-center py-20 animate-fadeIn">
        <div className="bg-secondary p-10 rounded-[2.5rem] shadow-2xl border border-green-500/30">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-green-500">
            <CheckCircleIcon className="w-12 h-12" />
          </div>
          <h1 className="text-3xl font-black text-white mb-4">CADASTRO ENVIADO!</h1>
          <p className="text-gray-400 mb-8">
            Recebemos seus dados. Agora nossa equipe de casting fará a análise do seu perfil.
          </p>
          <button 
            onClick={() => navigate('/status')}
            className="w-full py-4 bg-primary text-white font-bold rounded-2xl hover:bg-primary-dark transition-all"
          >
            VER MEU STATUS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <button 
        onClick={() => navigate(-1)} 
        className="inline-flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-white transition-colors mb-6 uppercase tracking-widest"
      >
        <ArrowLeftIcon className="w-5 h-5" /> <span>Voltar</span>
      </button>

      <div className="bg-secondary shadow-2xl rounded-[2.5rem] overflow-hidden border border-gray-800">
        <div className="bg-gradient-to-r from-primary/20 to-purple-600/20 p-8 text-center border-b border-gray-800">
          <h1 className="text-3xl font-black text-white uppercase tracking-tight">Seja uma Divulgadora</h1>
          <p className="text-primary font-bold mt-1 tracking-widest">
            {stateFullName} {campaignName ? `• ${decodeURIComponent(campaignName)}` : ''}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-900/40 border border-red-800 text-red-200 p-4 rounded-2xl text-sm font-bold animate-shake">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase ml-2">Nome Completo</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="text" 
                  name="name" 
                  required 
                  value={formData.name} 
                  onChange={handleChange}
                  className="input-field w-full pl-12" 
                  placeholder="Maria Silva..." 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase ml-2">WhatsApp</label>
              <div className="relative">
                <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="tel" 
                  name="whatsapp" 
                  required 
                  value={formData.whatsapp} 
                  onChange={handleChange}
                  className="input-field w-full pl-12" 
                  placeholder="(00) 00000-0000" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase ml-2">E-mail</label>
              <div className="relative">
                <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="email" 
                  name="email" 
                  required 
                  value={formData.email} 
                  onChange={handleChange}
                  className="input-field w-full pl-12" 
                  placeholder="seu@email.com" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase ml-2">Nascimento</label>
              <div className="relative">
                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="date" 
                  name="dateOfBirth" 
                  required 
                  value={formData.dateOfBirth} 
                  onChange={handleChange}
                  className="input-field w-full pl-12" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase ml-2">Instagram</label>
              <div className="relative">
                <InstagramIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="text" 
                  name="instagram" 
                  required 
                  value={formData.instagram} 
                  onChange={handleChange}
                  className="input-field w-full pl-12" 
                  placeholder="@seu_perfil" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-black text-gray-500 uppercase ml-2">TikTok (Opcional)</label>
              <div className="relative">
                <TikTokIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="text" 
                  name="tiktok" 
                  value={formData.tiktok} 
                  onChange={handleChange}
                  className="input-field w-full pl-12" 
                  placeholder="@seu_tiktok" 
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-black text-gray-500 uppercase ml-2">Suas Fotos (Envie até 5)</label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {previews.map((src, i) => (
                <div key={i} className="aspect-square rounded-2xl overflow-hidden border-2 border-primary shadow-lg">
                  <img src={src} className="w-full h-full object-cover" alt="Preview" />
                </div>
              ))}
              {previews.length < 5 && (
                <label className="aspect-square flex flex-col items-center justify-center bg-gray-800 rounded-2xl border-2 border-dashed border-gray-700 cursor-pointer hover:border-primary transition-all group">
                  <CameraIcon className="w-8 h-8 text-gray-500 group-hover:text-primary transition-colors" />
                  <span className="text-[10px] text-gray-500 font-bold mt-1 group-hover:text-primary uppercase">Adicionar</span>
                  <input type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple />
                </label>
              )}
            </div>
            <p className="text-[10px] text-gray-500 text-center uppercase tracking-tighter">
              Envie fotos nítidas de rosto e corpo inteiro para facilitar sua aprovação.
            </p>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-5 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-2xl shadow-primary/30 hover:bg-primary-dark transition-all transform active:scale-95 disabled:opacity-50"
          >
            {isSubmitting ? 'PROCESSANDO...' : 'FINALIZAR MEU CADASTRO'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
