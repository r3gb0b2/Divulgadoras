import React, { useState, useEffect } from 'react';
import { Post } from '../types';

interface EditPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: Post | null;
    onSave: (updatedData: Partial<Post>, newMediaFile: File | null) => Promise<void>;
}

const EditPostModal: React.FC<EditPostModalProps> = ({ isOpen, onClose, post, onSave }) => {
    const [instructions, setInstructions] = useState('');
    const [textContent, setTextContent] = useState('');
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (post) {
            setInstructions(post.instructions || '');
            setTextContent(post.textContent || '');
            setMediaPreview(post.mediaUrl || null);
            setMediaFile(null); // Reset file input on open
        }
    }, [post, isOpen]);

    if (!isOpen || !post) return null;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setMediaFile(file);
            setMediaPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        const updatedData: Partial<Post> = {
            instructions,
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
                    {post.type === 'text' ? (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Conteúdo do Texto</label>
                            <textarea value={textContent} onChange={e => setTextContent(e.target.value)} rows={6} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                        </div>
                     ) : (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Mídia ({post.type})</label>
                            <input type="file" accept={post.type === 'image' ? "image/*" : "video/*"} onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark mt-1" />
                            {mediaPreview && (post.type === 'video') ? (
                                <video src={mediaPreview} controls className="mt-4 max-h-60 rounded-md" />
                            ) : mediaPreview ? (
                                <img src={mediaPreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />
                            ) : null}
                            <p className="text-xs text-yellow-400 mt-2">Selecionar um novo arquivo substituirá o atual.</p>
                        </div>
                     )}

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Instruções</label>
                        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
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