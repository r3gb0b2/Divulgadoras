
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getPromoterById, getLatestPromoterProfileByEmail } from '../services/promoterService';
import { getOrganization } from '../services/organizationService';
import { 
  InstagramIcon, UserIcon, MailIcon, 
  PhoneIcon, CalendarIcon, CameraIcon,
  ArrowLeftIcon, CheckCircleIcon, XIcon, AlertTriangleIcon,
  // Added missing RefreshIcon import
  RefreshIcon
} from '../components/Icons';
import { stateMap } from '../constants/states';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName: campaignNameFromUrl } = useParams<{ organizationId: string; state: string; campaignName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const editId = queryParams.get('edit_id');
  
  const [formData, setFormData] = useState({
    email: '', name: '', whatsapp: '', instagram: '', tiktok: '', dateOfBirth: '',
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
    const phoneNumber = value.replace(/\D/g, '');
    if (phoneNumber.length <= 2) return phoneNumber;
    if (phoneNumber.length <= 7) return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2)}`;
    return `(${phoneNumber.slice(0, 2)}) ${phoneNumber.slice(2, 7)}-${phoneNumber.slice(7, 11)}`;
  };

  useEffect(() => {
    const loadInitialData = async () => {
        if (!organizationId || !state) { setIsValidOrg(false); setIsLoadingData(false); return; }
        try {
            const org = await getOrganization(organizationId);
            setIsValidOrg(org && org.status !== 'deactivated');
        } catch (err) { setIsValidOrg(false); }

        if (editId) {
            try {
                const p = await getPromoterById(editId);
                if (p) {
                    setFormData({ email: p.email, name: p.name, whatsapp: formatPhone(p.whatsapp), instagram: p.instagram, tiktok: p.tiktok || '', dateOfBirth: p.dateOfBirth, campaignName: p.campaignName || '' });
                    if (p.photoUrls) setPreviews(p.photoUrls);
                }
            } catch (e) { console.error("Erro ao carregar dados de edição"); }
        }
        setIsLoadingData(false);
    };
    loadInitialData();
  }, [editId, organizationId, state]);

  const handleEmailBlur = async () => {
    const emailStr = formData.email.trim().toLowerCase();
    if (emailStr.endsWith('.con') || emailStr.endsWith('.co')) {
        setError("O e-mail parece estar errado (.con ou .co). Por favor, use .com");
        return;
    }
    if (!emailStr || !emailStr.includes('@') || editId) return;
    setIsAutoFilling(true);
    try {
        const latestProfile = await getLatestPromoterProfileByEmail(emailStr);
        if (latestProfile) {
            setFormData(prev => ({
                ...prev,
                name: prev.name || latestProfile.name,
                whatsapp: prev.whatsapp || formatPhone(latestProfile.whatsapp),
                instagram: prev.instagram || latestProfile.instagram,
                dateOfBirth: prev.dateOfBirth || latestProfile.dateOfBirth
            }));
        }
    } catch (e) { console.warn("Erro no auto-preenchimento"); } finally { setIsAutoFilling(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailStr = formData.email.trim().toLowerCase();
    if (emailStr.endsWith('.con') || emailStr.endsWith('.co')) {
        setError("Corrija o final do e-mail para continuar (.com)");
        return;
    }
    if (!organizationId || isValidOrg === false) { setError("Link inválido."); return; }
    if (photos.length < 1 && previews.length === 0) { setError("Envie ao menos 1 foto."); return; }

    setIsSubmitting(true);
    setError(null);
    try {
      await addPromoter({ ...formData, whatsapp: formData.whatsapp.replace(/\D/g, ''), photos, state: state || 'CE', organizationId } as any);
      localStorage.setItem('saved_promoter_email', emailStr);
      setIsSuccess(true);
      setTimeout(() => { navigate('/status'); }, 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar.");
      setIsSubmitting(false);
    }
  };

  // Fixed missing RefreshIcon error on line 108
  if (isLoadingData) return <div className="flex justify-center items-center py-40"><RefreshIcon className="animate-spin h-10 w-10 text-primary" /></div>;

  if (isSuccess) return (
    <div className="max-w-2xl mx-auto py-20 px-4 text-center animate-fadeIn">
      <div className="bg-secondary/60 backdrop-blur-xl p-10 rounded-[3rem] border border-green-500/30">
        <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
        <h1 className="text-4xl font-black text-white uppercase mb-4">Sucesso!</h1>
        <p className="text-gray-300 text-lg">Cadastro enviado para análise.</p>
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 pb-24">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-xs uppercase"><ArrowLeftIcon className="w-4 h-4" /> Voltar</button>
      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5">
        <div className="bg-gradient-to-br from-primary/30 to-transparent p-10 text-center">
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter leading-tight">Inscrição <span className="text-primary">Divulgadora</span></h1>
          <p className="text-gray-400 mt-2 font-bold uppercase text-xs tracking-widest">{stateMap[state || ''] || state} • {decodeURIComponent(campaignNameFromUrl || '')}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-12">
          {error && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center">{error}</div>}
          <div className="space-y-8">
            <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">E-mail</label>
                <div className="relative">
                  <MailIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} onBlur={handleEmailBlur} className="w-full pl-14 pr-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="seu@email.com" />
                </div>
            </div>
            <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Nome Completo</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">WhatsApp</label>
                    <input type="tel" required value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: formatPhone(e.target.value)})} className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="(00) 00000-0000" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-500 uppercase ml-4 tracking-widest">Instagram</label>
                    <input type="text" required value={formData.instagram} onChange={e => setFormData({...formData, instagram: e.target.value.replace('@', '')})} className="w-full px-6 py-5 bg-white/5 border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="usuario" />
                </div>
            </div>
          </div>
          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3"><CameraIcon className="w-6 h-6 text-primary" /> Fotos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <label className="aspect-[3/4] flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-3xl bg-white/5 cursor-pointer hover:border-primary">
                <CameraIcon className="w-10 h-10 text-gray-600 mb-2" />
                <input type="file" multiple accept="image/*" className="hidden" onChange={e => { if (e.target.files) { const files = Array.from(e.target.files) as File[]; setPhotos(files); setPreviews(files.map(f => URL.createObjectURL(f as Blob))); } }} />
              </label>
              {previews.map((url, i) => <div key={i} className="relative aspect-[3/4] rounded-3xl overflow-hidden border border-white/10"><img src={url} alt="" className="w-full h-full object-cover" /></div>)}
            </div>
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full py-6 bg-primary text-white font-black text-2xl rounded-[2rem] shadow-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50">{isSubmitting ? 'ENVIANDO...' : 'CONCLUIR CADASTRO'}</button>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
