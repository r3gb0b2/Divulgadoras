
import React, { useState } from 'react';
import { addPromoter } from '../services/promoterService';
import { Promoter } from '../types';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon } from '../components/Icons';

type PromoterFormData = Omit<Promoter, 'id' | 'submissionDate'>;

// Chave de API para o serviço de hospedagem de imagens imgbb
const IMGBB_API_KEY = '6a615217f7911b3390234a02324901f2';

// Função para fazer upload da imagem para um host e retornar a URL
const uploadImageToHost = async (base64Image: string): Promise<string> => {
  const formData = new FormData();
  // Extrai apenas os dados Base64, removendo o prefixo "data:image/jpeg;base64,"
  const base64Data = base64Image.substring(base64Image.indexOf(',') + 1);
  formData.append('image', base64Data);

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Falha no upload da imagem: ${errorData.error.message}`);
  }

  const result = await response.json();
  if (result.data?.url) {
    return result.data.url;
  } else {
    throw new Error('A resposta da API de imagem não continha uma URL.');
  }
};


// Helper function to resize and compress images
const resizeImage = (file: File, maxWidth: number, maxHeight: number, quality: number): Promise<string> => {
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
        
        // Get the data URL as a JPEG with specified quality
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};


const RegistrationForm: React.FC = () => {
  const [formData, setFormData] = useState<PromoterFormData>({
    name: '',
    whatsapp: '',
    email: '',
    instagram: '',
    tiktok: '',
    age: 0,
    photo: '', // Agora irá armazenar a URL da imagem
  });
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? parseInt(value, 10) || 0 : value,
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessingPhoto(true);
      setSubmitError(null);
      setPhotoPreview(null);
      
      try {
        // 1. Redimensiona a imagem localmente
        const resizedBase64 = await resizeImage(file, 800, 800, 0.8);
        setPhotoPreview(resizedBase64); // Mostra preview imediatamente
        setIsProcessingPhoto(false);
        
        // 2. Faz o upload da imagem redimensionada
        setIsUploadingPhoto(true);
        const imageUrl = await uploadImageToHost(resizedBase64);
        
        // 3. Salva a URL retornada no estado do formulário
        setFormData(prev => ({ ...prev, photo: imageUrl }));

      } catch (error) {
        console.error("Error processing or uploading image:", error);
        setSubmitError("Houve um problema com sua foto. Por favor, tente uma imagem diferente ou verifique sua conexão.");
        e.target.value = '';
        setPhotoPreview(null);
      } finally {
        setIsProcessingPhoto(false);
        setIsUploadingPhoto(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!formData.photo) {
        alert("Por favor, aguarde o envio da foto antes de finalizar.");
        return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      await addPromoter(formData);
      setSubmitSuccess(true);
      // Reset form
      setFormData({ name: '', whatsapp: '', email: '', instagram: '', tiktok: '', age: 0, photo: '' });
      setPhotoPreview(null);
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      setTimeout(() => setSubmitSuccess(false), 5000);
    } catch (error) {
      console.error("Failed to submit form", error);
      setSubmitError("Ocorreu um erro ao enviar o formulário. Por favor, tente novamente mais tarde.");
       setTimeout(() => setSubmitError(null), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const getButtonText = () => {
      if (isSubmitting) return 'Enviando...';
      if (isProcessingPhoto) return 'Processando foto...';
      if (isUploadingPhoto) return 'Enviando foto...';
      return 'Finalizar Cadastro';
  }

  return (
    <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-8">
            <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">Seja uma Divulgadora</h1>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8">Preencha o formulário abaixo para fazer parte do nosso time.</p>
            
            {submitSuccess && (
                <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Sucesso!</p>
                    <p>Seu cadastro foi enviado. Entraremos em contato em breve.</p>
                </div>
            )}

            {submitError && (
                <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Erro</p>
                    <p>{submitError}</p>
                </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <InputWithIcon Icon={UserIcon} type="text" name="name" placeholder="Nome Completo" value={formData.name} onChange={handleChange} required />
                    <InputWithIcon Icon={CalendarIcon} type="number" name="age" placeholder="Idade" value={formData.age === 0 ? '' : formData.age} onChange={handleChange} required />
                </div>
                <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="Seu melhor e-mail" value={formData.email} onChange={handleChange} required />
                <InputWithIcon Icon={PhoneIcon} type="tel" name="whatsapp" placeholder="WhatsApp (com DDD)" value={formData.whatsapp} onChange={handleChange} required />
                <InputWithIcon Icon={InstagramIcon} type="text" name="instagram" placeholder="Link do seu Instagram" value={formData.instagram} onChange={handleChange} required />
                <InputWithIcon Icon={TikTokIcon} type="text" name="tiktok" placeholder="Link do seu TikTok" value={formData.tiktok} onChange={handleChange} />

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Sua melhor foto</label>
                    <div className="mt-1 flex items-center space-x-4">
                        <div className="flex-shrink-0">
                           {isProcessingPhoto || isUploadingPhoto ? (
                                <span className="h-24 w-24 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </span>
                            ) : photoPreview ? (
                                <img className="h-24 w-24 rounded-full object-cover" src={photoPreview} alt="Prévia da foto" />
                            ) : (
                                <span className="h-24 w-24 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                                    <CameraIcon className="h-10 w-10 text-gray-400" />
                                </span>
                            )}
                        </div>
                        <label htmlFor="photo-upload" className="cursor-pointer bg-white dark:bg-gray-700 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                            <span>{photoPreview ? 'Trocar foto' : 'Enviar foto'}</span>
                            <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" disabled={isProcessingPhoto || isUploadingPhoto} />
                        </label>
                    </div>
                     {isUploadingPhoto && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Enviando foto, por favor aguarde...</p>}
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting || isProcessingPhoto || isUploadingPhoto}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-pink-300 disabled:cursor-not-allowed transition-all duration-300"
                >
                    {getButtonText()}
                </button>
            </form>
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
                className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-200"
            />
        </div>
    );
};


export default RegistrationForm;
