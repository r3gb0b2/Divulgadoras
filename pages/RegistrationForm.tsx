import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getPromoterById } from '../services/promoterService';
import { getOrganization } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon, ShieldCheckIcon,
  MegaphoneIcon
} from '../components/Icons';
import { stateMap } from '../constants/states';
import { Campaign } from '../types';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName: campaignNameFromUrl } = useParams<{ organizationId: string; state: string; campaignName?: string }>();
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
  
  const [availableCampaigns, setAvailableCampaigns] = useState<Campaign[]>([]);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
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

  useEffect(() => {
    const loadInitialData = async () => {
        if (!organizationId || organizationId === 'register' || organizationId === 'undefined') {
            setIsValidOrg(false);
            setIsLoadingData(false);
            return;
        }

        try {
            const org = await getOrganization(organizationId);
            if (org && org.status !== 'deactivated') {
                setIsValidOrg(true);
                
                const allCampaigns = await getAllCampaigns(organizationId);
                const activeInState = allCampaigns.filter(c => 
                    c.stateAbbr === state && 
                    c.status === 'active'
                );
                setAvailableCampaigns(activeInState);

                if (!formData.campaignName && activeInState.length === 1) {
                    setFormData(prev => ({ ...prev, campaignName: activeInState[0].name }));
                }
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

  const handleWhatsAppChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setFormData({ ...formData, whatsapp: formatted });
  };

  const sanitizeHandle = (input: string) => {
    return input.replace(/https?:\/\/(www\.)?instagram\.com\//i, '').replace(/@/g, '').split('/')[0].trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.campaignName) {
        setError("Por favor, selecione o evento para o qual deseja se candidatar.");
        return;
    }

    if (!organizationId || organizationId === 'register' || isValidOrg === false) {
      setError("Link de cadastro inválido ou expirado. Por favor, solicite o link oficial à sua produtora.");
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
        instagram: sanitizeHandle(formData.instagram),
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
      return (
          <div className="flex justify-center items-center py-40">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
          </div>
      );
  }

  if (isValidOrg === false) {
      return (
          <div className="max-w-2xl mx-auto py-20 px-4 text-center">
              <div className="bg-red-900/20 border border-red-500/50 p-10 rounded-[3rem]">
                  <XIcon className="w-20 h-20 text-red-500 mx-auto mb-6" />
                  <h1 className="text-3xl font-black text-white uppercase mb-4">Link Inválido</h1>
                  <p className="text-gray-400">Esta organização não foi identificada ou o link de cadastro está quebrado.</p>
                  <button onClick={() => navigate('/')} className="mt-8 px-8 py-3 bg-primary text-white font-bold rounded-full">Voltar ao Início</button>
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
          <p className="text-gray-300 text-lg">Seu perfil entrou na fila de aprovação. Em breve você receberá um retorno.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-xs uppercase">
        <ArrowLeftIcon className="w-4 h-4" /> Voltar
      </button>

      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5">
        <div className="bg-gradient-to-br from-primary/30 to-transparent p-10 text-center">
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter">
            {editId ? 'Corrigir' : 'Cadastro'} <span className="text-primary">Divulgadora</span>
          </h1>
          <p className="text-gray-400 mt-2 font-bold uppercase text-xs tracking-widest">
            {stateMap[state || ''] || state} • Inscrição Oficial
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-12">
          {error && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center">{error}</div>}

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <MegaphoneIcon className="w-6 h-6 text-primary" /> Escolha o Evento
            </h2>
            
            <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Selecione para qual evento deseja trabalhar</label>
                {campaignNameFromUrl ? (
                    <div className="w-full px-6 py-5 bg-white/5 border border-primary/30 rounded-3xl text-primary font-black uppercase tracking-tight flex items-center justify-between">
                        <span>{decodeURIComponent(campaignNameFromUrl)}</span>
                        <CheckCircleIcon className="w-5 h-5" />
                    </div>
                ) : (
                    <select 
                        required
                        value={formData.campaignName}
                        onChange={e => setFormData({ ...formData, campaignName: e.target.value })}
                        className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold appearance-none cursor-pointer"
                    >
                        <option value="" className="bg-dark">Clique para selecionar o evento...</option>
                        {availableCampaigns.length > 0 ? (
                            availableCampaigns.map(c => (
                                <option key={c.id} value={c.name} className="bg-dark">{c.name}</option>
                            ))
                        ) : (
                            <option value="" disabled className="bg-dark text-gray-500">Nenhum evento ativo neste estado no momento</option>
                        )}
                    </select>
                )}
            </div>
          </div>

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <UserIcon className="w-6 h-6 text-primary" /> Dados Pessoais
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nome Completo</label>
                <input 
                  type="text" required value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Seu nome completo"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">E-mail</label>
                <input 
                  type="email" required value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary"
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">WhatsApp</label>
                <input 
                  type="tel" required value={formData.whatsapp}
                  onChange={handleWhatsAppChange}
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <InstagramIcon className="w-6 h-6 text-primary" /> Redes Sociais
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Instagram</label>
                <input 
                  type="text" required value={formData.instagram}
                  onChange={e => setFormData({...formData, instagram: e.target.value})}
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary"
                  placeholder="@seuusuario"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nascimento</label>
                <input 
                  type="date" required value={formData.dateOfBirth}
                  onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <CameraIcon className="w-6 h-6 text-primary" /> Fotos
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {previews.length < 4 && (
                <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl bg-white/5 cursor-pointer hover:border-primary transition-all">
                  <CameraIcon className="w-10 h-10 text-gray-600 mb-2" />
                  <span className="text-[10px] font-black text-gray-600 uppercase">Adicionar</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={e => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files);
                      setPhotos(files);
                      setPreviews(files.map(f => URL.createObjectURL(f as Blob)));
                    }
                  }} />
                </label>
              )}
            </div>
          </div>

          <button 
            type="submit" disabled={isSubmitting || (availableCampaigns.length === 0 && !campaignNameFromUrl)}
            className="w-full py-6 bg-primary text-white font-black text-2xl rounded-[2rem] shadow-2xl shadow-primary/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'ENVIANDO...' : 'FINALIZAR INSCRIÇÃO'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;