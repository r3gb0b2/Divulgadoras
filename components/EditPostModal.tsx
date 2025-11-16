import React, { useState, useEffect } from 'react';
import { Post, Timestamp } from '../types';
import { LinkIcon } from './Icons';
import { storage } from '../firebase/config';
import StorageMedia from './StorageMedia';

const timestampToInputDate = (ts: Timestamp | undefined | null | any): string => {
    if (!ts) return '';
    let date;
    if (ts.toDate) {
        date = ts.toDate();
    }
    else if (typeof ts === 'object' && (ts.seconds || ts._seconds)) {
        const seconds = ts.seconds || ts._seconds;
        date = new Date(seconds * 1000);
    }
    else {
        date = new Date(ts);
    }
    if (isNaN(date.getTime())) return '';
    return date.toISOString().split('T')[0];
};

interface InputWithIconProps extends React.InputHTMLAttributes<HTMLInputElement> {
    Icon: React.ElementType;
}
const InputWithIcon: React.FC<InputWithIconProps> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200" />
    </div>
);

interface EditPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: Post | null;
    onSave: (updatedData: Partial<Post>, newMediaFile: File | null) => Promise<void>;
}

const EditPostModal: React.FC<EditPostModalProps> = ({ isOpen, onClose, post, onSave }) => {
    const [eventName, setEventName] = useState('');
    const [instructions, setInstructions] = useState('');
    const [textContent, setTextContent] = useState('');
    const [postLink, setPostLink] = useState('');
    const [mediaUrl, setMediaUrl] = useState(''); // For firebase path
    const [googleDriveUrl, setGoogleDriveUrl] = useState(''); // For GDrive link
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [postFormats, setPostFormats] = useState<('story' | 'reels')[]>([]);

    // All post options
    const [isActive, setIsActive] = useState(true);
    const [expiresAt, setExpiresAt] = useState('');
    const [autoAssignToNewPromoters, setAutoAssignToNewPromoters] = useState(false);
    const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
    const [allowImmediateProof, setAllowImmediateProof] = useState(false);
    const [skipProofRequirement, setSkipProofRequirement] = useState(false);

    useEffect(() => {
        if (post) {
            setEventName(post.eventName || '');
            setInstructions(post.instructions || '');
            setTextContent(post.textContent || '');
            setPostLink(post.postLink || '');
            setPostFormats(post.postFormats || []);
            
            setMediaPreview(null);
            if (post.mediaUrl) {
                const path = post.mediaUrl;
                if (path.startsWith('http')) {
                    setMediaPreview(path);
                } else {
                    storage.ref(path).getDownloadURL()
                        .then(url => setMediaPreview(url))
                        .catch(err => console.error("Error getting media preview URL:", err));
                }
            }

            setGoogleDriveUrl(post.googleDriveUrl || '');
            
            // Set all options from post data
            setIsActive(post.isActive);
            setExpiresAt(timestampToInputDate(post.expiresAt));
            setAutoAssignToNewPromoters(post.autoAssignToNewPromoters || false);
            setAllowLateSubmissions(post.allowLateSubmissions || false);
            setAllowImmediateProof(post.allowImmediateProof || false);
            setSkipProofRequirement(post.skipProofRequirement || false);

            setMediaFile(null); // Reset file input on open
        }
    }, [post, isOpen]);

    if (!isOpen || !post) return null;

    const handleFormatChange = (format: 'story' | 'reels') => {
        setPostFormats(prev => {
            if (prev.includes(format)) {
                return prev.filter(f => f !== format);
            } else {
                return [...prev, format];
            }
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setMediaFile(file);
            const tempPreviewUrl = URL.createObjectURL(file);
            setMediaPreview(tempPreviewUrl);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        
        let expiryTimestamp: Date | null = null;
        if (expiresAt) {
            const [year, month, day] = expiresAt.split('-').map(Number);
            expiryTimestamp = new Date(year, month - 1, day, 23, 59, 59);
        }

        const updatedData: Partial<Post> = {
            eventName: eventName.trim() || undefined,
            instructions,
            postLink,
            isActive,
            expiresAt: expiryTimestamp,
            autoAssignToNewPromoters,
            allowLateSubmissions,
            allowImmediateProof,
            postFormats,
            skipProofRequirement,
            googleDriveUrl: googleDriveUrl.trim() ? googleDriveUrl.trim() : undefined,
        };
        
        if (post.type === 'text') {
            updatedData.textContent = textContent;
        }

        try {
            await onSave(updatedData, mediaFile);
            onClose();
        } catch(e) {
            // Error is handled by parent component
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">Editar Conteúdo da Publicação</h2>
                
                <div className="flex-grow overflow-y-auto space-y-4 pr-2">
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nome do Evento (Opcional)</label>
                        <input type="text" value={eventName} onChange={e => setEventName(e.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700"/>
                    </div>
                    {post.type === 'text' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Texto do Post</label>
                            <textarea value={textContent} onChange={e => setTextContent(e.target.value)} rows={5} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" />
                        </div>
                    )}
                    {post.type === 'image' && (
                         <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 1: Upload (substitui existente)</label>
                                <input type="file" accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />
                                {mediaPreview && <img src={mediaPreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />}
                            </div>
                            <div className="flex items-center gap-2">
                                <hr className="flex-grow border-gray-600" /><span className="text-xs text-gray-400">E/OU</span><hr className="flex-grow border-gray-600" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 2: Link do Google Drive</label>
                                <InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Cole o link compartilhável do Google Drive" value={googleDriveUrl} onChange={e => setGoogleDriveUrl(e.target.value)} />
                            </div>
                        </div>
                    )}
                    {post.type === 'video' && (
                        <div>
                             <label className="block text-sm font-medium text-gray-300">Link do Vídeo (Google Drive)</label>
                            <InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Link compartilhável do Google Drive para o vídeo" value={googleDriveUrl} onChange={e => setGoogleDriveUrl(e.target.value)} required />
                             {googleDriveUrl && <div className="mt-2"><StorageMedia path={googleDriveUrl} type="video" className="w-full h-auto rounded-md" /></div>}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Instruções</label>
                        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-300">Link da Postagem</label>
                        <InputWithIcon Icon={LinkIcon} type="url" name="postLink" placeholder="Link da Postagem (Ex: link do post no instagram)" value={postLink} onChange={e => setPostLink(e.target.value)} />
                    </div>

                    <div className="border-t border-gray-700 pt-4 space-y-4">
                        <h3 className="font-semibold text-lg">Opções da Publicação</h3>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            <label className="flex items-center space-x-2 pt-2">
                                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                                <span>Ativo</span>
                            </label>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Data Limite</label>
                                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                            </div>
                        </div>
                        <label className="flex items-center space-x-2 cursor-pointer text-sm">
                            <input type="checkbox" checked={autoAssignToNewPromoters} onChange={(e) => setAutoAssignToNewPromoters(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Atribuir para novas divulgadoras</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer text-sm">
                            <input type="checkbox" checked={allowLateSubmissions} onChange={(e) => setAllowLateSubmissions(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Permitir comprovação fora do prazo</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer text-sm">
                            <input type="checkbox" checked={allowImmediateProof} onChange={(e) => setAllowImmediateProof(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Liberar comprovação imediata</span>
                        </label>
                         <label className="flex items-center space-x-2 cursor-pointer text-sm">
                            <input type="checkbox" checked={skipProofRequirement} onChange={(e) => setSkipProofRequirement(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Não exigir envio de print (conclusão automática)</span>
                        </label>
                        <div>
                             <label className="block text-sm font-medium text-gray-300 mb-2">Formato (informativo):</label>
                            <div className="flex gap-6">
                                <label className="flex items-center space-x-2">
                                    <input type="checkbox" checked={postFormats.includes('story')} onChange={() => handleFormatChange('story')} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/>
                                    <span>Story</span>
                                </label>
                                <label className="flex items-center space-x-2">
                                    <input type="checkbox" checked={postFormats.includes('reels')} onChange={() => handleFormatChange('reels')} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/>
                                    <span>Reels</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditPostModal;
