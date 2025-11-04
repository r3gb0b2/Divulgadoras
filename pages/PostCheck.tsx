import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment, Promoter, ScheduledPost, Timestamp } from '../types';
import { ArrowLeftIcon, CameraIcon, DownloadIcon, ClockIcon, ExternalLinkIcon } from '../components/Icons';
import PromoterPublicStatsModal from '../components/PromoterPostStatsModal';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';

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

// Helper to safely convert various date formats to a Date object
const toDateSafe = (timestamp: any): Date | null => {
    if (!timestamp) {
        return null;
    }
    // Firestore Timestamp
    if (typeof timestamp.toDate === 'function') {
        return timestamp.toDate();
    }
    // Serialized Timestamp object
    if (typeof timestamp === 'object' && timestamp.seconds !== undefined) {
        return new Date(timestamp.seconds * 1000);
    }
    // ISO string or number (milliseconds)
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) {
        return date;
    }
    return null;
};

// Helper to extract Google Drive file ID from various URL formats
const extractGoogleDriveId = (url: string): string | null => {
    let id = null;
    const patterns = [
        /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
        /drive\.google\.com\/uc\?id=([a-zA-Z0-9_-]+)/
    ];
    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match && match[1]) {
            id = match[1];
            break;
        }
    }
    return id;
};

const CountdownTimer: React.FC<{ targetDate: any, onEnd?: () => void }> = ({ targetDate, onEnd }) => {
    const [timeLeft, setTimeLeft] = useState('');
    const [isExpired, setIsExpired] = useState(false);

    useEffect(() => {
        const target = toDateSafe(targetDate);
        if (!target) return;

        const updateTimer = () => {
            const now = new Date();
            const difference = target.getTime() - now.getTime();

            if (difference > 0) {
                const days = Math.floor(difference / (1000 * 60 * 60 * 24));
                const hours = Math.floor((difference / (1000 * 60 * 60)) % 24);
                const minutes = Math.floor((difference / 1000 / 60) % 60);
                const seconds = Math.floor((difference / 1000) % 60);
                
                let timeString = '';
                if (days > 0) timeString += `${days}d `;
                timeString += `${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}s`;

                setTimeLeft(timeString);
                setIsExpired(false);
            } else {
                setTimeLeft('Liberado!');
                setIsExpired(true);
                if (onEnd) onEnd();
            }
        };

        updateTimer(); // Initial call
        const timer = setInterval(updateTimer, 1000);

        return () => clearInterval(timer);
    }, [targetDate, onEnd]);

    if (!timeLeft) return null;

    return (
        <div className={`flex items-center gap-1.5 text-xs font-semibold rounded-full px-2 py-1 ${isExpired ? 'bg-green-900/50 text-green-300' : 'bg-blue-900/50 text-blue-300'}`}>
            <ClockIcon className="h-4 w-4" />
            <span>{timeLeft}</span>
        </div>
    );
};

const ProofSection: React.FC<{
    assignment: PostAssignment,
    onJustify: (assignment: PostAssignment) => void
}> = ({ assignment, onJustify }) => {
    const navigate = useNavigate();
    const [timeLeft, setTimeLeft] = useState('');
    const [isButtonEnabled, setIsButtonEnabled] = useState(false);

    useEffect(() => {
        if (!assignment.confirmedAt) return;

        const confirmationTime = toDateSafe(assignment.confirmedAt);
        if (!confirmationTime) return;
        
        const expireTime = new Date(confirmationTime.getTime() + 24 * 60 * 60 * 1000); // 24 hours

        const timer = setInterval(() => {
            const now = new Date();

            if (now > expireTime) {
                if (assignment.post.allowLateSubmissions) {
                    setTimeLeft('Envio fora do prazo liberado pelo organizador.');
                    setIsButtonEnabled(true);
                } else {
                    setTimeLeft('Tempo esgotado');
                    setIsButtonEnabled(false);
                }
                clearInterval(timer);
                return;
            }
            
            if (assignment.post.allowImmediateProof) {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                setTimeLeft(`Envio liberado! Expira em: ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`);
                setIsButtonEnabled(true);
                return; 
            }

            const enableTime = new Date(confirmationTime.getTime() + 6 * 60 * 60 * 1000); // 6 hours
            if (now < enableTime) {
                const diff = enableTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`liberação para envio de print em ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                setIsButtonEnabled(false);
            } else {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);
                setTimeLeft(`Expira em: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
                setIsButtonEnabled(true);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [assignment.confirmedAt, assignment.post.allowLateSubmissions, assignment.post.allowImmediateProof]);

    if (assignment.proofImageUrls && assignment.proofImageUrls.length > 0) {
        return (
            <div className="mt-4 text-center">
                <p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>
                <div className="flex justify-center gap-2">
                    {assignment.proofImageUrls.map((url, index) => (
                        <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                            <img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" />
                        </a>
                    ))}
                </div>
            </div>
        );
    }
    
    if (assignment.justification) {
        return (
            <div className="mt-4 text-center">
                <p className={`text-sm font-semibold mb-2 ${
                    assignment.justificationStatus === 'accepted' ? 'text-green-400' :
                    assignment.justificationStatus === 'rejected' ? 'text-red-400' :
                    'text-yellow-400'
                }`}>
                    {
                        assignment.justificationStatus === 'accepted' ? 'Justificativa Aceita' :
                        assignment.justificationStatus === 'rejected' ? 'Justificativa Rejeitada' :
                        'Justificativa em Análise'
                    }
                </p>
                <p className="text-xs text-gray-400 italic">"{assignment.justification}"</p>
                {assignment.justificationResponse && (
                    <div className="mt-2 text-xs p-2 bg-dark rounded-md text-left">
                        <p className="font-semibold text-primary">Resposta do organizador:</p>
                        <p className="text-gray-300">{assignment.justificationResponse}</p>
                    </div>
                )}
            </div>
        );
    }
    
    const isExpired = timeLeft === 'Tempo esgotado';

    return (
        <div className="mt-4 text-center">
            {isExpired ? (
                <button
                    onClick={() => onJustify(assignment)}
                    className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                >
                    Justificar Ausência
                </button>
            ) : (
                <button
                    onClick={() => navigate(`/proof/${assignment.id}`)}
                    disabled={!isButtonEnabled}
                    className="w-full sm:w-auto px-6 py-3 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Comprovação de Postagem
                </button>
            )}
            <p className={`text-xs mt-2 ${isExpired ? 'text-red-400' : 'text-gray-400'}`}>{timeLeft}</p>
        </div>
    );
};

const PostCard: React.FC<{ 
    assignment: PostAssignment & { promoterHasJoinedGroup: boolean }, 
    onConfirm: (assignmentId: string) => void,
    onJustify: (assignment: PostAssignment) => void
}> = ({ assignment, onConfirm, onJustify }) => {
    const [isConfirming, setIsConfirming] = useState(false);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isMediaProcessing, setIsMediaProcessing] = useState(false);
    
    if (!assignment.promoterHasJoinedGroup) {
        return (
            <div className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-yellow-500">
                <h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>
                {assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}
                <p className="mt-2 text-yellow-300">
                    Você tem uma nova publicação para este evento!
                </p>
                <p className="mt-2 text-gray-300 text-sm">
                    Para visualizar, primeiro você precisa confirmar a leitura das regras e entrar no grupo do WhatsApp.
                </p>
                <div className="mt-4 text-center">
                    <Link 
                        to={`/status?email=${encodeURIComponent(assignment.promoterEmail)}`}
                        className="inline-block w-full sm:w-auto text-center bg-primary text-white font-bold py-2 px-4 rounded hover:bg-primary-dark transition-colors"
                    >
                        Verificar Status e Aceitar Regras
                    </Link>
                </div>
            </div>
        );
    }

    const handleConfirm = async () => {
        setIsConfirming(true);
        try {
            await onConfirm(assignment.id);
        } finally {
            setIsConfirming(false);
        }
    };

    const handleCopyLink = () => {
        if (!assignment.post.postLink) return;
        navigator.clipboard.writeText(assignment.post.postLink).then(() => {
            setLinkCopied(true);
            setTimeout(() => setLinkCopied(false), 2000); // Reset after 2 seconds
        }).catch(err => {
            console.error('Failed to copy link: ', err);
            alert('Falha ao copiar link.');
        });
    };
    
    const now = new Date();
    const isExpired = assignment.post.expiresAt && toDateSafe(assignment.post.expiresAt)! < now;
    const isPostActionable = assignment.post.isActive && !isExpired;
    
    const handleFirebaseDownload = async () => {
        if (!isPostActionable || isMediaProcessing || !assignment.post.mediaUrl) return;

        setIsMediaProcessing(true);
        try {
            const path = assignment.post.mediaUrl;
            let finalUrl = path;
            
            if (!path.startsWith('http')) {
                const storageRef = storage.ref(path);
                finalUrl = await storageRef.getDownloadURL();
            }

            const link = document.createElement('a');
            link.href = finalUrl;

            const filename = finalUrl.split('/').pop()?.split('#')[0].split('?')[0] || 'download';
            link.setAttribute('download', filename);
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');

            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error: any) {
            console.error("Failed to download media:", error);
            alert(`Não foi possível baixar a mídia: ${error.message}`);
        } finally {
            setIsMediaProcessing(false);
        }
    };
    
    const handleGoogleDriveDownload = () => {
        if (!isPostActionable || !assignment.post.googleDriveUrl) return;

        const { googleDriveUrl, type } = assignment.post;
        let urlToOpen = googleDriveUrl;

        if (type === 'video') {
            const fileId = extractGoogleDriveId(googleDriveUrl);
            if (fileId) {
                urlToOpen = `https://drive.google.com/uc?export=download&id=${fileId}`;
            }
        }
        window.open(urlToOpen, '_blank');
    };

    return (
        <div className={`p-4 rounded-lg shadow-sm ${isPostActionable ? 'bg-dark/70' : 'bg-gray-800/50'}`}>
            <h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>
            {assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}
            
            <div className="text-xs text-gray-400 mt-1">
                {isPostActionable ? `Expira em: ${assignment.post.expiresAt ? toDateSafe(assignment.post.expiresAt)?.toLocaleDateString('pt-BR') : 'Sem data'}` : (isExpired ? 'Expirado' : 'Inativo')}
            </div>

            <div className="my-4">
                {(assignment.post.type === 'image' || assignment.post.type === 'video') && (assignment.post.mediaUrl || assignment.post.googleDriveUrl) && (
                    <div className="mb-4">
                        <StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type} className="w-full max-w-sm mx-auto rounded-md" controls={assignment.post.type === 'video'} />
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">
                            {assignment.post.mediaUrl && (
                                <button type="button" onClick={handleFirebaseDownload} disabled={isMediaProcessing} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold disabled:opacity-50 hover:bg-gray-500" title="Baixar do nosso servidor (Firebase)">
                                    <DownloadIcon className="w-4 h-4" /> <span>Download Link 1</span>
                                </button>
                            )}
                            {assignment.post.googleDriveUrl && (
                                <button type="button" onClick={handleGoogleDriveDownload} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-500" title="Baixar do Google Drive">
                                    <DownloadIcon className="w-4 h-4" /> <span>Download Link 2</span>
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {assignment.post.type === 'text' && <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm bg-gray-800 p-3 rounded-md mb-4">{assignment.post.textContent}</pre>}
                
                <h4 className="font-semibold text-gray-200">Instruções:</h4>
                <p className="text-gray-400 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p>

                {assignment.post.postLink && (
                    <div className="mt-4 flex items-center gap-2">
                        <a href={assignment.post.postLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm font-semibold truncate flex-1">
                            <ExternalLinkIcon className="w-4 h-4 inline mr-1" />
                            {assignment.post.postLink}
                        </a>
                        <button onClick={handleCopyLink} className="text-xs px-2 py-1 bg-gray-600 rounded-md hover:bg-gray-500">
                            {linkCopied ? 'Copiado!' : 'Copiar'}
                        </button>
                    </div>
                )}
            </div>

            {isPostActionable ? (
                assignment.status === 'pending' ? (
                    <div className="text-center">
                        <button onClick={handleConfirm} disabled={isConfirming} className="w-full sm:w-auto px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors">
                            {isConfirming ? 'Confirmando...' : 'Confirmar Leitura e Postar'}
                        </button>
                    </div>
                ) : (
                    <ProofSection assignment={assignment} onJustify={onJustify} />
                )
            ) : (
                <div className="text-center">
                    {assignment.proofSubmittedAt || assignment.justification ? (
                        <p className="text-sm font-semibold text-gray-400">
                            {isExpired ? 'Esta publicação expirou.' : 'Esta publicação foi desativada.'}
                        </p>
                    ) : (
                        <>
                            <p className="text-sm font-semibold text-red-400 mb-3">
                                {isExpired ? 'Esta publicação expirou.' : 'Esta publicação não está mais ativa.'}
                            </p>
                            <button
                                onClick={() => onJustify(assignment)}
                                className="w-full sm:w-auto px-6 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                            >
                                Justificar Ausência
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    );
};

const JustificationModal: React.FC<{
    assignment: PostAssignment | null;
    onClose: () => void;
    onSubmit: (assignmentId: string, justification: string, imageFiles: File[]) => Promise<void>;
}> = ({ assignment, onClose, onSubmit }) => {
    const [justification, setJustification] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    if (!assignment) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const fileList = Array.from(files).slice(0, 2);
            setImageFiles(fileList);
            const previewUrls = fileList.map(file => URL.createObjectURL(file as Blob));
            setImagePreviews(previewUrls);
        }
    };

    const handleSubmit = async () => {
        if (!justification.trim()) {
            setError("Por favor, escreva o motivo da sua ausência.");
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await onSubmit(assignment.id, justification, imageFiles);
            onClose();
        } catch (err: any) {
            setError(err.message || "Falha ao enviar justificativa.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white mb-4">Justificar Ausência</h2>
                <p className="text-sm text-gray-400 mb-4">Explique por que você não pôde realizar a postagem para o evento <span className="font-semibold text-primary">{assignment.post.campaignName}</span>.</p>
                {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
                <textarea
                    value={justification}
                    onChange={e => setJustification(e.target.value)}
                    rows={5}
                    placeholder="Digite sua justificativa aqui..."
                    className="w-full p-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"
                />
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Anexar print (opcional, máx 2)</label>
                    <div className="mt-2 flex items-center gap-4">
                        <label htmlFor="justification-photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md text-sm text-gray-200 hover:bg-gray-600">
                           <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                            <span>{imagePreviews.length > 0 ? 'Trocar prints' : 'Anexar prints'}</span>
                            <input id="justification-photo-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple />
                        </label>
                        <div className="flex-grow flex items-center gap-3">
                            {imagePreviews.map((p, i) => <img key={i} className="h-16 w-16 rounded-lg object-cover" src={p} alt={`Prévia ${i + 1}`} />)}
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">
                        {isSubmitting ? 'Enviando...' : 'Enviar Justificativa'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const PostCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[] | null>(null);
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    
    // Modals
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [isJustifyModalOpen, setIsJustifyModalOpen] = useState(false);
    const [justifyingAssignment, setJustifyingAssignment] = useState<PostAssignment | null>(null);
    
    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setAssignments(null);
        setPromoter(null);
        setSearched(true);
        try {
            const [promoterProfiles, assignmentData, scheduledData] = await Promise.all([
                findPromotersByEmail(searchEmail),
                getAssignmentsForPromoterByEmail(searchEmail),
                getScheduledPostsForPromoter(searchEmail),
            ]);

            if (promoterProfiles.length === 0 && assignmentData.length === 0) {
                setError("Nenhum cadastro ou publicação encontrada para este e-mail.");
                return;
            }
            
            setPromoter(promoterProfiles[0] || null); // Use the most recent profile
            setScheduledPosts(scheduledData);

            const promoterGroups = new Map(promoterProfiles.map(p => [p.campaignName, p.hasJoinedGroup]));
            
            const assignmentsWithGroupStatus = assignmentData.map(a => ({
                ...a,
                promoterHasJoinedGroup: promoterGroups.get(a.post.campaignName) || false
            }));
            
            setAssignments(assignmentsWithGroupStatus);

        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        if (emailFromQuery) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        }
    }, [location.search, performSearch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        navigate(`/posts?email=${encodeURIComponent(email)}`);
    };
    
    const handleConfirm = async (assignmentId: string) => {
        await confirmAssignment(assignmentId);
        await performSearch(email);
    };

    const handleOpenJustifyModal = (assignment: PostAssignment) => {
        setJustifyingAssignment(assignment);
        setIsJustifyModalOpen(true);
    };
    
    const handleJustificationSubmit = async (assignmentId: string, justification: string, imageFiles: File[]) => {
        await submitJustification(assignmentId, justification, imageFiles, () => {});
        await performSearch(email);
    };

    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Minhas Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Digite seu e-mail para ver suas tarefas de postagem.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Seu e-mail de cadastro" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                    <button type="submit" disabled={isLoading} className="w-full py-3 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">{isLoading ? 'Buscando...' : 'Buscar'}</button>
                </form>

                {promoter && (
                    <div className="mt-6 text-center">
                        <button onClick={() => setIsStatsModalOpen(true)} className="text-primary hover:underline">Ver minhas estatísticas</button>
                    </div>
                )}
                
                <div className="mt-8 space-y-6">
                    {isLoading && <div className="text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div></div>}
                    {error && <p className="text-red-400 text-center">{error}</p>}
                    
                    {searched && !isLoading && !error && (
                        <>
                            {assignments?.length === 0 && scheduledPosts.length === 0 && <p className="text-gray-400 text-center">Nenhuma publicação encontrada para você no momento.</p>}
                            
                            {assignments?.map(a => <PostCard key={a.id} assignment={a} onConfirm={handleConfirm} onJustify={handleOpenJustifyModal} />)}

                            {scheduledPosts.length > 0 && (
                                 <div className="border-t border-gray-700 pt-6">
                                     <h2 className="text-xl font-bold text-center text-white mb-4">Publicações Agendadas</h2>
                                     <div className="space-y-4">
                                         {scheduledPosts.map(sp => (
                                             <div key={sp.id} className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
                                                <h3 className="font-bold text-lg text-primary">{sp.postData.campaignName}</h3>
                                                {sp.postData.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{sp.postData.eventName}</p>}
                                                <div className="mt-2">
                                                    <CountdownTimer targetDate={sp.scheduledAt} />
                                                </div>
                                             </div>
                                         ))}
                                     </div>
                                 </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
            <JustificationModal assignment={justifyingAssignment} onClose={() => setIsJustifyModalOpen(false)} onSubmit={handleJustificationSubmit} />
        </div>
    );
};

export default PostCheck;
