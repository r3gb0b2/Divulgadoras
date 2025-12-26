
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getPromoterById, getLatestPromoterProfileByEmail } from '../services/promoterService';
import { getOrganization } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon, MegaphoneIcon
} from '../components/Icons';
import { stateMap } from '../constants/states';
import { Campaign } from '../types';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName: campaignNameFromUrl } = useParams<{ organizationId: string; state: string; campaignName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
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
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidOrg, setIsValidOrg] = useState<boolean | null>(null);

  const formatPhone = (value: string) => {
    if (!value) return value;
    const phoneNumber = value.replace(/\D/g, '');
    const phoneNumberLength = phoneNumber.length;
    if (phoneNumberLength <= 2) return phoneNumber;
    if (phoneNumberLength <= 7) {
      return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2)}`;
    }
    return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2, 7)}-${phoneNumber.slice(7, 11)}`;
  };

  const sanitizeInstagram = (input: string) => {
    return input
      .replace(/https?:\/\/(www\.)?instagram\.com\//i, '') // Remove links
      .replace(/@/g, '') // Remove o @
      .split('/')[0] // Pega apenas a primeira parte se houver mais barras
      .split('?')[0] // Remove query strings
      .trim();
  };

  useEffect(() => {
    const loadInitialData = async () => {
        if (!organizationId || !state) {
            setIsValidOrg(false);
            setIsLoadingData(false);
            return;
        }

        try {
            const org = await getOrganization(organizationId);
            if (org && org.status !== 'deactivated') {
                setIsValidOrg(true);
            } else {
                setIsValidOrg(false);
            }
        } catch (err) {
            setIsValidOrg(false);
        }

        if (editId) {
            try {
                const p = await getPromoterById(editId);
                if (p) {
                    setFormData({
                        email: p.email,
                        name: p.name,
                        whatsapp: formatPhone(p.whatsapp),
                        instagram: p.instagram,
                        tiktok: p.tiktok || '',
                        dateOfBirth: p.dateOfBirth,
                        campaignName: p.campaignName || '',
                    });
                    if (p.photoUrls) setPreviews(p.photoUrls);
                }
            } catch (e) {
                console.error("Erro ao carregar dados de edição");
            }
        }
        setIsLoadingData(false);
    };

    loadInitialData();
  }, [editId, organizationId, state]);

  const handleEmailBlur = async () => {
    const email = formData.email.trim().toLowerCase();
    // Só tenta preencher se o e-mail parecer válido e não estivermos no modo edição
    if (!email || !email.includes('@') || editId) return;

    setIsAutoFilling(true);
    try {
        const latestProfile = await getLatestPromoterProfileByEmail(email);
        if (latestProfile) {
            setFormData(prev => ({
                ...prev,
                name: prev.name || latestProfile.name,
                whatsapp: prev.whatsapp || formatPhone(latestProfile.whatsapp),
                instagram: prev.instagram || latestProfile.instagram,
                tiktok: prev.tiktok || latestProfile.tiktok || '',
                dateOfBirth: prev.dateOfBirth || latestProfile.dateOfBirth
            }));
        }
    } catch (e) {
        console.warn("Erro no auto-preenchimento");
    } finally {
        setIsAutoFilling(false);
    }
  };

  const handleInstagramChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      // Limpa enquanto digita, impedindo @ e links
      const val = e.target.value;
      const sanitized = sanitizeInstagram(val);
      setFormData({ ...formData, instagram: sanitized });
  };

  const handleWhatsAppChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setFormData({ ...formData, whatsapp: formatted });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!organizationId || isValidOrg === false) {
      setError("Link de cadastro inválido.");
      return;
    }
    
    if (photos.length < 1 && previews.length === 0) {
      setError("Envie ao menos 1 foto para identificação.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const cleanWhatsapp = formData.whatsapp.replace(/\D/g, '');
      await addPromoter({
        ...formData,
        whatsapp: cleanWhatsapp,
        id: editId || undefined,
        instagram: sanitizeInstagram(formData.instagram),
        photos,
        state: state || 'CE',
        organizationId 
      } as any);
      
      localStorage.setItem('saved_promoter_email', formData.email.toLowerCase().trim());
      setIsSuccess(true);
      setTimeout(() => { navigate('/status'); }, 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar.");
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
      return <div className="flex justify-center items-center py-40"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
  }

  if (isValidOrg === false) {
      return (
          <div className="max-w-2xl mx-auto py-20 px-4 text-center">
              <div className="bg-red-900/20 border border-red-500/50 p-10 rounded-[3rem]">
                  <XIcon className="w-20 h-20 text-red-500 mx-auto mb-6" />
                  <h1 className="text-3xl font-black text-white uppercase mb-4">Acesso Indisponível</h1>
                  <button onClick={() => navigate('/')} className="mt-8 px-8 py-3 bg-primary text-white font-bold rounded-full">Sair</button>
              </div>
          </div>
      );
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-fadeIn">
        <div className="bg-secondary/60 backdrop-blur-xl p-10 rounded-[3rem] border border-green-500/30">
          <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-4xl font-black text-white uppercase mb-4">Inscrição Enviada!</h1>
          <p className="text-gray-300 text-lg">Aguarde a nossa análise.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 pb-24">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-xs uppercase">
        <ArrowLeftIcon className="w-4 h-4" /> Voltar
      </button>

      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5">
        <div className="bg-gradient-to-br from-primary/30 to-transparent p-10 text-center">
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight">
            Inscrição <span className="text-primary">Divulgadora</span>
          </h1>
          <p className="text-gray-400 mt-2 font-bold uppercase text-xs tracking-widest">
            {stateMap[state || ''] || state} • {decodeURIComponent(campaignNameFromUrl || '')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-12">
          {error && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center">{error}</div>}

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <UserIcon className="w-6 h-6 text-primary" /> Identificação e Dados
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* E-MAIL EM PRIMEIRO LUGAR */}
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest flex items-center justify-between">
                  <span>E-mail</span>
                  {isAutoFilling && <span className="text-primary animate-pulse normal-case font-black">Buscando dados anteriores...</span>}
                </label>
                <div className="relative">
                  <MailIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="email" required value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    onBlur={handleEmailBlur}
                    className="w-full pl-14 pr-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold transition-all"
                    placeholder="Seu melhor e-mail"
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" required value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full pl-14 pr-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                    placeholder="Seu nome completo"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">WhatsApp</label>
                <div className="relative">
                  <PhoneIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="tel" required value={formData.whatsapp}
                    onChange={handleWhatsAppChange}
                    className="w-full pl-14 pr-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nascimento</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="date" required value={formData.dateOfBirth}
                    onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
                    className="w-full pl-14 pr-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <InstagramIcon className="w-6 h-6 text-primary" /> Redes Sociais
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest flex items-center justify-between">
                    <span>Instagram (Apenas o nome de usuário)</span>
                    <span className="text-[8px] text-yellow-500 opacity-70">Sem @ e sem links</span>
                </label>
                <div className="relative">
                  <InstagramIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" required value={formData.instagram}
                    onChange={handleInstagramChange}
                    className="w-full pl-14 pr-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                    placeholder="usuario"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <CameraIcon className="w-6 h-6 text-primary" /> Fotos (Essencial)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {previews.length < 8 && (
                <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl bg-white/5 cursor-pointer hover:border-primary transition-all">
                  <CameraIcon className="w-10 h-10 text-gray-600 mb-2" />
                  <span className="text-[10px] font-black text-gray-600 uppercase">Anexar</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={e => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files) as File[];
                      setPhotos(files);
                      setPreviews(files.map(f => URL.createObjectURL(f as Blob)));
                    }
                  }} />
                </label>
              )}
            </div>
            <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest text-center">Envie fotos atuais de rosto e corpo.</p>
          </div>

          <div className="pt-8 border-t border-white/5">
             <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.3em] text-center mb-8">Passo 3 de 3 • Finalização</p>
             <button 
                type="submit" disabled={isSubmitting}
                className="w-full py-6 bg-primary text-white font-black text-2xl rounded-[2rem] shadow-2xl shadow-primary/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {isSubmitting ? 'ENVIANDO...' : 'CONCLUIR CADASTRO'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
