import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { addPromoter } from '../services/promoterService';
import { getCampaigns } from '../services/settingsService';
import { Campaign } from '../types';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon } from '../components/Icons';
import { stateMap } from '../constants/states';

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

const PromoterForm: React.FC = () => {
  const { state, campaignName } = useParams<{ state: string; campaignName?: string }>();
  const stateFullName = state ? stateMap[state.toUpperCase()] : 'Brasil';
  
  const [formData, setFormData] = useState({
    name: '',
    whatsapp: '',
    email: '',
    instagram: '',
    tiktok: '',
    dateOfBirth: '',
  });
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
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

    if (!state) {
        setSubmitError("Estado não selecionado. Volte para a página inicial e selecione seu estado.");
        return;
    }

    if (photoFiles.length === 0) {
        setSubmitError("Por favor, selecione pelo menos uma foto para o cadastro.");
        return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const decodedCampaignName = campaignName ? decodeURIComponent(campaignName) : undefined;
      await addPromoter({ ...formData, photos: photoFiles, state, campaignName: decodedCampaignName });
      setSubmitSuccess(true);
      
      setFormData({ name: '', whatsapp: '', email: '', instagram: '', tiktok: '', dateOfBirth: '' });
      setPhotoFiles([]);
      setPhotoPreviews([]);
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (error) {
      console.error("Failed to submit form", error);
      const message = error instanceof Error ? error.message : "Ocorreu um erro ao enviar o formulário. Por favor, tente novamente mais tarde.";
      setSubmitError(message);
       setTimeout(() => setSubmitError(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getButtonText = () => {
      if (isSubmitting) return 'Enviando Cadastro...';
      if (isProcessingPhoto) return 'Processando fotos...';
      return 'Finalizar Cadastro';
  }

  return (
    <div className="max-w-2xl mx-auto">
        <div className="bg-secondary shadow-2xl rounded-lg p-8">
            <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Seja uma Divulgadora - {stateFullName} ({state?.toUpperCase()})</h1>
            {campaignName && <p className="text-center text-primary font-semibold text-lg mb-2">{decodeURIComponent(campaignName)}</p>}
            <p className="text-center text-gray-400 mb-8">Preencha o formulário abaixo para fazer parte do nosso time.</p>
            
            {submitSuccess && (
                <div className="bg-green-900/50 border-l-4 border-green-500 text-green-300 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Sucesso!</p>
                    <p>Seu cadastro foi enviado com sucesso! Fique de olho na página 'Verificar Status' para acompanhar sua aprovação.</p>
                </div>
            )}

            {submitError && (
                <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Erro</p>
                    <p>{submitError}</p>
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputWithIcon Icon={UserIcon} type="text" name="name" placeholder="Nome Completo" value={formData.name} onChange={handleChange} required />
                    <InputWithIcon Icon={CalendarIcon} type="date" name="dateOfBirth" placeholder="Data de Nascimento" value={formData.dateOfBirth} onChange={handleChange} required />
                </div>
                <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="Seu melhor e-mail" value={formData.email} onChange={handleChange} required />
                <InputWithIcon Icon={PhoneIcon} type="tel" name="whatsapp" placeholder="WhatsApp (com DDD)" value={formData.whatsapp} onChange={handleChange} required />
                <InputWithIcon Icon={InstagramIcon} type="text" name="instagram" placeholder="Seu usuário do Instagram (@usuario)" value={formData.instagram} onChange={handleChange} required />
                <InputWithIcon Icon={TikTokIcon} type="text" name="tiktok" placeholder="Seu usuário do TikTok (@usuario)" value={formData.tiktok} onChange={handleChange} />

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Suas melhores fotos</label>
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
    const { state, campaignName } = useParams<{ state: string, campaignName?: string }>();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (state && !campaignName) { // Only fetch campaigns if one isn't already selected in the URL
            setIsLoading(true);
            getCampaigns(state)
                .then(data => {
                    const activeCampaigns = data.filter(c => c.isActive);
                    setCampaigns(activeCampaigns);
                })
                .catch(() => setError("Erro ao carregar os eventos disponíveis."))
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [state, campaignName]);

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

    // If a campaign is already in the URL, or if there are no campaigns for this state, show the form.
    if (campaignName || campaigns.length === 0) {
        return <PromoterForm />;
    }

    // If there are campaigns, show the selection screen.
    return (
        <div className="max-w-4xl mx-auto text-center">
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
                            to={`/register/${state}/${encodeURIComponent(campaign.name)}`}
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
    if (props.type === 'date') {
        const [inputType, setInputType] = useState('text');

        // This effect ensures that if the component receives a value prop (e.g., from form state),
        // it correctly displays as a date input.
        useEffect(() => {
            if (props.value) {
                setInputType('date');
            }
        }, [props.value]);

        const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
            setInputType('date');
            if (props.onFocus) props.onFocus(e);
        };

        const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
            // If the field is empty on blur, switch back to text to show the placeholder.
            if (!e.target.value) {
                setInputType('text');
            }
            if (props.onBlur) props.onBlur(e);
        };

        return (
            <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <Icon className="h-5 w-5 text-gray-400" />
                </span>
                <input
                    {...props}
                    type={inputType}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                    style={{ colorScheme: 'dark' }}
                />
            </div>
        );
    }

    // Default implementation for other input types
    return (
        <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <Icon className="h-5 w-5 text-gray-400" />
            </span>
            <input
                {...props}
                className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
            />
        </div>
    );
};

export default RegistrationFlowPage;