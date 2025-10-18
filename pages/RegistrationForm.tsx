import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail, getPromoterById, resubmitPromoterApplication } from '../services/promoterService';
import { getCampaigns } from '../services/settingsService';
import { Campaign, Promoter } from '../types';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon, ArrowLeftIcon } from '../components/Icons';
import { stateMap } from '../constants/states';

// Lista de nomes masculinos para o aviso de gênero
const MALE_NAMES = [
    'joão', 'pedro', 'lucas', 'matheus', 'gabriel', 'rafael', 'felipe', 'bruno', 'carlos', 
    'marcos', 'paulo', 'rodrigo', 'fernando', 'daniel', 'diego', 'thiago', 'tiago', 'andré', 
    'antonio', 'francisco', 'josé', 'luiz', 'ricardo', 'vinicius', 'guilherme', 'gustavo', 
    'leonardo', 'eduardo', 'marcelo', 'juliano', 'cesar', 'renato', 'adriano', 'leandro', 
    'alexandre', 'fábio', 'sérgio', 'claudio', 'mauricio', 'cristiano', 'heitor', 'davi', 
    'arthur', 'bernardo', 'miguel', 'enzo', 'nicolas', 'lorenzo', 'samuel', 'benjamin', 
    'joaquim', 'augusto', 'caio', 'breno', 'vitor', 'igor', 'yuri', 'henrique', 'otávio'
].map(name => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "")); // Normaliza para remover acentos


// Helper function to resize and compress images and return a Blob
const resizeImage = (file: File, maxWidth: number, maxHeight: number, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      if (!event.target?.result) {
        return reject(new Error("FileReader did not return a result."));
      }
      const img = new Image();
      img.src = event.target.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Could not get canvas context'));
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        
        canvas.toBlob((blob) => {
          if (!blob) {
            return reject(new Error('Canvas to Blob conversion failed'));
          }
          resolve(blob);
        }, 'image/jpeg', quality);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const PromoterForm: React.FC<{ promoterIdForResubmit?: string }> = ({ promoterIdForResubmit }) => {
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

  const [localParams, setLocalParams] = useState({ state, organizationId, campaignName, stateFullName: state ? stateMap[state.toUpperCase()] : '' });

  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showGenderWarning, setShowGenderWarning] = useState(false);
  const [isResubmitMode, setIsResubmitMode] = useState(!!promoterIdForResubmit);


  useEffect(() => {
    const handleResubmitLoad = async () => {
        if (promoterIdForResubmit) {
            setIsCheckingEmail(true);
            try {
                const profile = await getPromoterById(promoterIdForResubmit);
                if (profile && profile.status === 'rejected' && profile.canResubmit) {
                    setFormData({
                        email: profile.email,
                        name: profile.name,
                        whatsapp: profile.whatsapp,
                        instagram: profile.instagram,
                        tiktok: profile.tiktok || '',
                        dateOfBirth: profile.dateOfBirth,
                    });
                    setLocalParams({
                        state: profile.state,
                        organizationId: profile.organizationId,
                        campaignName: profile.campaignName || undefined,
                        stateFullName: stateMap[profile.state.toUpperCase()]
                    });
                    setPhotoPreviews(profile.photoUrls); // Show existing photos
                    setProfileLoaded(true);
                } else {
                    setSubmitError("Este cadastro não é válido para reenvio ou já foi corrigido.");
                }
            } catch (err: any) {
                 setSubmitError(err.message || "Ocorreu um erro ao carregar seus dados.");
            } finally {
                setIsCheckingEmail(false);
            }
        }
    };
    handleResubmitLoad();
  }, [promoterIdForResubmit]);


  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));

    // Check for male name when name input changes
    if (name === 'name') {
        const firstName = value.trim().split(' ')[0].toLowerCase()
            .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // Normalize for comparison
        if (firstName && MALE_NAMES.includes(firstName)) {
            setShowGenderWarning(true);
        } else {
            setShowGenderWarning(false);
        }
    }
  };
  
  const handleCheckEmail = async () => {
    if (isResubmitMode) return; // Don't check email in resubmit mode
    const email = formData.email.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      return; // Don't search for invalid or empty emails
    }

    setIsCheckingEmail(true);
    setProfileLoaded(false);
    setSubmitError(null);

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
        setPhotoPreviews([]);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Ocorreu um erro ao buscar seus dados.";
      setSubmitError(message);
    } finally {
      setIsCheckingEmail(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (files.length > 10) {
        setSubmitError("Você pode enviar no máximo 10 fotos.");
        e.target.value = ''; // Clear the file input
        return;
      }

      setIsProcessingPhoto(true);
      setSubmitError(null);
      setPhotoPreviews([]);
      setPhotoFiles([]);
      
      try {
        const fileList = Array.from(files);
        const processedFiles = await Promise.all(
          fileList.map(async (file: File) => {
            const compressedBlob = await resizeImage(file, 800, 800, 0.8);
            return new File([compressedBlob], file.name, { type: 'image/jpeg' });
          })
        );
        
        setPhotoFiles(processedFiles);
        const previewUrls = processedFiles.map(file => URL.createObjectURL(file));
        setPhotoPreviews(previewUrls);

      } catch (error) {
        console.error("Error processing image:", error);
        setSubmitError("Houve um problema com uma das fotos. Por favor, tente novamente.");
        e.target.value = '';
      } finally {
        setIsProcessingPhoto(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Age validation
    if (formData.dateOfBirth) {
        const birthDate = new Date(formData.dateOfBirth);
        birthDate.setMinutes(birthDate.getMinutes() + birthDate.getTimezoneOffset());
        const today = new Date();
        const fourteenYearsAgo = new Date(today.getFullYear() - 14, today.getMonth(), today.getDate());
        if (birthDate > fourteenYearsAgo) {
            setSubmitError("Você precisa ter pelo menos 14 anos para se cadastrar.");
            return;
        }
    }

    if (!localParams.organizationId) {
        setSubmitError("Organização não identificada.");
        return;
    }
    if (!localParams.state) {
        setSubmitError("Estado não identificado.");
        return;
    }

    if (photoFiles.length === 0 && !isResubmitMode) {
        setSubmitError("Por favor, selecione pelo menos uma foto para o cadastro.");
        return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      if (isResubmitMode && promoterIdForResubmit) {
          // RESUBMIT LOGIC
          await resubmitPromoterApplication(promoterIdForResubmit, { ...formData, photos: photoFiles });
          setSubmitSuccess(true);
          // Don't clear form, just show success message and navigate
          setTimeout(() => navigate(`/status?email=${formData.email}`), 3000);

      } else {
          // CREATE LOGIC
          const decodedCampaignName = localParams.campaignName ? decodeURIComponent(localParams.campaignName) : undefined;
          await addPromoter({ ...formData, photos: photoFiles, state: localParams.state, campaignName: decodedCampaignName, organizationId: localParams.organizationId });
          setSubmitSuccess(true);
          setFormData({ email: '', name: '', whatsapp: '', instagram: '', tiktok: '', dateOfBirth: '' });
          setPhotoFiles([]);
          setPhotoPreviews([]);
          setProfileLoaded(false);
          setShowGenderWarning(false);
          const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          setTimeout(() => setSubmitSuccess(false), 5000);
      }
    } catch (error) {
      console.error("Failed to submit form", error);
      const message = error instanceof Error ? error.message : "Ocorreu um erro ao enviar o formulário.";
      setSubmitError(message);
      setTimeout(() => setSubmitError(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getButtonText = () => {
      if (isSubmitting) return isResubmitMode ? 'Reenviando...' : 'Enviando Cadastro...';
      if (isProcessingPhoto) return 'Processando fotos...';
      return isResubmitMode ? 'Corrigir e Reenviar' : 'Finalizar Cadastro';
  }

  const title = isResubmitMode ? "Corrigir Cadastro" : `Seja uma Divulgadora - ${localParams.stateFullName} (${localParams.state?.toUpperCase()})`;
  const description = isResubmitMode ? "Corrija as informações necessárias e reenvie seu cadastro para uma nova análise." : "Preencha o formulário abaixo para fazer parte do nosso time.";

  return (
    <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Voltar</span>
        </button>
        <div className="bg-secondary shadow-2xl rounded-lg p-8">
            <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">{title}</h1>
            {localParams.campaignName && <p className="text-center text-primary font-semibold text-lg mb-2">{decodeURIComponent(localParams.campaignName)}</p>}
            <p className="text-center text-gray-400 mb-8">{description}</p>
            
            {submitSuccess && (
                <div className="bg-green-900/50 border-l-4 border-green-500 text-green-300 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Sucesso!</p>
                    <p>{isResubmitMode ? "Seu cadastro foi reenviado para análise! Você será redirecionado em breve." : "Seu cadastro foi enviado com sucesso! Fique de olho na página 'Verificar Status'."}</p>
                </div>
            )}

            {submitError && (
                <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Erro</p>
                    <p>{submitError}</p>
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                    <InputWithIcon 
                        Icon={MailIcon} 
                        type="email" 
                        name="email" 
                        placeholder="Seu melhor e-mail" 
                        value={formData.email} 
                        onChange={handleChange} 
                        onBlur={handleCheckEmail}
                        required 
                        disabled={isResubmitMode}
                        className={isResubmitMode ? 'disabled:bg-gray-800 disabled:cursor-not-allowed' : ''}
                    />
                     {isCheckingEmail && <p className="text-sm text-yellow-400 mt-2">Buscando seu cadastro...</p>}
                     {profileLoaded && (
                        <div className="bg-green-900/50 text-green-300 p-3 mt-2 rounded-md text-sm">
                            <p><strong>{isResubmitMode ? 'Dados carregados!' : 'Cadastro encontrado!'}</strong> {isResubmitMode ? 'Corrija o que for necessário e reenvie.' : 'Seus dados foram preenchidos. Verifique e envie suas fotos.'}</p>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <InputWithIcon Icon={UserIcon} type="text" name="name" placeholder="Nome Completo" value={formData.name} onChange={handleChange} required />
                        {showGenderWarning && (
                            <div className="bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-300 p-3 mt-2 rounded-md text-sm" role="alert">
                                <p><strong className="font-semibold">Aviso:</strong> Nossos grupos de divulgação são primariamente destinados ao público feminino. Você pode continuar com o cadastro, mas esteja ciente desta preferência.</p>
                            </div>
                        )}
                    </div>
                    <InputWithIcon Icon={CalendarIcon} type="date" name="dateOfBirth" placeholder="Data de Nascimento" value={formData.dateOfBirth} onChange={handleChange} required />
                </div>
                <InputWithIcon Icon={PhoneIcon} type="tel" name="whatsapp" placeholder="WhatsApp (com DDD)" value={formData.whatsapp} onChange={handleChange} required />
                <InputWithIcon Icon={InstagramIcon} type="text" name="instagram" placeholder="Seu usuário do Instagram (@usuario)" value={formData.instagram} onChange={handleChange} required />
                <InputWithIcon Icon={TikTokIcon} type="text" name="tiktok" placeholder="Seu usuário do TikTok (@usuario)" value={formData.tiktok} onChange={handleChange} />

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Suas melhores fotos (até 10) {isResubmitMode ? '(envie novas se necessário)' : '(obrigatório)'}</label>
                    <div className="mt-2 flex items-center gap-4">
                        <label htmlFor="photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-200 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                           <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                            <span>{photoPreviews.length > 0 ? 'Trocar fotos' : 'Enviar fotos'}</span>
                            <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple disabled={isProcessingPhoto || isSubmitting} />
                        </label>
                        <div className="flex-grow flex items-center gap-3 overflow-x-auto p-1 scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {isProcessingPhoto ? (
                                <span className="h-20 w-20 flex-shrink-0 rounded-lg bg-gray-700 flex items-center justify-center snap-start">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </span>
                            ) : photoPreviews.length > 0 ? (
                                photoPreviews.map((preview, index) => (
                                   <img key={index} className="h-20 w-20 flex-shrink-0 rounded-lg object-cover snap-start" src={preview} alt={`Prévia da foto ${index + 1}`} />
                                ))
                            ) : (
                                <p className="text-sm text-gray-400">Nenhuma foto selecionada.</p>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting || isProcessingPhoto}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-300"
                >
                    {getButtonText()}
                </button>
            </form>
        </div>
    </div>
  );
};

const RegistrationFlowPage: React.FC = () => {
    const { organizationId, state, campaignName, promoterId } = useParams<{ organizationId: string, state: string, campaignName?: string, promoterId?: string }>();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        if (promoterId) { // Resubmit mode, skip campaign fetching
            setIsLoading(false);
            return;
        }

        if (organizationId && state && !campaignName) { // Only fetch campaigns if one isn't already selected in the URL
            setIsLoading(true);
            getCampaigns(state, organizationId)
                .then(data => {
                    const activeCampaigns = data.filter(c => c.isActive);
                    setCampaigns(activeCampaigns);
                })
                .catch(() => setError("Erro ao carregar os eventos disponíveis."))
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [organizationId, state, campaignName, promoterId]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error) {
        return <p className="text-red-400 text-center">{error}</p>;
    }

    // If a promoterId for resubmission exists, go straight to the form.
    if (promoterId) {
        return <PromoterForm promoterIdForResubmit={promoterId} />;
    }

    // If a campaign is in the URL, or if there are no campaigns for this state, show the form.
    if (campaignName || campaigns.length === 0) {
        return <PromoterForm />;
    }

    // If there are campaigns, show the selection screen.
    return (
        <div className="max-w-4xl mx-auto text-center">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-gray-100 mb-2">
                    Selecione o Evento ou Gênero
                </h1>
                <p className="text-gray-400 mb-8">
                    Escolha para qual campanha você gostaria de se inscrever em {state ? stateMap[state.toUpperCase()] : ''}.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {campaigns.map(campaign => (
                        <Link
                            key={campaign.id}
                            to={`/${organizationId}/register/${state}/${encodeURIComponent(campaign.name)}`}
                            className="group block p-6 bg-gray-700 rounded-lg text-center font-semibold text-gray-200 hover:bg-primary hover:text-white transition-all duration-300 transform hover:scale-105"
                        >
                            <span className="text-xl">{campaign.name}</span>
                            {campaign.description && <span className="block text-xs mt-1 text-gray-400 group-hover:text-white transition-all">{campaign.description}</span>}
                        </Link>
                    ))}
                </div>
            </div>
        </div>
    );
};

interface InputWithIconProps extends React.InputHTMLAttributes<HTMLInputElement> {
    Icon: React.ElementType;
}

const InputWithIcon: React.FC<InputWithIconProps> = ({ Icon, ...props }) => {
    return (
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Icon className="h-5 w-5 text-gray-400" />
            </span>
            <input
                {...props}
                className={`w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200 ${props.className || ''}`}
                style={props.type === 'date' ? { colorScheme: 'dark' } : undefined}
            />
        </div>
    );
};

export default RegistrationFlowPage;