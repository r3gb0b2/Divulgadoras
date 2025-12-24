
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail } from '../services/promoterService';
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
  
  const [currentStep, setCurrentStep] = useState(1);
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
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carregar campanhas disponíveis
  useEffect(() => {
    if (organizationId && state) {
      setIsLoadingCampaigns(true);
      getCampaigns(state, organizationId)
        .then(camps => {
          const actives = camps.filter(c => c.status === 'active');
          setAvailableCampaigns(actives);
          if (!campaignNameFromUrl && actives.length === 1) {
            setFormData(prev => ({ ...prev, campaignName: actives[0].name }));
          }
        })
        .finally(() => setIsLoadingCampaigns(false));
    }
  }, [organizationId, state, campaignNameFromUrl]);

  const sanitizeHandle = (input: string) => {
    return input.replace(/https?:\/\/(www\.)?instagram\.com\//i, '')
                .replace(/https?:\/\/(www\.)?tiktok\.com\/@?/i, '')
                .replace(/@/g, '').split('/')[0].trim();
  };

  const handleBlurEmail = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email || !email.includes('@')) return;
    try {
      const profile = await getLatestPromoterProfileByEmail(email);
      if (profile) {
        setFormData(prev => ({
          ...prev,
          name: profile.name || prev.name,
          whatsapp: profile.whatsapp || prev.whatsapp,
          instagram: profile.instagram || prev.instagram,
          dateOfBirth: profile.dateOfBirth || prev.dateOfBirth
        }));
      }
    } catch (e) {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const totalPhotos = [...photos, ...filesArray].slice(0, 6);
      setPhotos(totalPhotos);
      setPreviews(totalPhotos.map(file => URL.createObjectURL(file)));
      setError(null);
    }
  };

  const removePhoto = (index: number) => {
    setPhotos(photos.filter((_, i) => i !== index));
    setPreviews(previews.filter((_, i) => i !== index));
  };

  const nextStep = () => {
    if (currentStep === 1) {
        if (!formData.email || !formData.name || !formData.campaignName) {
            setError("Preencha os campos obrigatórios para continuar.");
            return;
        }
    }
    if (currentStep === 2) {
        if (!formData.whatsapp || !formData.instagram || !formData.dateOfBirth) {
            setError("Preencha seus dados de contato.");
            return;
        }
    }
    setError(null);
    setCurrentStep(prev => prev + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (photos.length < 1) {
      setError("Envie pelo menos uma foto nítida.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await addPromoter({
        ...formData,
        email: formData.email.toLowerCase().trim(),
        instagram: sanitizeHandle(formData.instagram),
        photos,
        state: state || 'CE',
        organizationId: organizationId || 'default'
      });
      
      setIsSuccess(true);
      setTimeout(() => navigate('/status'), 3000);
    } catch (err: any) {
      setError(err.message || "Erro ao processar cadastro.");
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="max-w-md mx-auto py-20 px-4 text-center animate-fadeIn">
        <div className="bg-secondary p-10 rounded-[2.5rem] border border-green-500/30 shadow-2xl">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircleIcon className="w-12 h-12 text-green-500" />
          </div>
          <h1 className="text-3xl font-black text-white uppercase mb-4">Sucesso!</h1>
          <p className="text-gray-400">Sua inscrição foi enviada para análise.</p>
          <div className="mt-8 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-8 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-white flex items-center gap-2 font-bold uppercase text-xs">
          <ArrowLeftIcon className="w-4 h-4" /> Voltar
        </button>
        <div className="flex gap-2">
            {[1, 2, 3].map(step => (
                <div key={step} className={`h-1.5 w-10 rounded-full transition-all ${currentStep >= step ? 'bg-primary' : 'bg-gray-700'}`}></div>
            ))}
        </div>
      </div>

      <div className="bg-secondary rounded-[2.5rem] overflow-hidden border border-white/5 shadow-2xl">
        <div className="bg-gradient-to-r from-primary/20 to-transparent p-8 border-b border-white/5">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Cadastro de <span className="text-primary">Divulgadora</span>
          </h1>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
            {stateMap[state || 'CE']} • {formData.campaignName || 'Evento'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {error && (
            <div className="bg-red-900/30 border border-red-500/50 text-red-200 p-4 rounded-2xl text-sm font-bold flex items-center gap-3 animate-shake">
              <XIcon className="w-5 h-5 text-red-500" /> {error}
            </div>
          )}

          {currentStep === 1 && (
            <div className="space-y-6 animate-slideRight">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest">Qual o Evento?</label>
                <div className="relative">
                  <MegaphoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <select 
                    value={formData.campaignName}
                    onChange={e => setFormData({...formData, campaignName: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white appearance-none outline-none focus:ring-2 focus:ring-primary font-bold"
                  >
                    <option value="">Selecione o Evento...</option>
                    {availableCampaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    <option value="Geral">Banco de Talentos (Geral)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest">Seu melhor E-mail</label>
                <div className="relative">
                  <MailIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="email" 
                    value={formData.email}
                    onChange={e => setFormData({...formData, email: e.target.value})}
                    onBlur={handleBlurEmail}
                    className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-medium"
                    placeholder="exemplo@email.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest">Nome Completo</label>
                <div className="relative">
                  <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary font-medium"
                    placeholder="Como no seu RG"
                  />
                </div>
              </div>

              <button type="button" onClick={nextStep} className="w-full py-5 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20">
                PRÓXIMO PASSO
              </button>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6 animate-slideRight">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest">WhatsApp</label>
                  <div className="relative">
                    <PhoneIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input 
                      type="tel" 
                      value={formData.whatsapp}
                      onChange={e => setFormData({...formData, whatsapp: e.target.value})}
                      className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary"
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest">Data Nascimento</label>
                  <div className="relative">
                    <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                    <input 
                      type="date" 
                      value={formData.dateOfBirth}
                      onChange={e => setFormData({...formData, dateOfBirth: e.target.value})}
                      className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-2 tracking-widest">Instagram (apenas o @)</label>
                <div className="relative">
                  <InstagramIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input 
                    type="text" 
                    value={formData.instagram}
                    onChange={e => setFormData({...formData, instagram: e.target.value})}
                    className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white outline-none focus:ring-2 focus:ring-primary"
                    placeholder="@seuusuario"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button type="button" onClick={() => setCurrentStep(1)} className="flex-1 py-5 bg-gray-700 text-white font-black rounded-2xl">VOLTAR</button>
                <button type="button" onClick={nextStep} className="flex-[2] py-5 bg-primary text-white font-black rounded-2xl">PRÓXIMO</button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-8 animate-slideRight">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-6">Envie fotos nítidas. Recomendamos uma de rosto e uma de corpo inteiro.</p>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {previews.map((src, i) => (
                    <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-gray-700 group">
                      <img src={src} className="w-full h-full object-cover" />
                      <button 
                        type="button" 
                        onClick={() => removePhoto(i)}
                        className="absolute top-2 right-2 bg-red-600 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <XIcon className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {photos.length < 6 && (
                    <label className="aspect-square border-2 border-dashed border-gray-700 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-primary/5 transition-all">
                      <CameraIcon className="w-8 h-8 text-gray-600 mb-2" />
                      <span className="text-[10px] font-black text-gray-600 uppercase">Anexar Foto</span>
                      <input type="file" multiple accept="image/*" className="hidden" onChange={handleFileChange} />
                    </label>
                  )}
                </div>
              </div>

              <div className="flex gap-4">
                <button type="button" onClick={() => setCurrentStep(2)} className="flex-1 py-5 bg-gray-700 text-white font-black rounded-2xl">VOLTAR</button>
                <button 
                    type="submit" 
                    disabled={isSubmitting || photos.length === 0}
                    className="flex-[2] py-5 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'ENVIANDO...' : 'FINALIZAR CADASTRO'}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
