
import React, { useState, useEffect } from 'react';
import { Post, Timestamp } from '../types';
import { storage } from '../firebase/config';
import firebase from 'firebase/compat/app';
import { LinkIcon } from './Icons';

interface EditPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: Post | null;
    onSave: (updatedData: Partial<Post>, newMediaFile: File | null) => Promise<void>;
}

const timestampToInputDate = (ts: Timestamp | undefined | null | any): string => {
    if (!ts) return '';
    let date;
    if (ts.toDate) { date = ts.toDate(); }
    else if (typeof ts === 'object' && (ts.seconds || ts._seconds)) {
        const seconds = ts.seconds || ts._seconds;
        date = new Date(seconds * 1000);
    } else { date = new Date(ts); }
    if (isNaN(date.getTime())) return '';
    
    // Adjust for timezone to display correctly in input[type=date]
    const tzOffset = date.getTimezoneOffset() * 60000;
    const localDate = new Date(date.getTime() - tzOffset);
    return localDate.toISOString().split('T')[0];
};

const InputWithIcon: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { Icon: React.ElementType }> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200" />
    </div>
);


const EditPostModal: React.FC<EditPostModalProps> = ({ isOpen, onClose, post, onSave }) => {
    const [formData, setFormData] = useState<Partial<Post>>({});
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (post && isOpen) {
            setFormData({
                ...post,
                expiresAt: timestampToInputDate(post.expiresAt as Timestamp),
            });
            setMediaFile(null);
            setMediaPreview(null);
            if (post.mediaUrl) {
                if (post.mediaUrl.startsWith('http')) {
                    setMediaPreview(post.mediaUrl);
                } else {
                    storage.ref(post.mediaUrl).getDownloadURL().then(setMediaPreview).catch(console.error);
                }
            } else if (post.googleDriveUrl) {
                setMediaPreview(post.googleDriveUrl); // Not a real preview, but indicates something is there.
            }
        }
    }, [post, isOpen]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        setFormData(prev => ({ ...prev, [name]: isCheckbox ? (e.target as HTMLInputElement).checked : value }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setMediaFile(file);
            setMediaPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const dataToSave: Partial<Post> = { ...formData };
        if (formData.expiresAt && typeof formData.expiresAt === 'string') {
            const [year, month, day] = formData.expiresAt.split('-').map(Number);
            const expiryTimestamp = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
            dataToSave.expiresAt = firebase.firestore.Timestamp.fromDate(expiryTimestamp);
        } else if (formData.expiresAt === '' || formData.expiresAt === null) {
            dataToSave.expiresAt = null;
        }

        try {
            await onSave(dataToSave, mediaFile);
            onClose();
        } catch (error) {
            console.error("Failed to save post:", error);
            alert("Falha ao salvar. Tente novamente.");
        } finally {
            setIsSaving(false);
        }
    };

    if (!isOpen || !post) return null;
    
    const formInputStyle = "mt-1 w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary";
    const formCheckboxStyle = "h-4 w-4 text-primary rounded border-gray-500 bg-gray-700 focus:ring-primary";

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50 p-4" onClick={onClose}>
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold text-white mb-4">Editar Publicação</h2>
                <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-4">
                    <p className="text-sm text-gray-400">Tipo do Post: <span className="font-semibold capitalize">{post.type}</span> (não pode ser alterado)</p>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-300">Nome do Evento (Opcional)</label>
                        <input type="text" name="eventName" value={formData.eventName || ''} onChange={handleChange} className={formInputStyle} />
                    </div>

                    {(post.type === 'image' || post.type === 'video') && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 1: Upload (substitui existente)</label>
                                <input type="file" accept={post.type === 'image' ? "image/*" : "video/*"} onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />
                                {mediaPreview && post.type === 'image' && <img src={mediaPreview} alt="Preview" className="mt-4 max-h-40 rounded-md" />}
                                {mediaPreview && post.type === 'video' && <video src={mediaPreview} controls className="mt-4 max-h-40 rounded-md" />}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 2: Link do Google Drive</label>
                                <InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Cole o link compartilhável" value={formData.googleDriveUrl || ''} onChange={handleChange} />
                            </div>
                        </div>
                    )}
                    
                    {post.type === 'text' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Conteúdo do Texto</label>
                            <textarea name="textContent" value={formData.textContent || ''} onChange={handleChange} rows={4} className={formInputStyle} />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Instruções</label>
                        <textarea name="instructions" value={formData.instructions || ''} onChange={handleChange} rows={6} required className={formInputStyle} />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Link da Postagem</label>
                        <InputWithIcon Icon={LinkIcon} type="url" name="postLink" value={formData.postLink || ''} onChange={handleChange} />
                    </div>
                    
                    <div>
                        <label className="block text-sm font-medium text-gray-400">Data Limite (opcional)</label>
                        <input type="date" name="expiresAt" value={formData.expiresAt as string || ''} onChange={handleChange} className={formInputStyle} style={{colorScheme: 'dark'}}/>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
                         <label className="flex items-center space-x-2"><input type="checkbox" name="ownerOnly" checked={!!formData.ownerOnly} onChange={handleChange} className={formCheckboxStyle} /><span>Visível só para mim</span></label>
                         <label className="flex items-center space-x-2"><input type="checkbox" name="isActive" checked={!!formData.isActive} onChange={handleChange} className={formCheckboxStyle} /><span>Ativo</span></label>
                         <label className="flex items-center space-x-2"><input type="checkbox" name="autoAssignToNewPromoters" checked={!!formData.autoAssignToNewPromoters} onChange={handleChange} className={formCheckboxStyle} /><span>Auto-atribuir</span></label>
                         <label className="flex items-center space-x-2"><input type="checkbox" name="allowLateSubmissions" checked={!!formData.allowLateSubmissions} onChange={handleChange} className={formCheckboxStyle} /><span>Permitir envio tardio</span></label>
                         <label className="flex items-center space-x-2"><input type="checkbox" name="allowImmediateProof" checked={!!formData.allowImmediateProof} onChange={handleChange} className={formCheckboxStyle} /><span>Prova imediata</span></label>
                         <label className="flex items-center space-x-2"><input type="checkbox" name="skipProofRequirement" checked={!!formData.skipProofRequirement} onChange={handleChange} className={formCheckboxStyle} /><span>Não exigir print</span></label>
                         <label className="flex items-center space-x-2"><input type="checkbox" name="allowJustification" checked={formData.allowJustification !== false} onChange={handleChange} className={formCheckboxStyle} /><span>Permitir justificativa</span></label>
                    </div>

                </div>
                <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-700 flex-shrink-0">
                    <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">Cancelar</button>
                    <button type="button" onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark disabled:opacity-50">{isSaving ? 'Salvando...' : 'Salvar Alterações'}</button>
                </div>
            </div>
        </div>
    );
};

export default EditPostModal;
