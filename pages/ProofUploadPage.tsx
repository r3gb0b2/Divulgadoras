import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getAssignmentById, submitProof } from '../services/postService';
import { PostAssignment, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon } from '../components/Icons';
import StorageMedia from '../components/StorageMedia';

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

const ProofUploadPage: React.FC = () => {
    const { assignmentId } = useParams<{ assignmentId: string }>();
    const navigate = useNavigate();

    const [assignment, setAssignment] = useState<PostAssignment | null>(null);
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        if (!assignmentId) {
            setError("ID da tarefa não encontrado.");
            setIsLoading(false);
            return;
        }
        const fetchAssignment = async () => {
            try {
                const data = await getAssignmentById(assignmentId);
                if (!data) throw new Error("Tarefa não encontrada.");

                // Check if deadline has passed and late submissions are not allowed
                if (data.status === 'confirmed' && data.confirmedAt && !data.proofSubmittedAt) {
                    const confirmationTime = (data.confirmedAt as Timestamp).toDate();
                    const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000);
                    const now = new Date();
                    if (now > expireTime && !data.post.allowLateSubmissions) {
                        throw new Error("O prazo para envio da comprovação já encerrou e não foi liberado pelo organizador.");
                    }
                }
                
                setAssignment(data);

                if (data.proofImageUrls && data.proofImageUrls.length > 0) {
                    setSuccess(true); // Already submitted
                }

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
            setIsProcessingPhoto(true);
            setError(null);

            try {
                const fileList = Array.from(files).slice(0, 2); // Max 2 files
                const processedFiles = await Promise.all(
                    fileList.map(async (file: File) => {
                        // Screenshots can be large, então comprimimos antes do upload
                        const compressedBlob = await resizeImage(file, 800, 1200, 0.8);
                        return new File([compressedBlob], file.name, { type: 'image/jpeg' });
                    })
                );

                setImageFiles(processedFiles);
                const previewUrls = processedFiles.map(file => URL.createObjectURL(file));
                setImagePreviews(previewUrls);

            } catch (error) {
                console.error("Error processing image:", error);
                setError("Houve um problema com uma das imagens. Por favor, tente novamente.");
                // limpando o valor do input de arquivo de forma segura
                try { (e.target as HTMLInputElement).value = ''; } catch (_) { }
            } finally {
                setIsProcessingPhoto(false);
            }
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignmentId || imageFiles.length === 0) {
            setError("Por favor, selecione pelo menos uma imagem.");
            return;
        }
        
        setIsSubmitting(true);
        setError(null);
        setUploadProgress(0);

        try {
            await submitProof(assignmentId, imageFiles, (progress) => {
                setUploadProgress(progress);
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message);
            setUploadProgress(0);
        } finally {
            setIsSubmitting(false);
        }
    };

    const getButtonText = () => {
        if (isSubmitting) return `Enviando... ${uploadProgress}%`;
        if (isProcessingPhoto) return 'Processando Imagens...';
        return 'Enviar Comprovação';
    };

    if (isLoading) {
        return <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    }
    
    if (error && !assignment) {
        return <div className="text-red-400 text-center py-10">{error}</div>;
    }

    if (!assignment) {
         return <div className="text-center py-10">Tarefa não encontrada.</div>;
    }
    
    if (success) {
        return (
            <div className="max-w-2xl mx-auto text-center">
                <div className="bg-secondary shadow-2xl rounded-lg p-8">
                    <h1 className="text-2xl font-bold text-green-400 mb-4">Comprovação Enviada!</h1>
                    <p className="text-gray-300 mb-6">Sua comprovação para o post do evento <strong>{assignment.post.campaignName}</strong> foi enviada com sucesso. Obrigado!</p>
                    <button onClick={() => navigate('/posts')} className="mt-6 px-6 py-2 bg-primary text-white rounded-md">Voltar para Minhas Publicações</button>
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
                <p className="text-center text-primary font-semibold mb-6">{assignment.post.campaignName}</p>
                
                <div className="bg-dark/70 p-4 rounded-lg mb-6">
                    {(assignment.post.type === 'image' || assignment.post.type === 'video') && assignment.post.mediaUrl && (
                        <div className="w-full max-w-sm mx-auto rounded-md mb-4">
                           <StorageMedia path={assignment.post.mediaUrl} type={assignment.post.type} className="w-full max-w-sm mx-auto rounded-md mb-4" />
                        </div>
                    )}
                     <h4 className="font-semibold text-gray-200">Instruções Originais:</h4>
                     <p className="text-gray-400 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p>
                </div>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    {error && <div className="text-red-400 text-sm p-3 bg-red-900/30 rounded-md">{error}</div>}
                    <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Prints da postagem (máximo 2)</label>
                        <div className="mt-2 flex items-center gap-4">
                            <label htmlFor="photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-200 hover:bg-gray-600">
                               <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                                <span>{imagePreviews.length > 0 ? 'Trocar prints' : 'Enviar prints'}</span>
                                <input id="photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple />
                            </label>
                            <div className="flex-grow flex items-center gap-3">
                                {isProcessingPhoto ? (
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                ) : imagePreviews.length > 0 ? (
                                    imagePreviews.map((preview, index) => (
                                       <img key={index} className="h-20 w-20 rounded-lg object-cover" src={preview} alt={`Prévia ${index + 1}`} />
                                    ))
                                ) : (
                                    <p className="text-sm text-gray-400">Nenhum print selecionado.</p>
                                )}
                            </div>
                        </div>
                    </div>
                     
                    {isSubmitting && (
                        <div className="my-4">
                            <div className="w-full bg-gray-600 rounded-full h-2.5">
                                <div 
                                    className="bg-primary h-2.5 rounded-full transition-all duration-300" 
                                    style={{ width: `${uploadProgress}%` }}
                                ></div>
                            </div>
                            <p className="text-center text-sm text-gray-300 mt-1">{uploadProgress}%</p>
                        </div>
                    )}

                     <button
                        type="submit"
                        disabled={isSubmitting || isProcessingPhoto || imageFiles.length === 0}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50"
                    >
                        {getButtonText()}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ProofUploadPage;
