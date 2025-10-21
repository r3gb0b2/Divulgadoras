import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignmentById, submitProof } from '../services/postService';
import { PostAssignment } from '../types';
import { ArrowLeftIcon, CameraIcon } from '../components/Icons';

// Helper function to resize and compress images. This utility is robust.
const resizeImage = (file: File, maxWidth: number, maxHeight: number, quality: number): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const blobURL = URL.createObjectURL(file);
    const img = new Image();
    img.src = blobURL;

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
        URL.revokeObjectURL(blobURL);
        return reject(new Error('Não foi possível obter o contexto do canvas.'));
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(blobURL); // Clean up
        if (!blob) {
          return reject(new Error('Falha na conversão de canvas para Blob.'));
        }
        resolve(blob);
      }, 'image/jpeg', quality);
    };
    
    img.onerror = (error) => {
      URL.revokeObjectURL(blobURL);
      reject(error);
    };
  });
};


export const ProofUploadPage: React.FC = () => {
    const { assignmentId } = useParams<{ assignmentId: string }>();
    const navigate = useNavigate();

    const [assignment, setAssignment] = useState<PostAssignment | null>(null);
    const [processedFiles, setProcessedFiles] = useState<Blob[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingImages, setIsProcessingImages] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
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
                    throw new Error("Tarefa não encontrada ou inválida.");
                }
                if (data.proofSubmittedAt) {
                    setSuccess(true); // If proof is already there, show success page
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

    useEffect(() => {
        // Cleanup function to revoke object URLs to prevent memory leaks
        return () => {
            imagePreviews.forEach(url => URL.revokeObjectURL(url));
        };
    }, [imagePreviews]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        
        // Let useEffect handle cleanup of old previews when state changes
        setImagePreviews([]);
        setProcessedFiles([]);
        
        if (!files || files.length === 0) {
            return;
        }

        if (files.length > 2) {
            setError("Você pode enviar no máximo 2 imagens.");
            e.target.value = ''; // Clear the input
            return;
        }

        setError(null);
        setIsProcessingImages(true);

        try {
            const fileList = Array.from(files);
            const newProcessedBlobs = await Promise.all(
                // FIX: Explicitly type 'file' as File to resolve type inference issue.
                fileList.map((file: File) => {
                    return resizeImage(file, 600, 600, 0.7);
                })
            );
            
            setProcessedFiles(newProcessedBlobs);
            const previewUrls = newProcessedBlobs.map(blob => URL.createObjectURL(blob));
            setImagePreviews(previewUrls);

        } catch (err) {
            console.error("Error processing images:", err);
            setError("Houve um problema ao processar as imagens. Tente novamente.");
            e.target.value = '';
        } finally {
            setIsProcessingImages(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignmentId || processedFiles.length === 0) {
            setError("Por favor, selecione 1 ou 2 imagens para enviar.");
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            await submitProof(assignmentId, processedFiles);
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro desconhecido durante o envio.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const buttonText = isSubmitting ? 'Enviando Print...' : isProcessingImages ? 'Processando...' : 'Enviar Comprovação';

    // UI Renderings
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
                    <p className="text-gray-300 mb-6">Sua comprovação para o evento <strong>{assignment?.post.campaignName}</strong> foi enviada com sucesso.</p>
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
                            
                            <div className="mt-4 flex justify-center items-center gap-4 p-4 border border-dashed border-gray-600 rounded-lg min-h-[12rem]">
                                {isProcessingImages ? (
                                    <div className="text-center text-gray-400">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto"></div>
                                        <p className="mt-2 text-sm">Processando...</p>
                                    </div>
                                ) : imagePreviews.length > 0 ? (
                                    imagePreviews.map((preview, index) => (
                                        <img key={index} className="max-h-48 w-auto rounded-lg object-contain" src={preview} alt={`Prévia ${index + 1}`} />
                                    ))
                                ) : (
                                    <div className="text-center text-gray-500">
                                        <CameraIcon className="w-12 h-12 mx-auto" />
                                        <p className="mt-2 text-sm">A prévia da imagem aparecerá aqui</p>
                                    </div>
                                )}
                            </div>

                            <div className="mt-4 flex justify-center">
                                <label htmlFor="photo-upload" className="cursor-pointer bg-gray-700 py-2 px-4 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-200 hover:bg-gray-600">
                                   <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                                    <span>{imagePreviews.length > 0 ? 'Trocar prints' : 'Selecionar prints'}</span>
                                    <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple disabled={isSubmitting || isProcessingImages} />
                                </label>
                            </div>
                        </div>
                        <button
                            type="submit"
                            disabled={isSubmitting || isProcessingImages || processedFiles.length === 0}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50 disabled:cursor-not-allowed"
                        >
                            {buttonText}
                        </button>
                    </form>
                ) : (
                    !isLoading && <p className="text-center text-gray-400">Não é possível enviar comprovação para esta tarefa. Ela já pode ter sido concluída.</p>
                )}
            </div>
        </div>
    );
};