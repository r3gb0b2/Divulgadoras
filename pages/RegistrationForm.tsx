import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail, getPromoterById, updatePromoter } from '../services/promoterService';
import { getCampaigns } from '../services/settingsService';
// FIX: Added missing import for Campaign type
import { Campaign } from '../types';
// FIX: Added missing import for Icons
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon, ArrowLeftIcon, FaceIdIcon } from '../components/Icons';
import { stateMap } from '../constants/states';
import { storage } from '../firebase/config';

// Adicionado para suportar o Pixel do Facebook
declare global {
    interface Window {
        fbq?: (...args: any[]) => void;
    }
}


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

const PromoterForm: React.FC = () => {
  const { organizationId, state, campaignName } = useParams<{ organizationId: string; state: string; campaignName?: string }>();
  const location = useLocation();
  const stateFullName = state ? stateMap[state.toUpperCase()] : 'Brasil';
  const navigate = useNavigate();

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
  
  // State for Face Verification
  const [facePhotoFile, setFacePhotoFile] = useState<File | null>(null);
  const [facePhotoPreview, setFacePhotoPreview] = useState<string | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
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
                if (profile.facePhotoUrl) {
                  setFacePhotoPreview(profile.facePhotoUrl); // Show existing face photo
                }
                setProfileLoaded(true);
            }
        }).catch(err => setSubmitError(err.message));
    }
    
    // Cleanup camera on component unmount
    return () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
    };
  }, [location.search]);

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
    // Don't auto-fill if we are in edit mode
    if (editId) return;

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
        // Clear photos as they need to be re-uploaded for each event
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

  const startCamera = async () => {
    try {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        streamRef.current = stream;
        if (videoRef.current) {
            videoRef.current.srcObject = stream;
        }
        setIsCameraOpen(true);
        setFacePhotoPreview(null);
        setFacePhotoFile(null);
    } catch (err) {
        console.error("Error starting camera:", err);
        setSubmitError("Não foi possível acessar a câmera. Verifique as permissões no seu navegador.");
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        context?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        canvas.toBlob((blob) => {
            if (blob) {
                setFacePhotoFile(new File([blob], 'face-verification.jpg', { type: 'image/jpeg' }));
                setFacePhotoPreview(URL.createObjectURL(blob));
            }
        }, 'image/jpeg', 0.9);

        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        setIsCameraOpen(false);
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
    if (!organizationId || !state) {
        setSubmitError("Dados da organização ou estado ausentes.");
        return;
    }
    if (photoFiles.length === 0 && originalPhotoUrls.length === 0) {
        setSubmitError("Por favor, selecione pelo menos uma foto para o cadastro.");
        return;
    }
     if (!facePhotoFile && !facePhotoPreview) {
        setSubmitError("A verificação facial é obrigatória. Por favor, tire uma foto do seu rosto.");
        return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      const decodedCampaignName = campaignName ? decodeURIComponent(campaignName) : undefined;
      
      if (editId) {
        // Update existing promoter
        let finalPhotoUrls = originalPhotoUrls;
        if (photoFiles.length > 0) {
            finalPhotoUrls = await Promise.all(
                photoFiles.map(async (photo) => {
                    const fileExtension = photo.name.split('.').pop();
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                    const storageRef = storage.ref(`promoters-photos/${fileName}`);
                    await storageRef.put(photo);
                    return await storageRef.getDownloadURL();
                })
            );
        }

        await updatePromoter(editId, {
            ...formData,
            photoUrls: finalPhotoUrls,
            facePhoto: facePhotoFile,
            status: 'pending', // Reset status to pending for re-evaluation
            rejectionReason: '', // Clear previous rejection reason
        });
      } else {
        // Create new promoter
        await addPromoter({ ...formData, photos: photoFiles, facePhoto: facePhotoFile, state, campaignName: decodedCampaignName, organizationId });
      }

      setSubmitSuccess(true);
      
      if (window.fbq) { window.fbq('track', 'CompleteRegistration'); }

      setFormData({ email: '', name: '', whatsapp: '', instagram: '', tiktok: '', dateOfBirth: '' });
      setPhotoFiles([]); setPhotoPreviews([]); setOriginalPhotoUrls([]);
      setFacePhotoFile(null); setFacePhotoPreview(null);
      setProfileLoaded(false); setShowGenderWarning(false); setEditId(null);
      
      setTimeout(() => setSubmitSuccess(false), 5000);
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
      if (isSubmitting) return 'Enviando Cadastro...';
      if (isProcessingPhoto) return 'Processando fotos...';
      return editId ? 'Reenviar Cadastro' : 'Finalizar Cadastro';
  }

  const formTitle = editId ? "Corrigir Cadastro" : `Seja uma Divulgadora - ${stateFullName} (${state?.toUpperCase()})`;

  return (
    <div className="max-w-2xl mx-auto">
        <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
            <ArrowLeftIcon className="w-5 h-5" />
            <span>Voltar</span>
        </button>
        <div className="bg-secondary shadow-2xl rounded-lg p-8">
            <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">{formTitle}</h1>
            {campaignName && <p className="text-center text-primary font-semibold text-lg mb-2">{decodeURIComponent(campaignName)}</p>}
            <p className="text-center text-gray-400 mb-8">{editId ? "Verifique e corrija os dados do seu cadastro abaixo." : "Preencha o formulário abaixo para fazer parte do nosso time."}</p>
            
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
                <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="Seu melhor e-mail" value={formData.email} onChange={handleChange} onBlur={handleCheckEmail} disabled={!!editId} required />
                 {isCheckingEmail && <p className="text-sm text-yellow-400 mt-2">Buscando seu cadastro...</p>}
                 {profileLoaded && (
                    <div className="bg-green-900/50 text-green-300 p-3 mt-2 rounded-md text-sm">
                        <p><strong>Cadastro encontrado!</strong> Seus dados foram preenchidos. Verifique se estão corretos e envie suas fotos atualizadas.</p>
                    </div>
                )}
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
                    <label className="block text-sm font-medium text-gray-300 mb-2">Suas melhores fotos (obrigatório)</label>
                    <div className="mt-2 flex items-center gap-4">
                        <label htmlFor="photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-200 hover:bg-gray-600">
                           <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                            <span>{photoPreviews.length > 0 ? 'Trocar fotos' : 'Enviar fotos'}</span>
                            <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple disabled={isProcessingPhoto || isSubmitting} />
                        </label>
                        <div className="flex-grow flex items-center gap-3 overflow-x-auto p-1">
                          {isProcessingPhoto ? <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            : photoPreviews.length > 0 ? (
                                photoPreviews.map((preview, index) => <img key={index} className="h-20 w-20 flex-shrink-0 rounded-lg object-cover" src={preview} alt={`Prévia ${index + 1}`} />)
                            ) : <p className="text-sm text-gray-400">Nenhuma foto selecionada.</p>}
                        </div>
                    </div>
                     {editId && photoFiles.length === 0 && <p className="text-xs text-yellow-400 mt-2">As fotos atuais serão mantidas. Para alterá-las, clique em 'Trocar fotos'.</p>}
                </div>

                <div className="border-t border-gray-700 pt-6">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Verificação Facial (Obrigatório)</label>
                    <p className="text-xs text-gray-400 mb-4">Use a câmera para tirar uma foto nítida do seu rosto. Esta foto será usada para confirmar sua identidade na entrada dos eventos.</p>
                    <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-dark rounded-lg">
                        <div className="w-40 h-40 rounded-lg bg-black flex items-center justify-center overflow-hidden">
                            {isCameraOpen ? (
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover transform -scale-x-100"></video>
                            ) : facePhotoPreview ? (
                                <img src={facePhotoPreview} alt="Prévia Facial" className="w-full h-full object-cover" />
                            ) : (
                                <FaceIdIcon className="w-16 h-16 text-gray-600" />
                            )}
                            <canvas ref={canvasRef} className="hidden"></canvas>
                        </div>
                        <div className="flex flex-col gap-2 w-full sm:w-auto">
                            {isCameraOpen ? (
                                <button type="button" onClick={capturePhoto} className="w-full px-4 py-2 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700">Capturar</button>
                            ) : (
                                <button type="button" onClick={startCamera} className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700">{facePhotoPreview ? 'Tirar Outra Foto' : 'Abrir Câmera'}</button>
                            )}
                        </div>
                    </div>
                </div>

                <button type="submit" disabled={isSubmitting || isProcessingPhoto || isCameraOpen} className="w-full py-3 px-4 bg-primary hover:bg-primary-dark text-white font-medium rounded-md shadow-sm disabled:bg-primary/50 disabled:cursor-not-allowed">
                    {getButtonText()}
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
    const [isValidCampaign, setIsValidCampaign] = useState(false); // Tracks if the URL campaign is valid
    const navigate = useNavigate();

    useEffect(() => {
        if (organizationId && state) {
            setIsLoading(true);
            setError(null);
            
            getCampaigns(state, organizationId)
                .then(allCampaignsForState => {
                    if (campaignName) {
                        const decodedCampaignName = decodeURIComponent(campaignName);
                        const targetCampaign = allCampaignsForState.find(c => c.name === decodedCampaignName);
                        
                        if (targetCampaign && targetCampaign.status !== 'inactive') {
                            setIsValidCampaign(true);
                            setActiveCampaign(targetCampaign);
                        } else {
                            setError("Este evento/gênero não está mais aceitando cadastros ou não foi encontrado.");
                            setIsValidCampaign(false);
                            setActiveCampaign(null);
                        }
                    } else {
                        // No campaign in URL, prepare list for selection
                        const activeCampaigns = allCampaignsForState.filter(c => c.status === 'active');
                        setCampaigns(activeCampaigns);
                        setIsValidCampaign(false); // Not showing form directly
                        setActiveCampaign(null);
                    }
                })
                .catch(() => setError("Erro ao carregar os eventos disponíveis."))
                .finally(() => setIsLoading(false));
        } else {
            setIsLoading(false);
        }
    }, [organizationId, state, campaignName]);

    // Efeito para injetar o script do Pixel
    useEffect(() => {
        if (activeCampaign?.pixelId) {
            const pixelId = activeCampaign.pixelId;
            
            if (window.fbq) {
                window.fbq('init', pixelId);
                window.fbq('track', 'PageView');
                return;
            }

            const script = document.createElement('script');
            script.id = 'meta-pixel-script';
            script.innerHTML = `
                !function(f,b,e,v,n,t,s)
                {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                n.queue=[];t=b.createElement(e);t.async=!0;
                t.src=v;s=b.getElementsByTagName(e)[0];
                s.parentNode.insertBefore(t,s)}(window, document,'script',
                'https://connect.facebook.net/en_US/fbevents.js');
            `;
            document.head.appendChild(script);

            script.onload = () => {
                if (window.fbq) {
                    window.fbq('init', pixelId);
                    window.fbq('track', 'PageView');
                }
            };
            
            const noscript = document.createElement('noscript');
            const img = document.createElement('img');
            img.height = 1;
            img.width = 1;
            img.style.display = 'none';
            img.src = `https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1`;
            noscript.appendChild(img);
            document.body.appendChild(noscript);

            return () => { if (document.body.contains(noscript)) { document.body.removeChild(noscript); } };
        }
    }, [activeCampaign]);


    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
        );
    }

    if (error) {
         return (
             <div className="max-w-4xl mx-auto text-center">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar</span>
                </button>
                 <div className="bg-secondary shadow-2xl rounded-lg p-8">
                     <p className="text-red-400 text-center text-lg">{error}</p>
                 </div>
             </div>
        );
    }

    if (campaignName && isValidCampaign) { return <PromoterForm />; }
    
    if (!campaignName) {
        if (campaigns.length > 0) {
            return (
                <div className="max-w-4xl mx-auto text-center">
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Voltar</span>
                    </button>
                    <div className="bg-secondary shadow-2xl rounded-lg p-8">
                        <h1 className="text-3xl font-bold text-gray-100 mb-2">Selecione o Evento ou Gênero</h1>
                        <p className="text-gray-400 mb-8">Escolha para qual campanha você gostaria de se inscrever em {state ? stateMap[state.toUpperCase()] : ''}.</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {campaigns.map(campaign => (
                                <Link key={campaign.id} to={`/${organizationId}/register/${state}/${encodeURIComponent(campaign.name)}`} className="group block p-6 bg-gray-700 rounded-lg text-center font-semibold text-gray-200 hover:bg-primary hover:text-white transition-all duration-300 transform hover:scale-105">
                                    <span className="text-xl">{campaign.name}</span>
                                    {campaign.description && <span className="block text-xs mt-1 text-gray-400 group-hover:text-white">{campaign.description}</span>}
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            );
        } else {
            return (
                 <div className="max-w-4xl mx-auto text-center">
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                        <ArrowLeftIcon className="w-5 h-5" />
                        <span>Voltar</span>
                    </button>
                    <div className="bg-secondary shadow-2xl rounded-lg p-8">
                        <h1 className="text-2xl font-bold text-gray-100 mb-2">Nenhum Evento Disponível</h1>
                        <p className="text-gray-400 mt-4">No momento, não há eventos ou gêneros aceitando cadastros nesta região. Tente novamente mais tarde.</p>
                    </div>
                </div>
            );
        }
    }

    return null; // Fallback
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
                className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200 disabled:bg-gray-800 disabled:text-gray-400"
                style={props.type === 'date' ? { colorScheme: 'dark' } : undefined}
            />
        </div>
    );
};

export default RegistrationFlowPage;