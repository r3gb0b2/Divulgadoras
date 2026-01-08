
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getPromoterById, getLatestPromoterProfileByEmail } from '../services/promoterService';
import { getOrganization } from '../services/organizationService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon, MapPinIcon, AlertTriangleIcon, MegaphoneIcon, RefreshIcon, TikTokIcon
} from '../components/Icons';
import { stateMap } from '../constants/states';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName: campaignNameFromUrl } = useParams<{ organizationId: string; state: string; campaignName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const editId = queryParams.get('edit_id');
  
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    cpf: '',
    whatsapp: '',
    instagram: '',
    tiktok: '',
    dateOfBirth: '',
    cep: '',
    address: '',
    city: '',
    campaignName: campaignNameFromUrl ? decodeURIComponent(campaignNameFromUrl) : '',
  });
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidOrg, setIsValidOrg] = useState<boolean | null>(null);

  // --- Máscaras de Input ---
  const formatPhone = (val: string) => {
    const v = val.replace(/\D/g, '').substring(0, 11);
    if (v.length <= 10) return v.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
    return v.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  };

  const formatCPF = (val: string) => {
    return val.replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .substring(0, 14);
  };

  const formatCEP = (val: string) => {
    return val.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').substring(0, 9);
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
            setIsValidOrg(!!org && org.status !== 'deactivated');
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
                        cpf: p.cpf || '',
                        whatsapp: p.whatsapp,
                        instagram: p.instagram,
                        tiktok: p.tiktok || '',
                        dateOfBirth: p.dateOfBirth,
                        cep: p.cep || '',
                        address: p.address || '',
                        city: p.city || '',
                        campaignName: p.campaignName || '',
                    });
                    if (p.photoUrls) setPreviews(p.photoUrls);
                }
            } catch (e) { console.error("Erro ao carregar edição"); }
        }
        setIsLoadingData(false);
    };
    loadInitialData();
  }, [editId, organizationId, state]);

  const handleCEPBlur = async () => {
    const cleanCep = formData.cep.replace(/\D/g, '');
    if (cleanCep.length !== 8) return;

    setIsSearchingCep(true);
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cleanCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
            setFormData(prev => ({
                ...prev,
                address: `${data.logradouro}, ${data.bairro}`,
                city: `${data.localidade} - ${data.uf}`
            }));
        }
    } catch (e) { console.warn("CEP offline"); } 
    finally { setIsSearchingCep(false); }
  };

  const handleEmailBlur = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email || !email.includes('@') || editId) return;

    setIsAutoFilling(true);
    try {
        const latestProfile = await getLatestPromoterProfileByEmail(email);
        if (latestProfile) {
            setFormData(prev => ({
                ...prev,
                name: prev.name || latestProfile.name,
                cpf: prev.cpf || latestProfile.cpf || '',
                whatsapp: prev.whatsapp || latestProfile.whatsapp,
                instagram: prev.instagram || latestProfile.instagram,
                tiktok: prev.tiktok || latestProfile.tiktok || '',
                dateOfBirth: prev.dateOfBirth || latestProfile.dateOfBirth
            }));
        }
    } catch (e) { console.warn("Auto-preenchimento offline"); } 
    finally { setIsAutoFilling(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId) return;
    
    if (photos.length < 1 && previews.length === 0) {
      setError("Envie ao menos 1 foto para identificação.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addPromoter({
        ...formData,
        id: editId || undefined,
        photos,
        state: state || 'CE',
        organizationId 
      } as any);
      
      setIsSuccess(true);
      setTimeout(() => { navigate('/status'); }, 3000);
    } catch (err: any) {
      setError(err.message || "Falha ao salvar.");
      setIsSubmitting(false);
    }
  };

  if (isLoadingData) {
    return (
        <div className="flex flex-col justify-center items-center py-40 gap-4">
            <RefreshIcon className="animate-spin h-12 w-12 text-primary" />
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sincronizando Ficha...</p>
        </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-fadeIn">
        <div className="bg-secondary/60 backdrop-blur-xl p-10 rounded-[3rem] border border-green-500/30 shadow-2xl">
          <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-4xl font-black text-white uppercase tracking-tighter mb-4">Inscrição Enviada!</h1>
          <p className="text-gray-300 text-lg">Seu perfil entrou em nossa fila de análise prioritária. Avisaremos você por e-mail.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 pb-24">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
        <ArrowLeftIcon className="w-4 h-4" /> Voltar
      </button>

      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5">
        <div className="bg-gradient-to-br from-primary/30 to-transparent p-10 md:p-16 text-center relative border-b border-white/5">
          <div className="absolute top-0 right-0 p-8 opacity-10"><MegaphoneIcon className="w-32 h-32 text-white" /></div>
          <h1 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter leading-tight relative z-10">
            Ficha de <span className="text-primary">Inscrição</span>
          </h1>
          <p className="text-gray-400 mt-4 font-black uppercase text-[10px] tracking-[0.3em] relative z-10">
            {stateMap[state || ''] || state} • {decodeURIComponent(campaignNameFromUrl || '')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-16 space-y-16">
          {error && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-6 rounded-3xl text-sm font-black text-center flex items-center justify-center gap-3"><AlertTriangleIcon className="w-6 h-6 flex-shrink-0" /> {error}</div>}

          {/* DADOS PESSOAIS */}
          <div className="space-y-10">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
              <UserIcon className="w-6 h-6 text-primary" /> Dados Pessoais
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest flex items-center justify-between">
                  <span>E-mail Principal</span>
                  {isAutoFilling && <span className="text-primary animate-pulse normal-case font-black">Histórico encontrado! Preenchendo...</span>}
                </label>
                <div className="relative">
                  <MailIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="email" required value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    onBlur={handleEmailBlur}
                    className="w-full pl-16 pr-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold transition-all shadow-inner text-lg"
                    placeholder="exemplo@gmail.com"
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nome Completo</label>
                <input 
                  type="text" required value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                  placeholder="Como no seu documento"
                />
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">WhatsApp</label>
                <div className="relative">
                  <PhoneIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="tel" required value={formData.whatsapp}
                    onChange={e => setFormData({...formData, whatsapp: formatPhone(e.target.value)})}
                    className="w-full pl-16 pr-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">CPF</label>
                <input 
                  type="tel" required value={formData.cpf}
                  onChange={e => setFormData({...formData, cpf: formatCPF(e.target.value)})}
                  className="w-full px-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                  placeholder="000.000.000-00"
                />
              </div>

              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Data de Nascimento</label>
                <input 
                  type="date" required value={formData.dateOfBirth}
                  onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
                  className="w-full px-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                  style={{ colorScheme: 'dark' }}
                />
              </div>
            </div>
          </div>

          {/* LOCALIZAÇÃO */}
          <div className="space-y-10">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
              <MapPinIcon className="w-6 h-6 text-primary" /> Localização
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest flex items-center justify-between">
                        <span>CEP</span>
                        {isSearchingCep && <RefreshIcon className="text-primary animate-spin h-4 w-4" />}
                    </label>
                    <input 
                        type="tel" required value={formData.cep}
                        onChange={e => setFormData({...formData, cep: formatCEP(e.target.value)})}
                        onBlur={handleCEPBlur}
                        className="w-full px-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                        placeholder="00000-000"
                    />
                </div>
                <div className="md:col-span-2 space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Endereço Completo</label>
                    <input 
                        type="text" required value={formData.address}
                        onChange={e => setFormData({...formData, address: e.target.value})}
                        className="w-full px-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                        placeholder="Rua, Número e Bairro"
                    />
                </div>
            </div>
          </div>

          {/* REDES SOCIAIS */}
          <div className="space-y-10">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
              <InstagramIcon className="w-6 h-6 text-primary" /> Presença Digital
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Usuário Instagram</label>
                <div className="relative">
                  <InstagramIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" required value={formData.instagram}
                    onChange={e => setFormData({...formData, instagram: e.target.value.replace('@', '').trim()})}
                    className="w-full pl-16 pr-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    placeholder="seu_usuario"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Link TikTok (Opcional)</label>
                <div className="relative">
                  <TikTokIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" value={formData.tiktok}
                    onChange={e => setFormData({...formData, tiktok: e.target.value.replace('@', '').trim()})}
                    className="w-full pl-16 pr-8 py-6 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    placeholder="seu_tiktok"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* FOTOS */}
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
                    <CameraIcon className="w-6 h-6 text-primary" /> Material de Book
                </h2>
                <span className="bg-primary/10 text-primary text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest border border-primary/20">Obrigatório 1-8 fotos</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl group ring-2 ring-transparent hover:ring-primary transition-all">
                  <img src={url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button type="button" onClick={() => {
                        const newP = [...previews]; newP.splice(i, 1); setPreviews(newP);
                        const newF = [...photos]; newF.splice(i, 1); setPhotos(newF);
                    }} className="bg-red-600 p-3 rounded-full shadow-xl hover:scale-110 active:scale-95 transition-all">
                        <XIcon className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
              ))}
              {previews.length < 8 && (
                <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-[2rem] bg-dark/40 cursor-pointer hover:border-primary transition-all hover:bg-primary/5 active:scale-95 group shadow-inner">
                  <div className="bg-gray-800/80 p-5 rounded-2xl mb-4 group-hover:bg-primary/20 transition-colors">
                    <CameraIcon className="w-10 h-10 text-gray-600 group-hover:text-primary transition-colors" />
                  </div>
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-primary transition-colors">Adicionar</span>
                  <input type="file" multiple accept="image/*" className="hidden" onChange={e => {
                    if (e.target.files) {
                      const files = Array.from(e.target.files) as File[];
                      setPhotos(prev => [...prev, ...files].slice(0, 8));
                      setPreviews(prev => [...prev, ...files.map(f => URL.createObjectURL(f as Blob))].slice(0, 8));
                    }
                  }} />
                </label>
              )}
            </div>
            <div className="p-6 bg-primary/5 border border-primary/20 rounded-[2rem] flex items-start gap-5 shadow-inner">
                <AlertTriangleIcon className="w-8 h-8 text-primary flex-shrink-0" />
                <p className="text-[11px] text-gray-400 font-bold uppercase leading-relaxed tracking-tight">
                    <span className="text-white">REQUISITO CRÍTICO:</span> Envie fotos nítidas de <span className="text-white">Rosto</span> e <span className="text-white">Corpo Inteiro</span>. Perfis sem fotos reais ou de baixa qualidade são recusados automaticamente pelo sistema de análise.
                </p>
            </div>
          </div>

          {/* BOTÃO FINAL */}
          <div className="pt-20 border-t border-white/5 text-center">
             <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.5em] mb-12">Concluir Ficha de Inscrição</p>
             <button 
                type="submit" disabled={isSubmitting}
                className="w-full py-10 bg-primary text-white font-black text-3xl md:text-4xl rounded-[3rem] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-tighter"
              >
                {isSubmitting ? (
                    <div className="flex items-center justify-center gap-5">
                        <RefreshIcon className="w-10 h-10 animate-spin" /> PROCESSANDO...
                    </div>
                ) : 'FINALIZAR INSCRIÇÃO 🚀'}
              </button>
              <p className="mt-8 text-[9px] text-gray-600 font-bold uppercase tracking-widest">Equipe Certa © Tecnologia para Eventos de Elite</p>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
