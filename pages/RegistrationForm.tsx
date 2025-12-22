
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail } from '../services/promoterService';
import { 
  InstagramIcon, TikTokIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon, SparklesIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon 
} from '../components/Icons';
import { stateMap } from '../constants/states';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName } = useParams<{ organizationId: string; state: string; campaignName?: string }>();
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    whatsapp: '',
    instagram: '',
    tiktok: '',
    dateOfBirth: '',
  });
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-preenchimento inteligente
  const handleBlurEmail = async () => {
    const email = formData.email.trim();
    if (!email || !email.includes('@')) return;
    
    setIsCheckingEmail(true);
    try {
      const profile = await getLatestPromoterProfileByEmail(email);
      if (profile) {
        setFormData(prev => ({
          ...prev,
          name: profile.name,
          whatsapp: profile.whatsapp,
          instagram: profile.instagram,
          tiktok: profile.tiktok || '',
          dateOfBirth: profile.dateOfBirth
        }));
      }
    } catch (e) {
      console.warn("Sem histórico.");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const totalPhotos = [...photos, ...filesArray].slice(0, 4);
      setPhotos(totalPhotos);
      setPreviews(totalPhotos.map(file => URL.createObjectURL(file as Blob)));
      setError(null);
    }
  };

  const removePhoto = (index: number) => {
    const newFiles = photos.filter((_, i) => i !== index);
    const newPreviews = previews.filter((_, i) => i !== index);
    setPhotos(newFiles);
    setPreviews(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !state) return;

    // Validações básicas
    if (formData.name.trim().split(' ').length < 2) {
      setError("Por favor, insira seu nome completo (Nome e Sobrenome).");
      return;
    }

    if (photos.length < 2) {
      setError("Por favor, envie pelo menos 2 fotos nítidas (sugerimos rosto e corpo).");
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
      
      localStorage.setItem('saved_promoter_email', formData.email.toLowerCase().trim());
      setIsSuccess(true);
      
      // Delay suave para mostrar o sucesso
      setTimeout(() => {
        navigate('/status');
      }, 3000);

    } catch (err: any) {
      setError(err.message || "Erro ao salvar seu cadastro.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-fadeIn">
        <div className="bg-secondary p-10 rounded-[3rem] border border-green-500/30 shadow-2xl">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter mb-4">Cadastro Recebido!</h1>
          <p className="text-gray-400 text-lg mb-8">Sua inscrição foi enviada com sucesso para análise. Em breve você receberá um retorno em seu e-mail.</p>
          <div className="animate-pulse text-primary font-bold text-sm tracking-widest uppercase">Redirecionando para Status...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <button 
        onClick={() => navigate(-1)} 
        className="flex items-center gap-2 text-gray-400 hover:text-primary transition-all mb-6 font-black text-xs uppercase tracking-widest"
      >
        <ArrowLeftIcon className="w-4 h-4" /> <span>Voltar</span>
      </button>

      <div className="bg-secondary shadow-3xl rounded-[2.5rem] overflow-hidden border border-gray-800">
        <div className="bg-primary/20 p-10 text-center border-b border-gray-800 relative">
          <SparklesIcon className="w-10 h-10 text-primary absolute top-6 right-10 animate-pulse" />
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Seja Divulgadora</h1>
          <p className="text-primary font-bold mt-2 uppercase tracking-widest text-sm">
            {campaignName ? decodeURIComponent(campaignName) : 'Inscrição Oficial'} • {stateMap[state || ''] || state}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-10">
          {error && (
            <div className="bg-red-900/40 border-2 border-red-800 text-red-200 p-4 rounded-2xl text-sm font-bold text-center animate-shake">
              {error}
            </div>
          )}

          {/* Seção 1: Identidade */}
          <div className="space-y-6">
            <h2 className="text-lg font-black text-white flex items-center gap-3 uppercase tracking-tight">
              <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-[10px] text-white">01</span>
              Dados Pessoais
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="email" 
                  placeholder="Seu melhor e-mail" 
                  className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none transition-all placeholder-gray-500"
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  onBlur={handleBlurEmail}
                  required
                />
              </div>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="text" 
                  placeholder="Nome Completo" 
                  className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none transition-all placeholder-gray-500"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
            </div>
            {isCheckingEmail && <p className="text-[10px] text-primary animate-pulse font-black uppercase tracking-widest px-4">Sincronizando banco de dados...</p>}
          </div>

          {/* Seção 2: Redes e Contato */}
          <div className="space-y-6">
            <h2 className="text-lg font-black text-white flex items-center gap-3 uppercase tracking-tight">
              <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-[10px] text-white">02</span>
              Redes e Contato
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="relative">
                <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="tel" 
                  placeholder="WhatsApp (DDD)" 
                  className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  value={formData.whatsapp}
                  onChange={e => setFormData({...formData, whatsapp: e.target.value})}
                  required
                />
              </div>
              <div className="relative">
                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="date" 
                  className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  value={formData.dateOfBirth}
                  onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
                  required
                  style={{ colorScheme: 'dark' }}
                />
              </div>
              <div className="relative">
                <InstagramIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="text" 
                  placeholder="@Instagram" 
                  className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  value={formData.instagram}
                  onChange={e => setFormData({...formData, instagram: e.target.value})}
                  required
                />
              </div>
              <div className="relative">
                <TikTokIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                <input 
                  type="text" 
                  placeholder="@TikTok (Opcional)" 
                  className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none transition-all"
                  value={formData.tiktok}
                  onChange={e => setFormData({...formData, tiktok: e.target.value})}
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Fotos */}
          <div className="space-y-6">
            <h2 className="text-lg font-black text-white flex items-center gap-3 uppercase tracking-tight">
              <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-[10px] text-white">03</span>
              Perfil Visual
            </h2>
            <p className="text-xs text-gray-400 -mt-4 px-1 leading-relaxed">Envie fotos nítidas e atuais. Preferencialmente fotos de trabalho ou que mostrem bem seu rosto e corpo.</p>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-3xl overflow-hidden border-2 border-gray-800 shadow-xl group">
                  <img src={url} alt={`Preview ${i+1}`} className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-2 right-2 bg-red-600/90 backdrop-blur-sm text-white w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-lg font-bold hover:scale-110"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              {photos.length < 4 && (
                <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed border-gray-700 rounded-3xl bg-gray-800/50 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group">
                  <CameraIcon className="w-8 h-8 text-gray-600 group-hover:text-primary mb-2 transition-colors" />
                  <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest group-hover:text-primary">Adicionar</span>
                  <input 
                    type="file" 
                    multiple 
                    accept="image/*" 
                    className="hidden" 
                    onChange={handleFileChange} 
                  />
                </label>
              )}
            </div>
          </div>

          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-5 bg-primary text-white font-black text-xl rounded-3xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                ENVIANDO...
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-6 h-6" />
                FINALIZAR INSCRIÇÃO
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
