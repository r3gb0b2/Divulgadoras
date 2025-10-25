import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
// FIX: Added 'getScheduledPostsForPromoter' to import.
import { getAssignmentsForPromoterByEmail, confirmAssignment, submitJustification, getScheduledPostsForPromoter } from '../services/postService';
import { findPromotersByEmail } from '../services/promoterService';
import { PostAssignment, Promoter, ScheduledPost } from '../types';
import { ArrowLeftIcon, EyeIcon, CameraIcon, DownloadIcon, ClockIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
import PromoterPublicStatsModal from '../components/PromoterPublicStatsModal';
import StorageMedia from '../components/StorageMedia';
import { storage } from '../firebase/config';
import { ref, getDownloadURL } from 'firebase/storage';

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

    const handleView = async () => {
        if (isMediaProcessing || !assignment.post.mediaUrl) return;
        setIsMediaProcessing(true);
        try {
            const { mediaUrl, type } = assignment.post;
    
            let finalUrl = mediaUrl;
    
            if (type === 'video' && mediaUrl.includes('drive.google.com')) {
                const fileId = extractGoogleDriveId(mediaUrl);
                if (!fileId) throw new Error('ID do arquivo do Google Drive não encontrado no link.');
                finalUrl = `https://drive.google.com/file/d/${fileId}/view`;
            } else if (!mediaUrl.startsWith('http')) { 
                const mediaRef = ref(storage, mediaUrl);
                finalUrl = await getDownloadURL(mediaRef);
            }
    
            window.open(finalUrl, '_blank', 'noopener,noreferrer');
    
        } catch (error: any) {
            console.error('Failed to open media:', error);
            alert(`Não foi possível abrir a mídia: ${error.message}`);
        } finally {
            setIsMediaProcessing(false);
        }
    };
    
    const handleDownload = async () => {
        if (isMediaProcessing || !assignment.post.mediaUrl) return;
        setIsMediaProcessing(true);
        try {
            const { mediaUrl, type } = assignment.post;
            
            if (type === 'video' && mediaUrl.includes('drive.google.com')) {
                const fileId = extractGoogleDriveId(mediaUrl);
                if (!fileId) throw new Error('ID do arquivo do Google Drive não encontrado no link.');
                const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                window.open(downloadUrl, '_blank');
                return;
            }
            
            let finalUrl = mediaUrl;
            if (!mediaUrl.startsWith('http')) {
                const storageRef = ref(storage, mediaUrl);
                finalUrl = await getDownloadURL(storageRef);
            }
            
            // Create a temporary link to trigger the download
            const link = document.createElement('a');
            link.href = finalUrl;
            
            // Add download attribute. For cross-origin, this is a suggestion.
            // The browser may ignore it and use its own filename.
            const filename = finalUrl.split('/').pop()?.split('#')[0].split('?')[0] || 'download';
            link.setAttribute('download', filename);
            
            // To support all browsers and prevent navigation, open in a new tab.
            // This is a reliable fallback if the 'download' attribute is ignored.
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener noreferrer');
            
            // Append to the DOM, click it, and then remove it.
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch (error: any) {
            console.error('Failed to download media:', error);
            alert(`Não foi possível baixar a mídia: ${error.message}`);
        } finally {
            setIsMediaProcessing(false);
        }
    };

    const renderJustificationStatus = (status: 'pending' | 'accepted' | 'rejected' | null | undefined) => {
        const styles = {
            pending: "bg-yellow-900/50 text-yellow-300",
            accepted: "bg-green-900/50 text-green-300",
            rejected: "bg-red-900/50 text-red-300",
        };
        const text = { pending: "Pendente", accepted: "Aceita", rejected: "Rejeitada" };
        if (!status) return <span className="text-gray-400">Pendente</span>;
        return <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${styles[status]}`}>{text[status]}</span>;
    };

    const hasProof = assignment.proofImageUrls && assignment.proofImageUrls.length > 0;
    const hasJustification = !!assignment.justification;

    const renderActions = () => {
        if (hasProof) {
            return <ProofSection assignment={assignment} onJustify={onJustify} />;
        }
        if (hasJustification) {
            return (
                <div className="mt-4 text-center">
                    <p className="text-sm text-yellow-300 font-semibold mb-2">Justificativa Enviada</p>
                    <p className="text-sm italic text-gray-300 bg-gray-800 p-2 rounded-md mb-2">"{assignment.justification}"</p>
                    <div className="text-xs">Status: {renderJustificationStatus(assignment.justificationStatus)}</div>
                </div>
            );
        }
        if (assignment.status === 'pending') {
            return (
                <div className="w-full flex flex-col sm:flex-row gap-2">
                    <button 
                        onClick={() => onJustify(assignment)}
                        className="w-full px-4 py-2 bg-gray-600 text-white font-bold rounded-lg hover:bg-gray-500 transition-colors"
                    >
                        Justificar Ausência
                    </button>
                    <button 
                        onClick={handleConfirm}
                        disabled={isConfirming}
                        className="w-full px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                    >
                        {isConfirming ? 'Confirmando...' : 'Eu Publiquei!'}
                    </button>
                </div>
            );
        }
        if (assignment.status === 'confirmed') {
            return <ProofSection assignment={assignment} onJustify={onJustify} />;
        }
        return null;
    };

    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <p className="font-bold text-lg text-primary">{assignment.post.campaignName}</p>
                    {assignment.post.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{assignment.post.eventName}</p>}
                    {assignment.post.postFormats && assignment.post.postFormats.length > 0 && (
                        <div className="flex gap-2 mt-1">
                            {assignment.post.postFormats.map(format => (
                                <span key={format} className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-600 text-gray-200 capitalize">
                                    {format}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                     {assignment.post.expiresAt && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 font-medium">Tempo restante:</span>
                            <CountdownTimer targetDate={assignment.post.expiresAt} />
                        </div>
                     )}
                     <div className="mt-1">
                        {assignment.status === 'confirmed' ? (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-900/50 text-green-300">Confirmado</span>
                        ) : (
                            <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-900/50 text-yellow-300">Pendente</span>
                        )}
                    </div>
                </div>
            </div>
            
            <div className="border-t border-gray-700 pt-3">
                {(assignment.post.type === 'image' || assignment.post.type === 'video') && assignment.post.mediaUrl && (
                     <div className="mb-4">
                        <StorageMedia path={assignment.post.mediaUrl} type={assignment.post.type === 'text' ? 'image' : assignment.post.type} controls={assignment.post.type === 'video'} className="w-full max-w-sm mx-auto rounded-md" />
                        <div className="flex justify-center items-center gap-4 mt-2">
                            <button
                                onClick={handleView}
                                disabled={isMediaProcessing}
                                className="text-sm text-blue-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                                <EyeIcon className="w-4 h-4" /> 
                                {isMediaProcessing ? '...' : 'Visualizar'}
                            </button>
                             <button
                                onClick={handleDownload}
                                disabled={isMediaProcessing}
                                className="text-sm text-green-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                            >
                                <DownloadIcon className="w-4 h-4" />
                                {isMediaProcessing ? '...' : 'Baixar'}
                            </button>
                        </div>
                    </div>
                )}
                {assignment.post.type === 'text' && (
                    <div className="bg-gray-800 p-3 rounded-md mb-4">
                        <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{assignment.post.textContent}</pre>
                    </div>
                )}

                <div className="space-y-2">
                    <h4 className="font-semibold text-gray-200">Instruções:</h4>
                    <div className="bg-gray-800/50 p-3 rounded-md">
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">{assignment.post.instructions}</p>
                    </div>
                </div>

                {assignment.post.postLink && (
                    <div className="space-y-2 mt-4">
                        <h4 className="font-semibold text-gray-200">Link para Postagem:</h4>
                        <div className="bg-gray-800/50 p-3 rounded-md">
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    readOnly
                                    value={assignment.post.postLink}
                                    className="flex-grow w-full px-3 py-1.5 border border-gray-600 rounded-md bg-gray-900 text-gray-400 text-sm"
                                />
                                <button
                                    onClick={handleCopyLink}
                                    className="flex-shrink-0 px-3 py-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm font-semibold w-24"
                                >
                                    {linkCopied ? 'Copiado!' : 'Copiar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-4 border-t border-gray-700 pt-4 text-center">
                    {renderActions()}
                </div>
            </div>
        </div>
    );
}

const ScheduledPostCard: React.FC<{ post: ScheduledPost }> = ({ post }) => {
    return (
        <div className="bg-dark/70 p-4 rounded-lg shadow-sm border-l-4 border-blue-500">
            <div className="flex justify-between items-start mb-3">
                <div>
                    <p className="font-bold text-lg text-primary">{post.postData.campaignName}</p>
                    {post.postData.eventName && <p className="text-md text-gray-200 font-semibold -mt-1">{post.postData.eventName}</p>}
                </div>
                <CountdownTimer targetDate={post.scheduledAt} />
            </div>
            <div className="border-t border-gray-700 pt-3">
                {post.postData.type === 'image' && post.postData.mediaUrl && (
                    <StorageMedia path={post.postData.mediaUrl} type="image" className="w-full max-w-sm mx-auto rounded-md mb-4" />
                )}
                 {post.postData.type === 'video' && post.postData.mediaUrl && (
                    <p className="text-center text-sm text-gray-300 my-4">[Prévia de vídeo indisponível para posts agendados]</p>
                )}
                 {post.postData.type === 'text' && (
                    <div className="bg-gray-800 p-3 rounded-md mb-4">
                        <pre className="text-gray-300 whitespace-pre-wrap font-sans text-sm">{post.postData.textContent}</pre>
                    </div>
                )}
                <div>
                    <h4 className="font-semibold text-gray-200">Instruções:</h4>
                    <div className="bg-gray-800/50 p-3 rounded-md">
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">{post.postData.instructions}</p>
                    </div>
                </div>
            </div>
        </div>
    );
};


const JustificationModal: React.FC<{
    isOpen: boolean,
    onClose: () => void,
    onSubmit: (assignmentId: string, text: string, imageFiles: File[]) => Promise<void>,
    assignment: PostAssignment | null
}> = ({ isOpen, onClose, onSubmit, assignment }) => {
    const [text, setText] = useState('');
    const [imageFiles, setImageFiles] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setText('');
            setIsSubmitting(false);
            setImageFiles([]);
            setImagePreviews([]);
        }
    }, [isOpen]);

    if (!isOpen || !assignment) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const fileList = Array.from(files).slice(0, 2); // Max 2 files
            setImageFiles(fileList);
            const previewUrls = fileList.map(file => URL.createObjectURL(file as Blob));
            setImagePreviews(previewUrls);
        }
    };

    const handleSubmit = async () => {
        if (!text.trim()) return;
        setIsSubmitting(true);
        await onSubmit(assignment.id, text, imageFiles);
        setIsSubmitting(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">Justificar Ausência</h2>
                <p className="text-gray-400 mb-4">Explique o motivo pelo qual você não conseguiu realizar esta postagem. Sua justificativa será enviada para análise.</p>
                <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={4}
                    placeholder="Ex: Tive um imprevisto pessoal..."
                    className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-800 text-gray-200"
                />
                <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-300 mb-2">Anexar imagens (opcional, máximo 2)</label>
                    <div className="mt-2 flex items-center gap-4">
                        <label htmlFor="justification-photo-upload" className="flex-shrink-0 cursor-pointer bg-gray-700 py-2 px-3 border border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-200 hover:bg-gray-600">
                            <CameraIcon className="w-5 h-5 mr-2 inline-block" />
                            <span>{imagePreviews.length > 0 ? 'Trocar imagens' : 'Enviar imagens'}</span>
                            <input id="justification-photo-upload" name="photo" type="file" className="sr-only" onChange={handleFileChange} accept="image/*" multiple />
                        </label>
                        <div className="flex-grow flex items-center gap-3">
                            {imagePreviews.length > 0 ? (
                                imagePreviews.map((preview, index) => (
                                    <img key={index} className="h-16 w-16 rounded-lg object-cover" src={preview} alt={`Prévia ${index + 1}`} />
                                ))
                            ) : (
                                <p className="text-sm text-gray-400">Nenhuma imagem selecionada.</p>
                            )}
                        </div>
                    </div>
                </div>

                <div className="mt-6 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSubmitting || !text.trim()} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSubmitting ? 'Enviando...' : 'Enviar Justificativa'}
                    </button>
                </div>
            </div>
        </div>
    );
};

const PostCheck: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [assignments, setAssignments] = useState<(PostAssignment & { promoterHasJoinedGroup: boolean })[] | null>(null);
    const [scheduledPosts, setScheduledPosts] = useState<ScheduledPost[]>([]);
    const [currentPromoter, setCurrentPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [searched, setSearched] = useState(false);
    const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
    const [showArchived, setShowArchived] = useState(false);
    
    // Justification Modal State
    const [isJustifyModalOpen, setIsJustifyModalOpen] = useState(false);
    const [justifyingAssignment, setJustifyingAssignment] = useState<PostAssignment | null>(null);

    const performSearch = useCallback(async (searchEmail: string) => {
        if (!searchEmail) return;
        setIsLoading(true);
        setError(null);
        setAssignments(null);
        setScheduledPosts([]);
        setCurrentPromoter(null);
        setSearched(true);
        try {
            const [assignmentsResult, promoterProfiles, scheduledPostsResult] = await Promise.all([
                getAssignmentsForPromoterByEmail(searchEmail),
                findPromotersByEmail(searchEmail),
                getScheduledPostsForPromoter(searchEmail),
            ]);

            if (promoterProfiles && promoterProfiles.length > 0) {
                setCurrentPromoter(promoterProfiles[0]);
            }

            setScheduledPosts(scheduledPostsResult);
            
            const campaignStatusMap = new Map<string, boolean>();
            if (promoterProfiles) {
                // First pass: set all to false initially based on existence.
                for (const profile of promoterProfiles) {
                    if (profile.status === 'approved') {
                        if (profile.campaignName && !campaignStatusMap.has(profile.campaignName)) {
                            campaignStatusMap.set(profile.campaignName, false);
                        }
                        if (profile.associatedCampaigns) {
                            for (const assoc of profile.associatedCampaigns) {
                                if (!campaignStatusMap.has(assoc)) {
                                    campaignStatusMap.set(assoc, false);
                                }
                            }
                        }
                    }
                }

                // Second pass: upgrade to true if any profile grants it. A 'true' status wins.
                for (const profile of promoterProfiles) {
                    if (profile.status === 'approved' && profile.hasJoinedGroup) {
                        if (profile.campaignName) {
                            campaignStatusMap.set(profile.campaignName, true);
                        }
                        if (profile.associatedCampaigns) {
                            for (const assoc of profile.associatedCampaigns) {
                                campaignStatusMap.set(assoc, true);
                            }
                        }
                    }
                }
            }

            const assignmentsWithStatus = assignmentsResult.map(assignment => ({
                ...assignment,
                promoterHasJoinedGroup: campaignStatusMap.get(assignment.post.campaignName) || false,
            }));

            setAssignments(assignmentsWithStatus);
        } catch (err: any) {
            setError(err.message || 'Ocorreu um erro.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    // Handle email from query parameter on initial load or navigation
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const emailFromQuery = queryParams.get('email');
        if (emailFromQuery && emailFromQuery !== email) {
            setEmail(emailFromQuery);
            performSearch(emailFromQuery);
        }
    }, [location.search, performSearch, email]);

    const handleConfirmPost = async (assignmentId: string) => {
        try {
            await confirmAssignment(assignmentId);
            // Refresh the list to show the updated status
            await performSearch(email);
        } catch (err: any) {
            setError(err.message || 'Falha ao confirmar.');
        }
    }
    
    const handleOpenJustifyModal = (assignment: PostAssignment) => {
        setJustifyingAssignment(assignment);
        setIsJustifyModalOpen(true);
    };
    
    const handleJustifySubmit = async (assignmentId: string, text: string, imageFiles: File[]) => {
        try {
            await submitJustification(assignmentId, text, imageFiles);
            await performSearch(email); // Refresh list
        } catch (err: any) {
            setError(err.message || 'Falha ao enviar justificativa.');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(email);
    };
    
    const { activeAssignments, archivedAssignments } = useMemo(() => {
        if (!assignments) return { activeAssignments: [], archivedAssignments: [] };
    
        const active: (PostAssignment & { promoterHasJoinedGroup: boolean })[] = [];
        const archived: (PostAssignment & { promoterHasJoinedGroup: boolean })[] = [];
    
        assignments.forEach(a => {
            const isCompleted = !!a.proofSubmittedAt || !!a.justification;
            const isMissed = !a.post.isActive; // Inactive posts are always archived
    
            if (isCompleted || isMissed) {
                archived.push(a);
            } else {
                active.push(a);
            }
        });
    
        return { activeAssignments: active, archivedAssignments: archived };
    }, [assignments]);

    const justificationCount = useMemo(() => {
        if (!assignments) return 0;
        return assignments.filter(a => a.justification && a.justificationStatus === 'pending').length;
    }, [assignments]);

    const renderResult = () => {
        if (!searched) return null;
        if (isLoading) {
            return (
                <div className="flex justify-center items-center h-24">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
            );
        }
        if (error) return <p className="text-red-500 mt-4 text-center">{error}</p>;
        
        if (!currentPromoter) {
            return <p className="text-center text-gray-400 mt-4">Nenhum cadastro de divulgadora encontrado para este e-mail.</p>;
        }

        return (
            <>
                <div className="mb-6 text-center">
                    <button
                        onClick={() => setIsStatsModalOpen(true)}
                        className="inline-block w-full sm:w-auto text-center bg-indigo-600 text-white font-bold py-2 px-4 rounded hover:bg-indigo-700 transition-colors"
                    >
                        Ver Minhas Estatísticas de Postagens
                    </button>
                </div>
                
                {justificationCount > 0 && (
                    <div className="mb-4 p-3 bg-blue-900/50 rounded-md text-blue-300 text-sm text-center">
                        Você tem <strong>{justificationCount}</strong> justificativa(s) de não postagem aguardando análise do organizador.
                    </div>
                )}
                
                {scheduledPosts.length > 0 && (
                     <div className="mb-8">
                        <h2 className="text-2xl font-bold text-gray-100 mb-4 text-center border-b border-gray-700 pb-2">Próximas Publicações Agendadas</h2>
                        <div className="space-y-4">
                            {scheduledPosts.map(p => <ScheduledPostCard key={p.id} post={p} />)}
                        </div>
                    </div>
                )}
                
                <h2 className="text-2xl font-bold text-gray-100 mb-4 text-center border-b border-gray-700 pb-2">Publicações Ativas</h2>
                {activeAssignments.length === 0 ? (
                    <p className="text-center text-gray-400 mt-4">Nenhuma publicação ativa encontrada para você no momento.</p>
                ) : (
                    <div className="space-y-4">
                        {activeAssignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={handleConfirmPost} onJustify={handleOpenJustifyModal} />)}
                    </div>
                )}

                {archivedAssignments.length > 0 && (
                    <div className="mt-8 text-center border-t border-gray-700 pt-6">
                        <button
                            onClick={() => setShowArchived(prev => !prev)}
                            className="px-6 py-2 bg-gray-600 text-white font-semibold rounded-md hover:bg-gray-500 transition-colors"
                        >
                            {showArchived ? 'Ocultar' : 'Ver'} Publicações Arquivadas ({archivedAssignments.length})
                        </button>
                    </div>
                )}

                {showArchived && archivedAssignments.length > 0 && (
                    <div className="mt-6 space-y-4">
                        <h3 className="text-xl font-bold text-gray-400 border-b border-gray-700 pb-2 mb-4">Publicações Arquivadas</h3>
                         {archivedAssignments.map(a => <PostCard key={a.id} assignment={a} onConfirm={handleConfirmPost} onJustify={handleOpenJustifyModal} />)}
                    </div>
                )}
            </>
        );
    }
    
    return (
        <div className="max-w-2xl mx-auto">
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <div className="bg-secondary shadow-2xl rounded-lg p-8">
                <h1 className="text-3xl font-bold text-center text-gray-100 mb-2">Publicações para Divulgação</h1>
                <p className="text-center text-gray-400 mb-8">Digite o e-mail que você usou no cadastro para ver os posts que você precisa publicar.</p>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Seu e-mail de cadastro"
                        className="w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200"
                        required
                    />
                     <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-primary/50 disabled:cursor-not-allowed transition-all duration-300"
                    >
                        {isLoading ? 'Verificando...' : 'Verificar'}
                    </button>
                </form>
                
                <div className="mt-8">
                    {renderResult()}
                </div>
            </div>
             <PromoterPublicStatsModal 
                isOpen={isStatsModalOpen}
                onClose={() => setIsStatsModalOpen(false)}
                promoter={currentPromoter}
            />
            <JustificationModal
                isOpen={isJustifyModalOpen}
                onClose={() => setIsJustifyModalOpen(false)}
                onSubmit={handleJustifySubmit}
                assignment={justifyingAssignment}
            />
        </div>
    );
};

export default PostCheck;