
import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail } from '../services/promoterService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
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
  const [dataFound, setDataFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Função para limpar links de redes sociais
  const sanitizeHandle = (input: string) => {
    return input
      .replace(/https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/https?:\/\/(www\.)?tiktok\.com\/@?/i, '')
      .replace(/@/g, '')
      .split('/')[0] // remove parâmetros após a barra
      .split('?')[0] // remove query strings
      .trim();
  };

  // Auto-preenchimento inteligente baseado em cadastros anteriores
  const handleBlurEmail = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    
    setIsCheckingEmail(true);
    setDataFound(false);
    try {
      const profile = await getLatestPromoterProfileByEmail(email);
      if (profile) {
        setFormData(prev => ({
          ...prev,
          name: profile.name || prev.name,
          whatsapp: profile.whatsapp || prev.whatsapp,
          instagram: profile.instagram || prev.instagram,
          tiktok: profile.tiktok || prev.tiktok,
          dateOfBirth: profile.dateOfBirth || prev.dateOfBirth
        }));
        setDataFound(true);
        // Feedback visual rápido de que os dados foram recuperados
        setTimeout(() => setDataFound(false), 3000);
      }
    } catch (e) {
      console.warn("Sem histórico para este e-mail.");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const totalPhotos = [...photos, ...filesArray].slice(0, 8); // Limite de 8
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
    if (!organizationId || !state) {
      setError("Erro de configuração da página. O ID da organização ou Estado está ausente.");
      return;
    }

    if (formData.name.trim().split(/\s+/).length < 2) {
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
      // Sanitização final das redes sociais antes de enviar
      const finalData = {
        ...formData,
        email: formData.email.toLowerCase().trim(),
        instagram: sanitizeHandle(formData.instagram),
        tiktok: sanitizeHandle(formData.tiktok),
        photos,
        state,
        campaignName: campaignName ? decodeURIComponent(campaignName) : undefined,
        organizationId // Crucial para aparecer na lista do admin certo
      };

      await addPromoter(finalData);
      
      localStorage.setItem('saved_promoter_email', formData.email.toLowerCase().trim());
      setIsSuccess(true);
      
      setTimeout(() => {
        navigate('/status');
      }, 3500);

    } catch (err: any) {
      setError(err.message || "Erro ao salvar seu cadastro.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-fadeIn">
        <div className="bg-secondary/60 backdrop-blur-xl p-10 rounded-[3rem] border border-green-500/30 shadow-2xl shadow-green-500/10">
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <CheckCircleIcon className="w-14 h-14 text-green-500" />
          </div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Cadastro Recebido!</h1>
          <p className="text-gray-300 text-lg mb-8 leading-relaxed">Sua inscrição foi enviada com sucesso para análise. Em breve você receberá um retorno no seu e-mail.</p>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-progress"></div>
            </div>
            <span className="text-primary font-bold text-[10px] tracking-widest uppercase mt-2">Redirecionando para Status...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <button 
        onClick={() => navigate(-1)} 
        className="group flex items-center gap-2 text-gray-500 hover:text-white transition-all mb-8 font-black text-xs uppercase tracking-widest"
      >
        <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
        <span>Voltar</span>
      </button>

      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5">
        <div className="bg-gradient-to-br from-primary/30 to-transparent p-10 text-center border-b border-white/5 relative overflow-hidden">
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl"></div>
          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-purple-600/20 rounded-full blur-3xl"></div>
          
          <SparklesIcon className="w-12 h-12 text-primary/40 absolute top-8 right-12 animate-pulse" />
          
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter relative z-10">
            Seja <span className="text-primary">Divulgadora</span>
          </h1>
          <div className="inline-block mt-4 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
            <p className="text-primary font-black uppercase tracking-[0.2em] text-[10px] relative z-10">
                {campaignName ? decodeURIComponent(campaignName) : 'Inscrição Oficial'} • {stateMap[state || ''] || state}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-12">
          {error && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center animate-shake flex items-center justify-center gap-3">
              <XIcon className="w-5 h-5 text-red-500" />
              {error}
            </div>
          )}

          {/* Seção 1: Identidade */}
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg shadow-primary/30">01</div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Dados Pessoais</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest flex justify-between">
                  <span>E-mail para contato</span>
                  {dataFound && <span className="text-green-400 animate-pulse">Dados recuperados!</span>}
                </label>
                <div className="relative group">
                  <MailIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="email" 
                    placeholder="exemplo@email.com" 
                    className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary focus:bg-white/10 outline-none transition-all placeholder-gray-600 font-medium"
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    onBlur={handleBlurEmail}
                    required
                  />
                  {isCheckingEmail && <div className="absolute right-5 top-1/2 -translate-y-1/2"><div className="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div></div>}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nome Completo</label>
                <div className="relative group">
                  <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text" 
                    placeholder="Seu nome e sobrenome" 
                    className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary focus:bg-white/10 outline-none transition-all placeholder-gray-600 font-medium"
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção 2: Contato e Redes */}
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg shadow-primary/30">02</div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Redes Sociais</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">WhatsApp (DDD)</label>
                <div className="relative group">
                  <PhoneIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="tel" 
                    placeholder="(00) 00000-0000" 
                    className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary focus:bg-white/10 outline-none transition-all font-medium"
                    value={formData.whatsapp}
                    onChange={e => setFormData({...formData, whatsapp: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Data de Nascimento</label>
                <div className="relative group">
                  <CalendarIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="date" 
                    className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary focus:bg-white/10 outline-none transition-all font-medium"
                    value={formData.dateOfBirth}
                    onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
                    required
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Instagram (apenas o usuário)</label>
                <div className="relative group">
                  <InstagramIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors" />
                  <input 
                    type="text" 
                    placeholder="usuario_exemplo" 
                    className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary focus:bg-white/10 outline-none transition-all font-medium"
                    value={formData.instagram}
                    onChange={e => setFormData({...formData, instagram: e.target.value})}
                    onBlur={e => setFormData({...formData, instagram: sanitizeHandle(e.target.value)})}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">TikTok (apenas o usuário)</label>
                <div className="relative group">
                  <div className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500 group-focus-within:text-primary transition-colors flex items-center justify-center font-black text-[10px]">TT</div>
                  <input 
                    type="text" 
                    placeholder="usuario_tiktok" 
                    className="w-full pl-14 pr-5 py-5 bg-white/5 border border-white/10 rounded-3xl text-white focus:ring-2 focus:ring-primary focus:bg-white/10 outline-none transition-all font-medium"
                    value={formData.tiktok}
                    onChange={e => setFormData({...formData, tiktok: e.target.value})}
                    onBlur={e => setFormData({...formData, tiktok: sanitizeHandle(e.target.value)})}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção 3: Fotos */}
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg shadow-primary/30">03</div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Perfil Visual</h2>
              </div>
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{photos.length}/8 Fotos</span>
            </div>
            
            <p className="text-xs text-gray-500 leading-relaxed max-w-lg">
                Envie fotos nítidas e com boa iluminação. <strong className="text-primary">Indispensável:</strong> uma foto de rosto bem visível e uma de corpo inteiro. Você pode enviar até 8 fotos.
            </p>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl group animate-popIn">
                  <img src={url} alt={`Preview ${i+1}`} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <button 
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-3 right-3 bg-red-600 text-white w-8 h-8 rounded-2xl flex items-center justify-center transition-all shadow-lg font-bold hover:scale-110 active:scale-90 z-20"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              {photos.length < 8 && (
                <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[2rem] bg-white/5 hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <CameraIcon className="w-10 h-10 text-gray-600 group-hover:text-primary mb-3 transition-colors transform group-hover:-translate-y-1" />
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest group-hover:text-primary">Adicionar Foto</span>
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

          <div className="pt-6">
            <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-6 bg-primary text-white font-black text-2xl rounded-[2rem] shadow-2xl shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-4 group"
            >
                {isSubmitting ? (
                <>
                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-white"></div>
                    PROCESSANDO...
                </>
                ) : (
                <>
                    FINALIZAR INSCRIÇÃO
                    <ArrowLeftIcon className="w-6 h-6 rotate-180 group-hover:translate-x-2 transition-transform" />
                </>
                )}
            </button>
            <p className="text-center text-gray-600 text-[10px] uppercase font-bold tracking-[0.3em] mt-8">
                Sistema de Gestão Equipe Certa • Proteção de Dados Ativa
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
