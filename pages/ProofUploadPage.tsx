
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignmentById, submitProof } from '../services/postService';
import { PostAssignment } from '../types';
import { ArrowLeftIcon, CameraIcon } from '../components/Icons';

// Helper function to resize and compress images and return a Blob
// Copied from RegistrationForm.tsx to optimize uploads
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


export const ProofUploadPage: React.FC = () => {
    const { assignmentId } = useParams<{ assignmentId: string }>();
    const navigate = useNavigate();

    const [assignment, setAssignment] = useState<PostAssignment | null>(null);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!assignmentId) {
            setError("Nenhum ID de tarefa fornecido.");
            setIsLoading(false);
            return;
        }

        const fetchAssignment = async () => {
            setIsLoading(true);
            try {
                const data = await getAssignmentById(assignmentId);
                if (!data) {
                    throw new Error("Tarefa não encontrada.");
                }
                if (data.proofSubmittedAt) {
                    setSuccess(true);
                }
                setAssignment(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };

        fetchAssignment();
    }, [assignmentId]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files && files.length > 0) {
            if (files.length > 2) {
                setError("Você pode enviar no máximo 2 imagens.");
                e.target.value = ''; // Clear the input
                return;
            }

            setIsProcessingPhoto(true);
            setError(null);
            setImagePreviews([]);
            setImageFiles([]);
            
            try {
                const fileList = Array.from(files);
                const processedFiles = await Promise.all(
                    fileList.map(async (file: File) => {
                        const compressedBlob = await resizeImage(file, 1024, 1024, 0.85);
                        // Create a more robust filename to avoid issues with extensions or special characters.
                        // This ensures the filename matches the jpeg content type, fixing the upload hanging issue.
                        const originalNameWithoutExt = file.name.split('.').slice(0, -1).join('.') || file.name;
                        const safeName = `${originalNameWithoutExt.replace(/[^a-zA-Z0-9-_\.]/g, '')}-${Date.now()}.jpeg`;
                        return new File([compressedBlob], safeName, { type: 'image/jpeg' });
                    })
                );
                
                setImageFiles(processedFiles);
                const previewUrls = processedFiles.map(file => URL.createObjectURL(file));
                setImagePreviews(previewUrls);

            } catch (error) {
                console.error("Error processing image:", error);
                setError("Houve um problema com uma das fotos. Por favor, tente novamente.");
                e.target.value = '';
            } finally {
                setIsProcessingPhoto(false);
            }
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignmentId || imageFiles.length === 0) {
            setError("Por favor, selecione 1 ou 2 imagens para enviar.");
            return;
        }
        setIsSubmitting(true);
        setError(null);
        try {
            await submitProof(assignmentId, imageFiles);
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const getButtonText = () => {
        if (isSubmitting) return 'Enviando...';
        if (isProcessingPhoto) return 'Processando fotos...';
        return 'Enviar Comprovação';
    };

    if (isLoading) {
        return (
            <div className="max-w-2xl mx-auto text-center py-10">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
                <p className="mt-4 text-gray-300">Carregando tarefa...</p>
            </div>
        );
    }
    
    if (success) {
        return (
            <div className="max-w-2xl mx-auto text-center">
                 <button onClick={() => navigate('/posts')} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar para Publicações</span>
                </button>
                <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-2xl font-bold text-green-400 mb-4">Comprovação Enviada!</h1>
                    <p className="text-gray-300 mb-6">Sua comprovação foi enviada com sucesso.</p>
                </div>
            </div>
        );
    }

    if (error && !assignment) {
        return (
             <div className="max-w-2xl mx-auto text-center">
                 <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar</span>
                </button>
                <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-2xl font-bold text-red-400 mb-4">Erro</h1>
                    <p className="text-gray-300">{error}</p>
                </div>
            </div>
        );
    }
    
    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Enviar Comprovação</h1>
                {assignment && <p className="text-center text-primary font-semibold text-lg mb-6">{assignment.post.campaignName}</p>}

                {error && <div className="bg-red-900/50 border-l-4 border-red-500 text-red-300 p-4 mb-6 rounded-md">{error}</div>}

                {assignment && !assignment.proofSubmittedAt ? (
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">Selecione 1 ou 2 prints da postagem:</label>
                            <div className="mt-2 flex items-center gap-4">
                                <label htmlFor="photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-200 hover:bg-gray-600">
                                   <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                                    <span>{imagePreviews.length > 0 ? 'Trocar prints' : 'Enviar prints'}</span>
                                    <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple disabled={isSubmitting || isProcessingPhoto} />
                                </label>
                                <div className="flex-grow flex items-center gap-3 overflow-x-auto p-1">
                                    {isProcessingPhoto ? (
                                        <span className="h-20 w-20 flex-shrink-0 rounded-lg bg-gray-700 flex items-center justify-center">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                        </span>
                                    ) : imagePreviews.length > 0 ? (
                                        imagePreviews.map((preview, index) => (
                                           <img key={index} className="h-20 w-20 flex-shrink-0 rounded-lg object-cover" src={preview} alt={`Prévia ${index + 1}`} />
                                        ))
                                    ) : (
                                        <p className="text-sm text-gray-400">Nenhum arquivo selecionado.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmitting || isProcessingPhoto || imageFiles.length === 0}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50"
                        >
                            {getButtonText()}
                        </button>
                    </form>
                ) : (
                    !isLoading && <p className="text-center text-gray-400">Não é possível enviar comprovação para esta tarefa.</p>
                )}
            </div>
        </div>
    );
};
