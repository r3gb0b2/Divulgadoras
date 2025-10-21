import React, { useState, useEffect } from 'react';
import { Post } from '../types';
import { LinkIcon } from './Icons';
import { storage } from '../firebase/config';
import { ref, uploadBytes } from 'firebase/storage';
import StorageMedia from './StorageMedia';
import { Timestamp } from 'firebase/firestore';

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
    const [instructions, setInstructions] = useState('');
    const [textContent, setTextContent] = useState('');
    const [postLink, setPostLink] = useState('');
    const [mediaUrl, setMediaUrl] = useState(''); // Handles both image paths and video URLs
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

    useEffect(() => {
        if (post) {
            setInstructions(post.instructions || '');
            setTextContent(post.textContent || '');
            setMediaUrl(post.mediaUrl || '');
            setMediaPreview(post.mediaUrl || null);
            setPostLink(post.postLink || '');
            setPostFormats(post.postFormats || []);
            
            // Set all options from post data
            setIsActive(post.isActive);
            setExpiresAt(timestampToInputDate(post.expiresAt));
            setAutoAssignToNewPromoters(post.autoAssignToNewPromoters || false);
            setAllowLateSubmissions(post.allowLateSubmissions || false);
            setAllowImmediateProof(post.allowImmediateProof || false);

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
            // This is a temporary blob URL for preview
            const tempPreviewUrl = URL.createObjectURL(file);
            setMediaPreview(tempPreviewUrl);
            setMediaUrl(tempPreviewUrl); // Update mediaUrl state for preview component
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        
        let expiryTimestamp: Timestamp | null = null;
        if (expiresAt) {
            const [year, month, day] = expiresAt.split('-').map(Number);
            const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
            expiryTimestamp = Timestamp.fromDate(expiryDate);
        }

        const updatedData: Partial<Post> = {
            instructions,
            postLink,
            isActive,
            expiresAt: expiryTimestamp,
            autoAssignToNewPromoters,
            allowLateSubmissions,
            allowImmediateProof,
            postFormats,
        };
        
        if (post.type === 'text') {
            updatedData.textContent = textContent;
        }
        
        if (post.type === 'video') {
            updatedData.mediaUrl = mediaUrl;
        }

        try {
            await onSave(updatedData, post.type === 'image' ? mediaFile : null);
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
                    {post.type === 'text' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Conteúdo do Texto</label>
                            <textarea value={textContent} onChange={e => setTextContent(e.target.value)} rows={6} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                        </div>
                    )}
                    {post.type === 'image' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Mídia (Imagem)</label>
                            <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark mt-1" />
                            {mediaPreview && (
                                <div className="mt-4">
                                     <StorageMedia path={mediaPreview} type="image" className="max-h-60 rounded-md" />
                                </div>
                            )}
                             <p className="text-xs text-yellow-400 mt-2">Selecionar um novo arquivo substituirá o atual.</p>
                        </div>
                    )}
                     {post.type === 'video' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Link do Vídeo (Google Drive)</label>
                            <input type="text" value={mediaUrl} onChange={e => setMediaUrl(e.target.value)} placeholder="Cole o link compartilhável do Google Drive" className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                            {mediaUrl && (
                                <div className="mt-4">
                                    <StorageMedia path={mediaUrl} type="video" className="w-full h-64 rounded-md" />
                                </div>
                            )}
                        </div>
                     )}

                     <div>
                        <label className="block text-sm font-medium text-gray-300">Formato (informativo)</label>
                        <div className="flex gap-6 mt-2">
                            <label className="flex items-center space-x-2">
                                <input 
                                    type="checkbox"
                                    checked={postFormats.includes('story')}
                                    onChange={() => handleFormatChange('story')}
                                    className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                />
                                <span>Story</span>
                            </label>
                            <label className="flex items-center space-x-2">
                                <input 
                                    type="checkbox"
                                    checked={postFormats.includes('reels')}
                                    onChange={() => handleFormatChange('reels')}
                                    className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                />
                                <span>Reels</span>
                            </label>
                        </div>
                    </div>


                    <div>
                        <label className="block text-sm font-medium text-gray-300">Instruções</label>
                        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Link da Postagem</label>
                         <InputWithIcon Icon={LinkIcon} type="url" name="postLink" placeholder="Link da Postagem (Ex: link do post no instagram)" value={postLink} onChange={e => setPostLink(e.target.value)} />
                    </div>

                    <div className="border-t border-gray-700 pt-4 space-y-4">
                        <h3 className="text-lg font-semibold text-white">Opções da Publicação</h3>
                         <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                            <label className="flex items-center space-x-2 pt-2">
                                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                                <span>Ativo (visível para divulgadoras)</span>
                            </label>
                            <div>
                                <label className="block text-sm font-medium text-gray-400">Data Limite (opcional)</label>
                                <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                            </div>
                        </div>
                        <label className="flex items-center space-x-2 cursor-pointer" title="Se marcado, este post será automaticamente enviado para todas as novas divulgadoras que forem aprovadas para este evento no futuro.">
                            <input type="checkbox" checked={autoAssignToNewPromoters} onChange={(e) => setAutoAssignToNewPromoters(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Atribuir automaticamente para novas divulgadoras</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer" title="Se marcado, permite que as divulgadoras enviem a comprovação mesmo após o prazo de 24 horas ter expirado.">
                            <input type="checkbox" checked={allowLateSubmissions} onChange={(e) => setAllowLateSubmissions(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Permitir envio de comprovação fora do prazo</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer" title="Se marcado, as divulgadoras poderão enviar a comprovação assim que confirmarem, sem esperar 6 horas.">
                            <input type="checkbox" checked={allowImmediateProof} onChange={(e) => setAllowImmediateProof(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Liberar envio de comprovação imediato</span>
                        </label>
                    </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3 border-t border-gray-700 pt-4">
                    <button type="button" onClick={onClose} disabled={isSaving} className="px-4 py-2 bg-gray-600 rounded-md">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md disabled:opacity-50">
                        {isSaving ? 'Salvando...' : 'Salvar Conteúdo'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default EditPostModal;