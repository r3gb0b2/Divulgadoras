import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getPromoterById } from '../services/promoterService';
import { getOrganization } from '../services/organizationService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon, ShieldCheckIcon
} from '../components/Icons';
import { stateMap } from '../constants/states';

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
    cpf: '',
    campaignName: campaignNameFromUrl ? decodeURIComponent(campaignNameFromUrl) : '',
  });
  
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidOrg, setIsValidOrg] = useState<boolean | null>(null);

  useEffect(() => {
    // Validar se a organização existe antes de permitir o cadastro
    if (organizationId) {
        getOrganization(organizationId).then(org => {
            setIsValidOrg(!!org && org.status !== 'deactivated');
        }).catch(() => setIsValidOrg(false));
    } else {
        setIsValidOrg(false);
    }

    if (editId) {
        getPromoterById(editId).then(p => {
            if (p) {
                setFormData({
                    email: p.email,
                    name: p.name,
                    whatsapp: p.whatsapp,
                    instagram: p.instagram,
                    tiktok: p.tiktok || '',
                    dateOfBirth: p.dateOfBirth,
                    cpf: (p as any).cpf || '',
                    campaignName: p.campaignName || '',
                });
                if (p.photoUrls) setPreviews(p.photoUrls);
            }
        });
    }
  }, [editId, organizationId]);

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length > 11) value = value.slice(0, 11);
    value = value.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
    setFormData({ ...formData, cpf: value });
  };

  const sanitizeHandle = (input: string) => {
    return input.replace(/https?:\/\/(www\.)?instagram\.com\//i, '').replace(/@/g, '').split('/')[0].trim();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId || !state || isValidOrg === false) {
      setError("Link de cadastro inválido. Por favor, solicite um novo link oficial.");
      return;
    }
    
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
        instagram: sanitizeHandle(formData.instagram),
        photos,
        state,
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

  if (isValidOrg === false) {
      return (
          <div className="max-w-2xl mx-auto py-20 px-4 text-center">
              <div className="bg-red-900/20 border border-red-500/50 p-10 rounded-[3rem]">
                  <XIcon className="w-20 h-20 text-red-500 mx-auto mb-6" />
                  <h1 className="text-3xl font-black text-white uppercase mb-4">Link Inválido</h1>
                  <p className="text-gray-400">Esta organização não existe ou o link de cadastro está quebrado.</p>
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
            {formData.campaignName || 'Inscrição Oficial'} • {stateMap[state || ''] || state}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-12">
          {error && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center">{error}</div>}

          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3">
              <UserIcon className="w-6 h-6 text-primary" /> Dados Pessoais
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nome Completo</label>
                <input 
                  type="text" required value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Seu nome"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">CPF</label>
                <input 
                  type="text" required value={formData.cpf}
                  onChange={handleCpfChange}
                  className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary"
                  placeholder="000.000.000-00"
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
                  onChange={e => setFormData({...formData, whatsapp: e.target.value})}
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
            type="submit" disabled={isSubmitting}
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