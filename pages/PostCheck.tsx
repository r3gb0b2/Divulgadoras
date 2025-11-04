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

            // 1. Check for final expiration (applies to all cases)
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
            
            // 2. Check if immediate proof is allowed
            if (assignment.post.allowImmediateProof) {
                const diff = expireTime.getTime() - now.getTime();
                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                setTimeLeft(`Envio liberado! Expira em: ${hours.toString().padStart(2, '0')}h ${minutes.toString().padStart(2, '0')}m`);
                setIsButtonEnabled(true);
                return; // Keep timer running to update countdown
            }

            // 3. Fallback to default 6-hour wait logic
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
    const isExpired = assignment.post.expiresAt && toDateSafe(assignment.post.expiresAt) < now;
    const isPostActionable = assignment.post.isActive && !isExpired;
    
    const handleFirebaseDownload = async () => {
        if (isMediaProcessing || !assignment.post.mediaUrl) return;

        setIsMediaProcessing(true);
        try {
            const path = assignment.post.mediaUrl;
            let finalUrl = path;

            // If it's not a full URL, assume it's a Firebase Storage path
            if (!path.startsWith('http')) {
                const storageRef = storage.ref(path);
                finalUrl = await storageRef.getDownloadURL();
            }
            
            // Create a temporary link to trigger download
            const link = document.createElement('a');
            link.href = finalUrl;
            
            // Extract filename from URL
            const filename = finalUrl.split('/').pop()?.split('#')[0].split('?')[0] || 'download';

            link.setAttribute('download', filename);
            link.setAttribute('target', '_blank'); // Good practice for security and UX
            link.setAttribute('rel', 'noopener noreferrer');
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error: any) {
            console.error('Failed to download from Firebase:', error);
            alert(`Não foi possível baixar a mídia: ${error.message}`);
        } finally {
            setIsMediaProcessing(false);
        }
    };
    
     const handleGoogleDriveDownload = () => {
        const { googleDriveUrl, type } = assignment.post;
        if (!googleDriveUrl) return;

        let urlToOpen = googleDriveUrl;

        // For videos, create a direct download link if possible
        if (type === 'video') {
            const fileId = extractGoogleDriveId(googleDriveUrl);
            if (fileId) {
                // This URL forces a download prompt instead of opening in preview
                urlToOpen = `https://drive.google.com/uc?export=download&id=${fileId}`;
            }
        }
        
        window.open(urlToOpen, '_blank');
    };
    
    // Determine the main status color for the card's border
    const borderColor = !isPostActionable
      ? 'border-gray-600'
      : assignment.status === 'pending'
      ? 'border-blue-500'
      : (assignment.proofSubmittedAt || assignment.justificationStatus === 'accepted')
      ? 'border-green-500'
      : 'border-yellow-500';

    return (
        <div className={`bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 ${borderColor}`}>
            <h3 className="font-bold text-lg text-primary">{assignment.post.campaignName}</h3>
            {assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}
            
            <div className="mt-4 space-y-4">
                {(assignment.post.type === 'image' || assignment.post.type === 'video') && (assignment.post.mediaUrl || assignment.post.googleDriveUrl) && (
                    <div>
                        <StorageMedia path={assignment.post.mediaUrl || assignment.post.googleDriveUrl || ''} type={assignment.post.type} className="w-full max-w-sm mx-auto rounded-md" controls={assignment.post.type === 'video'} />
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 mt-4">
                             {assignment.post.mediaUrl && (
                                <button
                                    onClick={handleFirebaseDownload}
                                    disabled={isMediaProcessing}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md text-sm font-semibold disabled:opacity-50 hover:bg-gray-500"
                                    title="Baixar do nosso servidor (Firebase)"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    <span>Download Link 1</span>
                                </button>
                            )}
                            {assignment.post.googleDriveUrl && (
                                <button
                                    onClick={handleGoogleDriveDownload}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-semibold hover:bg-blue-500"
                                    title="Baixar do Google Drive"
                                >
                                    <DownloadIcon className="w-4 h-4" />
                                    <span>Download Link 2</span>
                                </button>
                            )}
                        </div>
                        {assignment.post.mediaUrl && assignment.post.googleDriveUrl && <p className="text-center text-xs text-gray-400 mt-2">Link 1 é do servidor da plataforma, Link 2 é do Google Drive.</p>}
                    </div>
                )}
                {assignment.post.type === 'text' && (
                    <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm bg-gray-800 p-3 rounded-md">{assignment.post.textContent}</pre>
                )}
                 <div>
                    <h4 className="font-semibold text-gray-200">Instruções:</h4>
                    <p className="text-gray-400 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p>
                </div>
                 {assignment.post.postLink && (
                    <div className="flex items-center gap-2">
                         <a href={assignment.post.postLink} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-sm hover:underline flex items-center gap-1.5 break-all">
                            <ExternalLinkIcon className="w-4 h-4 flex-shrink-0" /> Link da Publicação
                        </a>
                         <button onClick={handleCopyLink} className="text-xs px-2 py-1 bg-gray-600 rounded-md">{linkCopied ? 'Copiado!' : 'Copiar'}</button>
                    </div>
                )}
            </div>

            {/* ACTION BUTTONS SECTION */}
            {(() => {
                const taskIsFinished = !!assignment.proofSubmittedAt || !!assignment.justification;

                if (taskIsFinished) {
                    return (
                        <div className="mt-4">
                            {assignment.proofSubmittedAt ? (
                                <div className="text-center">
                                    <p className="text-sm text-green-400 font-semibold mb-2">Comprovação enviada!</p>
                                    <div className="flex justify-center gap-2">
                                        {assignment.proofImageUrls!.map((url, index) => (
                                            <a key={index} href={url} target="_blank" rel="noopener noreferrer">
                                                <img src={url} alt={`Comprovação ${index + 1}`} className="w-20 h-20 object-cover rounded-md border-2 border-primary" />
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            ) : assignment.justification && (
                                <div className="bg-dark/70 p-3 rounded-md">
                                    <p className="text-sm font-semibold text-yellow-300">Justificativa Enviada:</p>
                                    <p className="text-xs text-gray-300 italic whitespace-pre-wrap mt-1">"{assignment.justification}"</p>
                                    {assignment.justificationStatus && (
                                         <p className="text-xs mt-2">Status: <span className="font-bold">{assignment.justificationStatus === 'accepted' ? 'Aceita' : (assignment.justificationStatus === 'rejected' ? 'Rejeitada' : 'Pendente')}</span></p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                }

                if (!isPostActionable) {
                    return (
                         <div className="mt-4 text-center">
                            <button
                                onClick={() => onJustify(assignment)}
                                className="w-full sm:w-auto px-6 py-3 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                            >
                                Justificar Ausência
                            </button>
                        </div>
                    );
                }
                
                if (assignment.status === 'pending') {
                     return (
                        <div className="mt-4 text-center">
                            <button
                                onClick={handleConfirm}
                                disabled={isConfirming}
                                className="w-full sm:w-auto px-6 py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark transition-colors"
                            >
                                {isConfirming ? 'Confirmando...' : 'Eu Publiquei!'}
                            </button>
                        </div>
                    );
                }

                if (assignment.status === 'confirmed') {
                    return (
                        <ProofSection assignment={assignment} onJustify={onJustify} />
                    );
                }
                
                return null;
            })()}

        </div>
    );
};

const JustificationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    assignment: PostAssignment | null;
}> = ({ isOpen, onClose, assignment }) => {
    const [justification, setJustification] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal closes
            setJustification('');
            setImageFiles([]);
            setImagePreviews([]);
            setIsSubmitting(false);
            setError('');
            setUploadProgress(0);
        }
    }, [isOpen]);

    if (!isOpen || !assignment) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const fileList = Array.from(files).slice(0, 2);
            setImageFiles(fileList);
            const previewUrls = fileList.map(file => URL.createObjectURL(file as Blob));
            setImagePreviews(previewUrls);
        }
    };
    
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!justification.trim()) {
            setError('Por favor, escreva o motivo da sua ausência.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await submitJustification(assignment.id, justification, imageFiles, setUploadProgress);
            onClose(); // Close on success
            window.location.reload(); // Reload to show the updated status
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar justificativa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-xl font-bold text-white mb-4">Justificar Ausência</h2>
                <p className="text-sm text-gray-400 mb-4">Explique por que você não pôde/pode realizar esta postagem. Se tiver algum print que comprove, anexe abaixo.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <textarea
                        value={justification}
                        onChange={(e) => setJustification(e.target.value)}
                        placeholder="Escreva sua justificativa aqui..."
                        rows={5}
                        className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                        required
                    />
                     <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Anexar Prints (opcional, máx. 2)</label>
                        <div className="mt-2 flex items-center gap-4">
                            <label htmlFor="justification-photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md text-sm text-gray-200 hover:bg-gray-600">
                               <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                                <span>{imagePreviews.length > 0 ? 'Trocar' : 'Enviar'}</span>
                                <input id="justification-photo-upload" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple />
                            </label>
                            <div className="flex-grow flex items-center gap-3">
                                {imagePreviews.map((p, i) => <img key={i} className="h-16 w-16 rounded-lg object-cover" src={p} alt={`Preview ${i + 1}`} />)}
                            </div>
                        </div>
                    </div>
                    {isSubmitting && (
                        <div className="my-2">
                            <div className="w-full bg-gray-600 rounded-full h-2"><div className="bg-primary h-2 rounded-full" style={{ width: `${uploadProgress}%` }}></div></div>
                            <p className="text-center text-xs text-gray-300 mt-1">{uploadProgress}%</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-3">
                        <button type="button" onClick={onClose} disabled={isSubmitting} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>
                        <button type="submit" disabled={isSubmitting} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">
                            {isSubmitting ? 'Enviando...' : 'Enviar Justificativa'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const PostCheck: React.FC = () => {
    const location = useLocation();
    const navigate = useNavigate();

    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[]>([]);
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);

    // Modal state
    const [isJustifyModalOpen, setIsJustifyModalOpen] = useState(false);
    const [justifyingAssignment, setJustifyingAssignment] = useState<PostAssignment | null>(null);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setSearched(true);
        try {
            const [promoterProfiles, assignmentData, scheduledData] = await Promise.all([
                findPromotersByEmail(searchEmail),
                getAssignmentsForPromoterByEmail(searchEmail),
                getScheduledPostsForPromoter(searchEmail),
            ]);

            if (!promoterProfiles || promoterProfiles.length === 0) {
                setError("Nenhum cadastro de divulgadora encontrado para este e-mail.");
                return;
            }

            const primaryProfile = promoterProfiles[0];
            setPromoter(primaryProfile);

            // Create a map of promoter's group status per campaign
            const groupStatusMap = new Map<string, boolean>();
            promoterProfiles.forEach(p => {
                if(p.campaignName) {
                    groupStatusMap.set(p.campaignName, p.hasJoinedGroup || false);
                    (p.associatedCampaigns || []).forEach(assoc => {
                        groupStatusMap.set(assoc, p.hasJoinedGroup || false);
                    });
                }
            });
            
            const assignmentsWithStatus = assignmentData.map(a => ({
                ...a,
                promoterHasJoinedGroup: groupStatusMap.get(a.post.campaignName) || false,
            }));

            setAssignments(assignmentsWithStatus);
            setScheduledPosts(scheduledData);

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
    
    const handleConfirmAssignment = async (assignmentId: string) => {
        try {
            await confirmAssignment(assignmentId);
            performSearch(email); // Refresh data
        } catch (err: any) {
            setError(err.message || 'Falha ao confirmar.');
        }
    };
    
    const openJustifyModal = (assignment: PostAssignment) => {
        setJustifyingAssignment(assignment);
        setIsJustifyModalOpen(true);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };

    const renderContent = () => {
        if (!searched) return null;
        if (isLoading) {
            return (
                <div className="flex justify-center items-center h-24">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            );
        }
        if (error) return <p className="text-red-500 mt-4 text-center">{error}</p>;
        
        const hasPendingActions = assignments.some(a => !a.proofSubmittedAt && !a.justification);
        
        return (
             <div className="space-y-6">
                {assignments.length === 0 && scheduledPosts.length === 0 && (
                    <p className="text-center text-gray-400 mt-4">Nenhuma publicação encontrada para você no momento.</p>
                )}
                
                {hasPendingActions && (
                    <div className="bg-blue-900/50 border-l-4 border-blue-500 text-blue-300 p-4 rounded-md">
                        <p className="font-bold">Ação Necessária</p>
                        <p>Você tem publicações pendentes. Por favor, confirme ou justifique sua ausência.</p>
                    </div>
                )}
                
                {scheduledPosts.length > 0 && (
                    <div>
                        <h2 className="text-2xl font-bold text-gray-100 mb-4">Publicações Agendadas</h2>
                        <div className="space-y-4">
                            {scheduledPosts.map(sp => (
                                <div key={sp.id} className="bg-dark/70 p-4 rounded-lg shadow-sm">
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
                
                 {assignments.length > 0 && (
                     <div>
                        <h2 className="text-2xl font-bold text-gray-100 mb-4">Minhas Publicações</h2>
                        <div className="space-y-4">
                            {assignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={handleConfirmAssignment} onJustify={openJustifyModal} />)}
                        </div>
                     </div>
                 )}
            </div>
        );
    };
    
    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Portal de Publicações</h1>
                <p className="text-center text-gray-400 mb-8">Confirme sua participação e envie a comprovação dos posts.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Seu e-mail de cadastro"
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200"
                        required
                    />
                     <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark disabled:bg-primary/50"
                    >
                        {isLoading ? 'Buscando...' : 'Buscar Minhas Publicações'}
                    </button>
                </form>
                
                {promoter && (
                    <div className="mt-6 text-center">
                        <button onClick={() => setIsStatsModalOpen(true)} className="text-sm text-primary hover:underline font-semibold">
                            Ver Minhas Estatísticas
                        </button>
                    </div>
                )}
                
                <div className="mt-8">
                    {renderContent()}
                </div>
            </div>
            
            <JustificationModal isOpen={isJustifyModalOpen} onClose={() => setIsJustifyModalOpen(false)} assignment={justifyingAssignment} />
            <PromoterPublicStatsModal isOpen={isStatsModalOpen} onClose={() => setIsStatsModalOpen(false)} promoter={promoter} />
        </div>
    );
};

export default PostCheck;
