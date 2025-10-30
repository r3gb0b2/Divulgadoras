import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getOneTimePostById, submitOneTimePostSubmission } from '../services/postService';
import { OneTimePost } from '../types';
import { storage } from '../firebase/config';
import { ArrowLeftIcon, CameraIcon, DownloadIcon } from '../components/Icons';
import StorageMedia from '../components/StorageMedia';

type PageStep = 'view_post' | 'submit_name' | 'complete';

const OneTimePostPage: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
    const navigate = useNavigate();

    const [post, setPost] = useState<OneTimePost | null>(null);
    const [step, setStep] = useState<PageStep>('view_post');
    
    // Step 1 state
    const [proofFiles, setProofFiles] = useState<File[]>([]);
    const [proofPreviews, setProofPreviews] = useState<string[]>([]);
    const [isUploading, setIsUploading] = useState(false);

    // Step 2 state
    const [uploadedProofUrls, setUploadedProofUrls] = useState<string[]>([]);
    const [guestName, setGuestName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // General state
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!postId) {
            setError("Link inválido ou post não encontrado.");
            setIsLoading(false);
            return;
        }
        const fetchPost = async () => {
            try {
                const data = await getOneTimePostById(postId);
                if (!data || !data.isActive) {
                    throw new Error("Este post não está mais ativo ou não foi encontrado.");
                }
                setPost(data);
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchPost();
    }, [postId]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const fileList = Array.from(files).slice(0, 2);
            setProofFiles(fileList);
            const previewUrls = fileList.map(file => URL.createObjectURL(file as Blob));
            setProofPreviews(previewUrls);
        }
    };

    const handleProofUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (proofFiles.length === 0) {
            setError("Por favor, selecione pelo menos uma imagem de comprovação.");
            return;
        }
        
        setIsUploading(true);
        setError(null);

        try {
            const urls = await Promise.all(
                proofFiles.map(async (file) => {
                    const fileName = `one-time-proofs/${postId}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
                    const storageRef = storage.ref(fileName);
                    await storageRef.put(file);
                    return await storageRef.getDownloadURL();
                })
            );
            setUploadedProofUrls(urls);
            setStep('submit_name');
        } catch (err) {
            setError("Falha ao enviar as imagens. Tente novamente.");
        } finally {
            setIsUploading(false);
        }
    };

    const handleNameSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!guestName.trim() || !post) {
            setError("Por favor, insira seu nome completo.");
            return;
        }
        
        setIsSubmitting(true);
        setError(null);
        
        try {
            await submitOneTimePostSubmission({
                oneTimePostId: post.id,
                organizationId: post.organizationId,
                campaignId: post.campaignId,
                guestName: guestName.trim(),
                proofImageUrls: uploadedProofUrls,
            });
            setStep('complete');
        } catch (err: any) {
            setError(err.message || "Falha ao enviar seu nome. Tente novamente.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="text-center py-10"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div></div>;
    }

    if (error && !post) {
        return <div className="text-red-400 text-center py-10 bg-secondary p-6 rounded-lg">{error}</div>;
    }

    if (!post) {
        return <div className="text-center py-10">Post não encontrado.</div>;
    }

    const renderStep = () => {
        switch (step) {
            case 'view_post':
                return (
                    <>
                        <div className="bg-dark/70 p-4 rounded-lg mb-6">
                            {(post.type === 'image' || post.type === 'video') && (post.mediaUrl || post.googleDriveUrl) && (
                                <div className="mb-4">
                                    <StorageMedia path={post.mediaUrl || post.googleDriveUrl || ''} type={post.type} className="w-full max-w-sm mx-auto rounded-md" controls={post.type === 'video'} />
                                    <div className="flex justify-center mt-4">
                                        <a href={post.mediaUrl || post.googleDriveUrl || '#'} download target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold hover:bg-gray-500">
                                            <DownloadIcon className="w-4 h-4" /> Baixar Mídia
                                        </a>
                                    </div>
                                </div>
                            )}
                            {post.type === 'text' && <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm bg-gray-800 p-3 rounded-md mb-4">{post.textContent}</pre>}
                            
                            <h4 className="font-semibold text-gray-200">Instruções:</h4>
                            <p className="text-gray-400 text-sm whitespace-pre-wrap">{post.instructions}</p>
                        </div>
                        
                        <form onSubmit={handleProofUpload} className="space-y-6">
                            <h3 className="text-xl font-bold text-center">Envie sua Comprovação</h3>
                            {error && <p className="text-red-400 text-sm p-3 bg-red-900/30 rounded-md">{error}</p>}
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-2">Prints da postagem (máximo 2)</label>
                                <div className="mt-2 flex items-center gap-4">
                                    <label htmlFor="photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md text-sm text-gray-200 hover:bg-gray-600">
                                       <CameraIcon className="w-5 h-5 mr-2 inline-block" /> <span>{proofPreviews.length > 0 ? 'Trocar' : 'Enviar'} prints</span>
                                        <input id="photo-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple />
                                    </label>
                                    <div className="flex-grow flex items-center gap-3">
                                        {proofPreviews.map((p, i) => <img key={i} className="h-20 w-20 rounded-lg object-cover" src={p} alt={`Prévia ${i + 1}`} />)}
                                    </div>
                                </div>
                            </div>
                             <button type="submit" disabled={isUploading || proofFiles.length === 0} className="w-full py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                                {isUploading ? 'Enviando...' : 'Continuar'}
                            </button>
                        </form>
                    </>
                );
            case 'submit_name':
                 return (
                    <form onSubmit={handleNameSubmit} className="space-y-6">
                        <h3 className="text-xl font-bold text-center">Ótimo! Agora, seu nome para a lista:</h3>
                        {error && <p className="text-red-400 text-sm p-3 bg-red-900/30 rounded-md">{error}</p>}
                        <div>
                             <p className="text-sm text-gray-400 mb-2">Comprovação enviada:</p>
                             <div className="flex gap-2">{uploadedProofUrls.map((url, i) => <img key={i} src={url} className="h-16 w-16 rounded-lg object-cover" alt={`Comprovação ${i+1}`} />)}</div>
                        </div>
                        <input type="text" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Seu nome completo" required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                        <button type="submit" disabled={isSubmitting} className="w-full py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                            {isSubmitting ? 'Finalizando...' : 'Entrar na Lista'}
                        </button>
                    </form>
                );
            case 'complete':
                return (
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-green-400 mb-4">Tudo Certo!</h1>
                        <p className="text-gray-300 mb-6">Sua comprovação foi enviada com sucesso e seu nome, <strong className="text-primary">{guestName}</strong>, foi adicionado à lista <strong>{post.guestListName}</strong>.</p>
                        <button onClick={() => navigate('/')} className="mt-6 px-6 py-2 bg-primary text-white rounded-md">Voltar à Página Inicial</button>
                    </div>
                );
        }
    };

    return (
        <div className="max-w-2xl mx-auto">
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">{post.campaignName}</h1>
                {post.eventName && <p className="text-center text-primary font-semibold mb-6">{post.eventName}</p>}
                
                {renderStep()}
            </div>
        </div>
    );
};

export default OneTimePostPage;