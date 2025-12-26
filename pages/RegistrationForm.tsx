import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail, getPromoterById } from '../services/promoterService';
import { getCampaigns } from '../services/settingsService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon, SparklesIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon, MegaphoneIcon
} from '../components/Icons';
import { stateMap } from '../constants/states';
import { Campaign } from '../types';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName: campaignNameFromUrl } = useParams<{ organizationId: string; state: string; campaignName?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Captura o ID de edição da query string (?edit_id=...)
  const queryParams = new URLSearchParams(location.search);
  const editId = queryParams.get('edit_id');
  
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    whatsapp: '',
    instagram: '',
    tiktok: '',
    dateOfBirth: '',
    campaignName: campaignNameFromUrl ? decodeURIComponent(campaignNameFromUrl) : '',
  });
  
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [isLoadingCampaigns, setIsLoadingCampaigns] = useState(false);
  const [isLoadingEditData, setIsLoadingEditData] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [dataFound, setDataFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar dados de edição se houver um ID
  useEffect(() => {
    if (editId) {
        setIsLoadingEditData(true);
        getPromoterById(editId).then(p => {
            if (p) {
                setFormData({
                    email: p.email,
                    name: p.name,
                    whatsapp: p.whatsapp,
                    instagram: p.instagram,
                    tiktok: p.tiktok || '',
                    dateOfBirth: p.dateOfBirth,
                    campaignName: p.campaignName || '',
                });
                // Nota: Por segurança do Firebase, não baixamos arquivos para o input de File.
                // A divulgadora deve enviar fotos novas se for correção de fotos.
                if (p.photoUrls) setPreviews(p.photoUrls);
            }
        }).finally(() => setIsLoadingEditData(false));
    }
  }, [editId]);

  useEffect(() => {
    if (organizationId && state) {
      setIsLoadingCampaigns(true);
      getCampaigns(state, organizationId)
        .then(camps => {
          const actives = camps.filter(c => c.status === 'active');
          setAvailableCampaigns(actives);
          
          if (!campaignNameFromUrl && !editId) {
            if (actives.length === 1) {
              setFormData(prev => ({ ...prev, campaignName: actives[0].name }));
            } else if (actives.length === 0) {
              setFormData(prev => ({ ...prev, campaignName: 'Geral' }));
            }
          }
        })
        .catch(err => console.error("Erro ao carregar eventos:", err))
        .finally(() => setIsLoadingCampaigns(false));
    }
  }, [organizationId, state, campaignNameFromUrl, editId]);

  const sanitizeHandle = (input: string) => {
    return input
      .replace(/https?:\/\/(www\.)?instagram\.com\//i, '')
      .replace(/https?:\/\/(www\.)?tiktok\.com\/@?/i, '')
      .replace(/@/g, '')
      .split('/')[0]
      .split('?')[0]
      .trim();
  };

  const handleBlurEmail = async () => {
    if (editId) return; // Não auto-preenche se estiver editando por ID
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
        setTimeout(() => setDataFound(false), 3000);
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
      const totalPhotos = [...photos, ...filesArray].slice(0, 8);
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
      setError("Erro de configuração.");
      return;
    }

    if (!formData.campaignName || formData.campaignName.trim() === '') {
      setError("Selecione o evento.");
      return;
    }

    if (photos.length < 1 && previews.length === 0) {
      setError("Envie ao menos 1 foto.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const finalData = {
        ...formData,
        id: editId || undefined, // Passa o ID se for edição
        email: formData.email.toLowerCase().trim(),
        instagram: sanitizeHandle(formData.instagram),
        tiktok: sanitizeHandle(formData.tiktok),
        photos,
        state,
        organizationId 
      };

      await addPromoter(finalData as any);
      
      localStorage.setItem('saved_promoter_email', formData.email.toLowerCase().trim());
      setIsSuccess(true);
      setTimeout(() => { navigate('/status'); }, 3500);

    } catch (err: any) {
      setError(err.message || "Erro ao salvar.");
      setIsSubmitting(false);
    }
  };

  if (isLoadingEditData) {
      return (
        <div className="py-20 text-center flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Recuperando seu cadastro...</p>
        </div>
      );
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-fadeIn">
        <div className="bg-secondary/60 backdrop-blur-xl p-10 rounded-[3rem] border border-green-500/30 shadow-2xl shadow-green-500/10">
          <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
            <CheckCircleIcon className="w-14 h-14 text-green-500" />
          </div>
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Cadastro {editId ? 'Atualizado' : 'Recebido'}!</h1>
          <p className="text-gray-300 text-lg mb-8 leading-relaxed">Sua inscrição foi enviada para análise. Em breve você receberá um retorno.</p>
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-primary animate-progress"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <button onClick={() => navigate(-1)} className="group flex items-center gap-2 text-gray-500 hover:text-white transition-all mb-8 font-black text-xs uppercase tracking-widest">
        <ArrowLeftIcon className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> 
        <span>Voltar</span>
      </button>

      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5">
        <div className="bg-gradient-to-br from-primary/30 to-transparent p-10 text-center border-b border-white/5 relative overflow-hidden">
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter relative z-10">
            {editId ? 'Corrigir' : 'Seja'} <span className="text-primary">Divulgadora</span>
          </h1>
          <div className="inline-block mt-4 px-4 py-1.5 bg-primary/10 border border-primary/20 rounded-full">
            <p className="text-primary font-black uppercase tracking-[0.2em] text-[10px] relative z-10">
                {formData.campaignName || 'Inscrição Oficial'} • {stateMap[state || ''] || state}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-12">
          {error && (
            <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center animate-shake flex items-center justify-center gap-3">
              <XIcon className="w-5 h-5 text-red-500" /> {error}
            </div>
          )}

          {/* Dados Pessoais */}
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg shadow-primary/30">01</div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Dados Pessoais</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest flex justify-between">
                  <span>E-mail</span>
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
                    disabled={!!editId} // Não permite mudar o email se estiver em correção específica
                    required
                  />
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

          {/* Contato e Redes */}
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg shadow-primary/30">02</div>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Redes Sociais</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">WhatsApp</label>
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
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Instagram (@)</label>
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
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nascimento</label>
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
            </div>
          </div>

          {/* Fotos */}
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center text-xs font-black text-white shadow-lg shadow-primary/30">03</div>
                <h2 className="text-xl font-black text-white uppercase tracking-tight">Fotos</h2>
              </div>
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{photos.length + (previews.length - photos.length)}/8</span>
            </div>
            
            <p className="text-xs text-gray-500 leading-relaxed max-w-lg">
                {editId ? 'Substitua suas fotos se o organizador solicitou melhoria na qualidade.' : 'Envie fotos nítidas. Uma de rosto e uma de corpo.'}
            </p>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl group animate-popIn">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button 
                    type="button"
                    onClick={() => removePhoto(i)}
                    className="absolute top-3 right-3 bg-red-600 text-white w-8 h-8 rounded-2xl flex items-center justify-center transition-all z-20"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>
              ))}
              
              {(photos.length + (previews.length - photos.length)) < 8 && (
                <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[2rem] bg-white/5 hover:border-primary transition-all cursor-pointer group">
                  <CameraIcon className="w-10 h-10 text-gray-600 group-hover:text-primary mb-3" />
                  <span className="text-[10px] font-black text-gray-600 uppercase tracking-widest group-hover:text-primary">Adicionar</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                </label>
              )}
            </div>
          </div>

          <div className="pt-6">
            <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full py-6 bg-primary text-white font-black text-2xl rounded-[2rem] shadow-2xl shadow-primary/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-4"
            >
                {isSubmitting ? 'PROCESSANDO...' : 'ATUALIZAR MEU CADASTRO'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
