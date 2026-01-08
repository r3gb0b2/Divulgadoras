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

  // Máscara de Telefone
  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 10) {
      return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3').substring(0, 14);
    }
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3').substring(0, 15);
  };

  // Máscara de CPF
  const formatCPF = (value: string) => {
    return value.replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  // Máscara de CEP
  const formatCEP = (value: string) => {
    return value.replace(/\D/g, '').replace(/(\d{5})(\d{3})/, '$1-$2').substring(0, 9);
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
                        ...formData,
                        email: p.email,
                        name: p.name,
                        cpf: (p as any).cpf || '',
                        whatsapp: p.whatsapp,
                        instagram: p.instagram,
                        tiktok: p.tiktok || '',
                        dateOfBirth: p.dateOfBirth,
                        cep: (p as any).cep || '',
                        address: (p as any).address || '',
                        city: (p as any).city || '',
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

  const handleCEPBlur = async () => {
    const cep = formData.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;

    setIsSearchingCep(true);
    try {
        const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await response.json();
        if (!data.erro) {
            setFormData(prev => ({
                ...prev,
                address: `${data.logradouro}, ${data.bairro}`,
                city: `${data.localidade} - ${data.uf}`
            }));
        }
    } catch (e) {
        console.warn("Falha ao buscar CEP");
    } finally {
        setIsSearchingCep(false);
    }
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
                whatsapp: prev.whatsapp || latestProfile.whatsapp,
                instagram: prev.instagram || latestProfile.instagram,
                tiktok: prev.tiktok || latestProfile.tiktok || '',
                dateOfBirth: prev.dateOfBirth || latestProfile.dateOfBirth,
                cpf: prev.cpf || (latestProfile as any).cpf || ''
            }));
        }
    } catch (e) {
        console.warn("Erro no auto-preenchimento");
    } finally {
        setIsAutoFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || isValidOrg === false) {
      setError("Link de cadastro inválido.");
      return;
    }
    
    if (photos.length < 1 && previews.length === 0) {
      setError("Por favor, envie ao menos 1 foto para identificação.");
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
        <div className="flex flex-col justify-center items-center py-40 gap-4">
            <RefreshIcon className="animate-spin h-12 w-12 text-primary" />
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em]">Carregando Ficha...</p>
        </div>
      );
  }

  if (isValidOrg === false) {
      return (
          <div className="max-w-2xl mx-auto py-20 px-4 text-center">
              <div className="bg-red-900/20 border border-red-500/50 p-10 rounded-[3rem] shadow-2xl">
                  <XIcon className="w-20 h-20 text-red-500 mx-auto mb-6" />
                  <h1 className="text-3xl font-black text-white uppercase mb-4 tracking-tighter">Acesso Indisponível</h1>
                  <p className="text-gray-400 font-medium leading-relaxed">Este link de inscrição está inativo ou expirou. Entre em contato com a organização para obter um novo convite.</p>
                  <button onClick={() => navigate('/')} className="mt-8 px-8 py-3 bg-primary text-white font-black rounded-full uppercase tracking-widest text-xs hover:scale-105 transition-all">Voltar para Início</button>
              </div>
          </div>
      );
  }

  if (isSuccess) {
    return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-fadeIn">
        <div className="bg-secondary/60 backdrop-blur-xl p-10 rounded-[3rem] border border-green-500/30 shadow-2xl">
          <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-4xl font-black text-white uppercase mb-4 tracking-tighter">Inscrição Enviada!</h1>
          <p className="text-gray-300 text-lg leading-relaxed">Seu perfil entrou em nossa fila de análise prioritária. Avisaremos você por e-mail assim que for aprovado.</p>
          <div className="mt-8 py-4 px-6 bg-green-500/10 rounded-2xl border border-green-500/20 inline-block">
             <p className="text-green-400 font-black uppercase text-[10px] tracking-widest">Siga @equipecerta no Instagram</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 pb-24">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
        <ArrowLeftIcon className="w-4 h-4" /> Voltar
      </button>

      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5 shadow-2xl">
        <div className="bg-gradient-to-br from-primary/30 to-transparent p-10 md:p-16 text-center relative border-b border-white/5">
          <div className="absolute top-0 right-0 p-8 opacity-10"><MegaphoneIcon className="w-32 h-32 text-white" /></div>
          <h1 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter leading-tight relative z-10">
            Ficha de <span className="text-primary">Inscrição</span>
          </h1>
          <div className="mt-4 flex flex-wrap justify-center gap-3 relative z-10">
            <span className="px-4 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-full text-[10px] font-black uppercase tracking-widest">{stateMap[state || ''] || state}</span>
            <span className="px-4 py-1.5 bg-white/5 text-gray-300 border border-white/10 rounded-full text-[10px] font-black uppercase tracking-widest">{decodeURIComponent(campaignNameFromUrl || '')}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-16 space-y-16">
          {error && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-6 rounded-3xl text-sm font-black text-center flex items-center justify-center gap-3"><AlertTriangleIcon className="w-6 h-6 flex-shrink-0" /> {error}</div>}

          {/* DADOS PESSOAIS */}
          <div className="space-y-10">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
              <span className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><UserIcon className="w-6 h-6" /></span>
              Dados Pessoais
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em] flex items-center justify-between">
                  <span>E-mail Principal</span>
                  {isAutoFilling && <span className="text-primary animate-pulse normal-case font-black">Sincronizando histórico...</span>}
                </label>
                <div className="relative">
                  <MailIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="email" required value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    onBlur={handleEmailBlur}
                    className="w-full pl-16 pr-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold transition-all shadow-inner text-lg"
                    placeholder="exemplo@gmail.com"
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em]">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" required value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full pl-16 pr-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    placeholder="Como no seu RG/CNH"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em]">WhatsApp</label>
                <div className="relative">
                  <PhoneIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="tel" required value={formData.whatsapp}
                    onChange={e => setFormData({...formData, whatsapp: formatPhone(e.target.value)})}
                    className="w-full pl-16 pr-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em]">CPF</label>
                <div className="relative">
                   <CheckCircleIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                   <input 
                    type="tel" required value={formData.cpf}
                    onChange={e => setFormData({...formData, cpf: formatCPF(e.target.value)})}
                    className="w-full pl-16 pr-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>

              <div className="md:col-span-2 space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em]">Data de Nascimento</label>
                <div className="relative">
                  <CalendarIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="date" required value={formData.dateOfBirth}
                    onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
                    className="w-full pl-16 pr-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* ENDEREÇO */}
          <div className="space-y-10">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
              <span className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><MapPinIcon className="w-6 h-6" /></span>
              Localização
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em] flex items-center justify-between">
                        <span>CEP</span>
                        {isSearchingCep && <span className="text-primary animate-pulse normal-case font-black">Buscando...</span>}
                    </label>
                    <input 
                        type="tel" required value={formData.cep}
                        onChange={e => setFormData({...formData, cep: formatCEP(e.target.value)})}
                        onBlur={handleCEPBlur}
                        className="w-full px-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                        placeholder="00000-000"
                    />
                </div>
                <div className="md:col-span-2 space-y-3">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em]">Endereço Completo</label>
                    <input 
                        type="text" required value={formData.address}
                        onChange={e => setFormData({...formData, address: e.target.value})}
                        className="w-full px-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                        placeholder="Rua, Número e Bairro"
                    />
                </div>
            </div>
          </div>

          {/* REDES SOCIAIS */}
          <div className="space-y-10">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-4">
              <span className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><InstagramIcon className="w-6 h-6" /></span>
              Presença Digital
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em]">Usuário Instagram</label>
                <div className="relative">
                  <InstagramIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" required value={formData.instagram}
                    onChange={e => setFormData({...formData, instagram: e.target.value.replace('@', '').trim()})}
                    className="w-full pl-16 pr-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
                    placeholder="seu_usuario"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-[0.2em]">Usuário TikTok (Opcional)</label>
                <div className="relative">
                  <TikTokIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" value={formData.tiktok}
                    onChange={e => setFormData({...formData, tiktok: e.target.value.replace('@', '').trim()})}
                    className="w-full pl-16 pr-8 py-6 bg-dark/60 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold shadow-inner text-lg"
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
                    <span className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary"><CameraIcon className="w-6 h-6" /></span>
                    Material de Book
                </h2>
                <span className="bg-primary/10 text-primary text-[10px] font-black px-4 py-2 rounded-full uppercase tracking-widest border border-primary/20 shadow-lg">Mínimo 01 / Máximo 08 fotos</span>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {previews.map((url, i) => (
                <div key={i} className="relative aspect-[3/4] rounded-[2rem] overflow-hidden border border-white/10 shadow-2xl group ring-2 ring-transparent hover:ring-primary transition-all">
                  <img src={url} alt="" className="w-full h-full object-cover transition-transform group-hover:scale-110" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button type="button" onClick={() => {
                        const newPreviews = [...previews]; newPreviews.splice(i, 1); setPreviews(newPreviews);
                        const newPhotos = [...photos]; newPhotos.splice(i, 1); setPhotos(newPhotos);
                    }} className="bg-red-600 p-3 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all">
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
                  <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] group-hover:text-primary transition-colors">Anexar Foto</span>
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
                    <span className="text-white">REQUISITO CRÍTICO:</span> Envie fotos nítidas de <span className="text-white">Rosto</span> e <span className="text-white">Corpo Inteiro</span> sem filtros excessivos. Perfis com fotos de baixa qualidade ou irreais são recusados instantaneamente pelo nosso sistema de análise visual.
                </p>
            </div>
          </div>

          {/* BOTÃO FINAL */}
          <div className="pt-20 border-t border-white/5 text-center">
             <p className="text-[10px] text-gray-600 font-black uppercase tracking-[0.5em] mb-12">Confirmar autenticidade dos dados</p>
             <button 
                type="submit" disabled={isSubmitting}
                className="w-full py-10 bg-primary text-white font-black text-3xl md:text-4xl rounded-[3rem] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-tighter relative overflow-hidden group"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
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
