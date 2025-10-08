import React, { useState } from 'react';
import { Link } from 'react-router-dom';
// Fix: Corrected import paths for services and components.
import { addPromoter } from '../services/promoterService';
import { InstagramIcon, TikTokIcon, UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon } from '../components/Icons';

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


const RegistrationForm: React.FC = () => {
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
    let finalValue = value;

    if (name === 'whatsapp') {
      const onlyNums = value.replace(/\D/g, '');
      finalValue = onlyNums
        .replace(/^(\d{2})/, '($1) ')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .slice(0, 15); // Formato: (XX) XXXXX-XXXX
    }

    setFormData(prev => ({
      ...prev,
      [name]: finalValue,
    }));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setIsProcessingPhoto(true);
      setSubmitError(null);
      // Clear previous selections
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
      setPhotoPreviews([]);
      setPhotoFiles([]);
      
      try {
        const fileList = Array.from(files);
        const processedFiles = await Promise.all(
          // FIX: Explicitly type 'file' as 'File' to resolve a TypeScript inference issue.
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

  const handleRemovePhoto = (indexToRemove: number) => {
    const newFiles = photoFiles.filter((_, index) => index !== indexToRemove);
    const newPreviews = photoPreviews.filter((_, index) => index !== indexToRemove);
    
    // Revoke the object URL to free memory
    URL.revokeObjectURL(photoPreviews[indexToRemove]);

    setPhotoFiles(newFiles);
    setPhotoPreviews(newPreviews);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (photoFiles.length === 0) {
        setSubmitError("Por favor, selecione pelo menos uma foto para o cadastro.");
        return;
    }

    if (!formData.dateOfBirth) {
        setSubmitError("Por favor, insira sua data de nascimento.");
        setTimeout(() => setSubmitError(null), 5000);
        return;
    }
    
    setIsSubmitting(true);
    setSubmitError(null);
    
    try {
      await addPromoter({ ...formData, photos: photoFiles });
      setSubmitSuccess(true);
      
      // Reset form
      setFormData({ name: '', whatsapp: '', email: '', instagram: '', tiktok: '', dateOfBirth: '' });
      photoPreviews.forEach(url => URL.revokeObjectURL(url));
      setPhotoFiles([]);
      setPhotoPreviews([]);
      const fileInput = document.getElementById('photo-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      
      setTimeout(() => setSubmitSuccess(false), 8000);
    // FIX: The catch block now safely handles errors of 'unknown' type.
    // This prevents runtime errors from trying to access properties on a non-Error object.
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
        <div className="bg-white dark:bg-gray-800 shadow-2xl rounded-lg p-4 sm:p-8">
            <h1 className="text-3xl font-bold text-center text-gray-900 dark:text-white mb-2">Seja uma Divulgadora</h1>
            <p className="text-center text-gray-600 dark:text-gray-400 mb-8">Preencha o formulário abaixo para fazer parte do nosso time.</p>
            
            {submitSuccess && (
                <div className="bg-green-100 border-l-4 border-green-500 text-green-700 p-4 mb-6 rounded-md" role="alert">
                    <p className="font-bold">Sucesso!</p>
                    <p>
                        Seu cadastro foi enviado! Fique de olho na página{' '}
                        <Link to="/status" className="font-semibold underline hover:text-green-800">
                            Verificar Status
                        </Link>
                        {' '}para acompanhar a aprovação.
                    </p>
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
                    <InputWithIcon Icon={CalendarIcon} type="date" name="dateOfBirth" placeholder="Data de Nascimento" value={formData.dateOfBirth} onChange={handleChange} required />
                </div>
                <InputWithIcon Icon={MailIcon} type="email" name="email" placeholder="Seu melhor e-mail" value={formData.email} onChange={handleChange} required />
                <InputWithIcon Icon={PhoneIcon} type="tel" name="whatsapp" placeholder="WhatsApp (com DDD)" value={formData.whatsapp} onChange={handleChange} required maxLength={15} />
                <InputWithIcon Icon={InstagramIcon} type="text" name="instagram" placeholder="Link do seu Instagram" value={formData.instagram} onChange={handleChange} required />
                <InputWithIcon Icon={TikTokIcon} type="text" name="tiktok" placeholder="Link do seu TikTok" value={formData.tiktok} onChange={handleChange} />

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Suas melhores fotos</label>
                    <div className="mt-2 flex items-center gap-4">
                        <label htmlFor="photo-upload" className="flex-shrink-0 cursor-pointer bg-white dark:bg-gray-700 py-2 px-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm leading-4 font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
                           <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                            <span>{photoPreviews.length > 0 ? `Trocar (${photoPreviews.length}) fotos` : 'Enviar fotos'}</span>
                            <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple disabled={isProcessingPhoto || isSubmitting} />
                        </label>
                        <div className="flex-grow flex items-center gap-4 overflow-x-auto p-2 scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                          {isProcessingPhoto ? (
                                <span className="h-20 w-20 flex-shrink-0 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center snap-start">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                </span>
                            ) : photoPreviews.length > 0 ? (
                                photoPreviews.map((preview, index) => (
                                   <div key={preview} className="relative flex-shrink-0 snap-start">
                                        <img className="h-20 w-20 rounded-lg object-cover" src={preview} alt={`Prévia da foto ${index + 1}`} />
                                        <button
                                            type="button"
                                            onClick={() => handleRemovePhoto(index)}
                                            className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full h-6 w-6 flex items-center justify-center text-sm font-bold hover:bg-red-700 transition-transform transform hover:scale-110"
                                            aria-label={`Remover foto ${index + 1}`}
                                        >
                                            &times;
                                        </button>
                                    </div>
                                ))
                            ) : (
                                <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">Nenhuma foto selecionada.</p>
                            )}
                        </div>
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={isSubmitting || isProcessingPhoto}
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