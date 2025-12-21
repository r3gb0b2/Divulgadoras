import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail, getPromoterById, resubmitPromoterApplication } from '../services/promoterService';
import { getCampaigns } from '../services/settingsService';
import { Campaign } from '../types';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon, ArrowLeftIcon, CheckCircleIcon } from '../components/Icons';
import { stateMap } from '../constants/states';
import { storage } from '../firebase/config';

// Meta Pixel Support
declare global {
    interface Window {
        fbq?: (...args: any[]) => void;
    }
}

const MALE_NAMES = [
    'joão', 'pedro', 'lucas', 'matheus', 'gabriel', 'rafael', 'felipe', 'bruno', 'carlos', 
    'marcos', 'paulo', 'rodrigo', 'fernando', 'daniel', 'diego', 'thiago', 'tiago', 'andré', 
    'antonio', 'francisco', 'josé', 'luiz', 'ricardo', 'vinicius', 'guilherme', 'gustavo', 
    'leonardo', 'eduardo', 'marcelo', 'juliano', 'cesar', 'renato', 'adriano', 'leandro', 
    'alexandre', 'fábio', 'sérgio', 'claudio', 'mauricio', 'cristiano', 'heitor', 'davi', 
    'arthur', 'bernardo', 'miguel', 'enzo', 'nicolas', 'lorenzo', 'samuel', 'benjamin', 
    'joaquim', 'augusto', 'caio', 'breno', 'vitor', 'igor', 'yuri', 'henrique', 'otávio'
].map(name => name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""));

const resizeImage = (file: File, maxWidth: number, maxHeight: number, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      if (!event.target?.result) return reject(new Error("FileReader error"));
      const img = new Image();
      img.src = event.target.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > height) {
          if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
        } else {
          if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
        }
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas error'));
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Blob error'));
          resolve(blob);
        }, 'image/jpeg', quality);
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

const PromoterForm: React.FC = () => {
  const { organizationId, state, campaignName } = useParams<{ organizationId: string; state: string; campaignName?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  
  const stateFullName = state ? (stateMap[state.toUpperCase()] || state) : 'Brasil';

  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    whatsapp: '',
    instagram: '',
    tiktok: '',
    dateOfBirth: '',
  });
  
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [originalPhotoUrls, setOriginalPhotoUrls] = useState<string[]>([]);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showGenderWarning, setShowGenderWarning] = useState(false);

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const idToEdit = queryParams.get('edit_id');
    if (idToEdit) {
        setEditId(idToEdit);
        getPromoterById(idToEdit).then(profile => {
            if (profile) {
                setFormData({
                    email: profile.email,
                    name: profile.name,
                    whatsapp: profile.whatsapp,
                    instagram: profile.instagram,
                    tiktok: profile.tiktok || '',
                    dateOfBirth: profile.dateOfBirth,
                });
                setPhotoPreviews(profile.photoUrls);
                setOriginalPhotoUrls(profile.photoUrls);
                setProfileLoaded(true);
            }
        }).catch(err => setSubmitError(err.message));
    }
  }, [location.search]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'name') {
        const firstName = value.trim().split(' ')[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        setShowGenderWarning(!!firstName && MALE_NAMES.includes(firstName));
    }
  };
  
  const handleCheckEmail = async () => {
    if (editId) return;
    const email = formData.email.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return;
    setIsCheckingEmail(true);
    setProfileLoaded(false);
    try {
      const profile = await getLatestPromoterProfileByEmail(email);
      if (profile) {
        setFormData({
          email: profile.email,
          name: profile.name,
          whatsapp: profile.whatsapp,
          instagram: profile.instagram,
          tiktok: profile.tiktok || '',
          dateOfBirth: profile.dateOfBirth,
        });
        setProfileLoaded(true);
        setPhotoFiles([]);
        setPhotoPreviews(profile.photoUrls);
        setOriginalPhotoUrls(profile.photoUrls);
      }
    } catch (error) {
      setSubmitError("Erro ao buscar dados anteriores.");
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsProcessingPhoto(true);
      setSubmitError(null);
      try {
        const fileList = Array.from(files) as File[];
        const processedFiles = await Promise.all(
          fileList.map(async (file) => {
            const compressedBlob = await resizeImage(file, 1000, 1000, 0.85);
            return new File([compressedBlob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg' });
          })
        );
        setPhotoFiles(processedFiles);
        setPhotoPreviews(processedFiles.map(file => URL.createObjectURL(file)));
      } catch (error) {
        setSubmitError("Erro ao processar imagens.");
      } finally {
        setIsProcessingPhoto(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (formData.dateOfBirth) {
        const birthDate = new Date(formData.dateOfBirth);
        birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
        const today = new Date();
        const minAge = new Date(today.getFullYear() - 14, today.getMonth(), today.getDate());
        if (birthDate > minAge) { setSubmitError("Idade mínima de 14 anos."); return; }
    }
    if (!organizationId || !state) { setSubmitError("Dados de região inválidos."); return; }
    if (photoFiles.length === 0 && originalPhotoUrls.length === 0) { setSubmitError("Envie ao menos uma foto."); return; }
    
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const decodedCampaignName = campaignName ? decodeURIComponent(campaignName) : undefined;
      if (editId) {
        let finalPhotoUrls = originalPhotoUrls;
        if (photoFiles.length > 0) {
            finalPhotoUrls = await Promise.all(
                photoFiles.map(async (photo) => {
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.jpg`;
                    const storageRef = storage.ref(`promoters-photos/${fileName}`);
                    await storageRef.put(photo);
                    return await storageRef.getDownloadURL();
                })
            );
        }
        await resubmitPromoterApplication(editId, { ...formData, photoUrls: finalPhotoUrls, status: 'pending', rejectionReason: '' });
      } else {
        await addPromoter({ ...formData, photos: photoFiles, state, campaignName: decodedCampaignName, organizationId });
      }
      
      localStorage.setItem('saved_promoter_email', formData.email.toLowerCase().trim());
      
      setSubmitSuccess(true);
      if (window.fbq) window.fbq('track', 'CompleteRegistration');
      setTimeout(() => navigate('/status'), 3000);
    } catch (error: any) {
      setSubmitError(error.message || "Erro ao enviar cadastro.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitSuccess) {
    return (
        <div className="max-w-md mx-auto text-center py-20 animate-fadeIn">
            <div className="bg-secondary p-10 rounded-3xl shadow-2xl border border-green-500/30">
                <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-green-500">
                    <CheckCircleIcon className="w-12 h-12" />
                </div>
                <h1 className="text-3xl font-black text-white mb-4">Cadastro Enviado!</h1>
                <p className="text-gray-400 mb-8">Nossa equipe analisará seu perfil. Você será redirecionada para a página de status em instantes.</p>
                <Link to="/status" className="inline-block px-8 py-3 bg-primary text-white font-bold rounded-full hover:bg-primary-dark transition-all">Ver meu Status</Link>
            </div>
        </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-4">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white transition-colors mb-6">
            <ArrowLeftIcon className="w-5 h-5" /> <span>Voltar</span>
        </button>

        <div className="bg-secondary shadow-2xl rounded-3xl overflow-hidden border border-gray-800">
            <div className="bg-primary/10 p-8 text-center border-b border-gray-800">
                <h1 className="text-3xl font-black text-white uppercase tracking-tight">Seja uma Divulgadora</h1>
                <p className="text-primary font-bold mt-1">{stateFullName} • {campaignName ? decodeURIComponent(campaignName) : 'Geral'}</p>
            </div>

            <form onSubmit={handleSubmit} className="p-8 space-y-8">
                {submitError && <div className="bg-red-900/40 border border-red-800 text-red-200 p-4 rounded-xl text-sm font-medium">{submitError}</div>}

                <section className="space-y-4">
                    <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="h-px flex-grow bg-gray-800"></div> Dados de Acesso <div className="h-px flex-grow bg-gray-800"></div>
                    </h2>
                    <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="Seu melhor e-mail" value={formData.email} onChange={handleChange} onBlur={handleCheckEmail} disabled={!!editId} required />
                    {isCheckingEmail && <p className="text-xs text-yellow-400 font-bold animate-pulse">Buscando cadastros anteriores...</p>}
                    {profileLoaded && !editId && <div className="p-3 bg-green-900/20 border border-green-800 rounded-xl text-xs text-green-400 font-medium">Encontramos seu perfil anterior! Seus dados foram preenchidos automaticamente.</div>}
                </section>

                <section className="space-y-4">
                    <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="h-px flex-grow bg-gray-800"></div> Informações Pessoais <div className="h-px flex-grow bg-gray-800"></div>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputWithIcon Icon={UserIcon} type="text" name="name" placeholder="Nome Completo" value={formData.name} onChange={handleChange} required />
                        <InputWithIcon Icon={CalendarIcon} type="date" name="dateOfBirth" value={formData.dateOfBirth} onChange={handleChange} required />
                    </div>
                    {showGenderWarning && <div className="p-3 bg-yellow-900/30 border border-yellow-800 rounded-xl text-xs text-yellow-200"><strong>Aviso:</strong> Nossos grupos são primariamente para o público feminino. Você pode continuar, mas a seleção prioriza mulheres.</div>}
                    <InputWithIcon Icon={PhoneIcon} type="tel" name="whatsapp" placeholder="WhatsApp (com DDD)" value={formData.whatsapp} onChange={handleChange} required />
                </section>

                <section className="space-y-4">
                    <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="h-px flex-grow bg-gray-800"></div> Redes Sociais <div className="h-px flex-grow bg-gray-800"></div>
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <InputWithIcon Icon={InstagramIcon} type="text" name="instagram" placeholder="@seuinstagram" value={formData.instagram} onChange={handleChange} required />
                        <InputWithIcon Icon={TikTokIcon} type="text" name="tiktok" placeholder="@seutiktok (opcional)" value={formData.tiktok} onChange={handleChange} />
                    </div>
                </section>

                <section className="space-y-4">
                    <h2 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                        <div className="h-px flex-grow bg-gray-800"></div> Fotos do Perfil <div className="h-px flex-grow bg-gray-800"></div>
                    </h2>
                    <div className="p-6 border-2 border-dashed border-gray-700 rounded-3xl bg-gray-800/30 hover:border-primary/50 transition-colors">
                        <label className="flex flex-col items-center cursor-pointer">
                            <div className="w-12 h-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary mb-3">
                                <CameraIcon className="w-6 h-6" />
                            </div>
                            <span className="text-white font-bold">{photoPreviews.length > 0 ? 'Substituir Fotos' : 'Selecionar Fotos'}</span>
                            <span className="text-gray-500 text-xs mt-1">Corpo e rosto (Mínimo 1, Máximo 5)</span>
                            <input type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple disabled={isProcessingPhoto || isSubmitting} />
                        </label>
                    </div>

                    <div className="flex gap-3 overflow-x-auto pb-2 scroll-smooth">
                        {isProcessingPhoto ? (
                            <div className="h-24 w-full flex items-center justify-center bg-gray-800 rounded-2xl animate-pulse">
                                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                            </div>
                        ) : photoPreviews.length > 0 ? (
                            photoPreviews.map((p, i) => <img key={i} src={p} className="h-24 w-24 flex-shrink-0 object-cover rounded-2xl border-2 border-gray-700 shadow-lg" alt="Preview" />)
                        ) : null}
                    </div>
                </section>

                <button
                    type="submit"
                    disabled={isSubmitting || isProcessingPhoto}
                    className="w-full py-4 bg-primary text-white font-black uppercase tracking-widest rounded-2xl shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all transform hover:-translate-y-1 disabled:opacity-50 disabled:translate-y-0"
                >
                    {isSubmitting ? 'Enviando...' : editId ? 'Reenviar Correção' : 'Finalizar Inscrição'}
                </button>
            </form>
        </div>
    </div>
  );
};

const RegistrationFlowPage: React.FC = () => {
    const { organizationId, state, campaignName } = useParams<{ organizationId: string, state: string, campaignName?: string }>();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [activeCampaign, setActiveCampaign] = useState<Campaign | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    const stateFullName = state ? (stateMap[state.toUpperCase()] || state) : 'Brasil';

    useEffect(() => {
        if (organizationId && state) {
            setIsLoading(true);
            getCampaigns(state, organizationId)
                .then(all => {
                    if (campaignName) {
                        const target = all.find(c => c.name === decodeURIComponent(campaignName));
                        if (target && target.status !== 'inactive') setActiveCampaign(target);
                        else setError("Este evento não está mais aceitando cadastros.");
                    } else {
                        setCampaigns(all.filter(c => c.status === 'active'));
                    }
                })
                .catch(() => setError("Erro ao carregar eventos."))
                .finally(() => setIsLoading(false));
        }
    }, [organizationId, state, campaignName]);

    useEffect(() => {
        if (activeCampaign?.pixelId) {
            const pixelId = activeCampaign.pixelId;
            if (window.fbq) { window.fbq('init', pixelId); window.fbq('track', 'PageView'); return; }
            const script = document.createElement('script');
            script.innerHTML = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');`;
            document.head.appendChild(script);
            script.onload = () => { if (window.fbq) { window.fbq('init', pixelId); window.fbq('track', 'PageView'); } };
        }
    }, [activeCampaign]);

    if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    if (error) return <div className="max-w-2xl mx-auto bg-secondary p-8 rounded-3xl text-center border border-red-800 text-red-400">{error}</div>;
    if (campaignName && activeCampaign) return <PromoterForm />;
    
    return (
        <div className="max-w-4xl mx-auto py-8">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition-colors"><ArrowLeftIcon className="w-5 h-5" /> <span>Voltar</span></button>
            <div className="bg-secondary shadow-2xl rounded-3xl p-10 border border-gray-800">
                <h1 className="text-3xl font-black text-white mb-2 text-center uppercase tracking-tight">Escolha o Evento</h1>
                <p className="text-gray-500 mb-10 text-center">Para qual grupo você deseja se candidatar em {stateFullName}?</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {campaigns.map(c => (
                        <Link key={c.id} to={`/${organizationId}/register/${state}/${encodeURIComponent(c.name)}`} className="group p-6 bg-gray-800/50 rounded-2xl border border-gray-700 hover:bg-primary transition-all duration-300">
                            <span className="block text-xl font-bold text-white group-hover:text-white">{c.name}</span>
                            <span className="text-xs text-gray-500 group-hover:text-purple-100">{c.description || 'Clique para se cadastrar'}</span>
                        </Link>
                    ))}
                </div>
                {campaigns.length === 0 && <p className="text-center text-gray-500 py-10">Nenhum evento ativo para esta região.</p>}
            </div>
        </div>
    );
};

const InputWithIcon: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { Icon: React.ElementType }> = ({ Icon, ...props }) => (
    <div className="relative group">
        <span className="absolute inset-y-0 left-0 flex items-center pl-4 transition-colors text-gray-500 group-focus-within:text-primary">
            <Icon className="h-5 w-5" />
        </span>
        <input {...props} className="w-full pl-12 pr-4 py-4 border border-gray-700 rounded-2xl bg-gray-800/50 text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all" />
    </div>
);

export default RegistrationFlowPage;