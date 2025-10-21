import React, { useState, useEffect } from 'react';
import { Post } from '../types';
import { LinkIcon } from './Icons';
import { storage } from '../firebase/config';
import { ref, uploadBytes } from 'firebase/storage';
import StorageMedia from './StorageMedia';

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
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (post) {
            setInstructions(post.instructions || '');
            setTextContent(post.textContent || '');
            setMediaPreview(post.mediaUrl || null);
            setPostLink(post.postLink || '');
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
            postLink,
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
                            {mediaPreview && (
                                <div className="mt-4">
                                    {mediaFile ? ( // If a new file is selected, show its preview
                                        post.type === 'video' ? (
                                            <video src={mediaPreview} controls className="max-h-60 rounded-md" />
                                        ) : (
                                            <img src={mediaPreview} alt="Preview" className="max-h-60 rounded-md" />
                                        )
                                    ) : ( // Otherwise, show the original media from storage path
                                        <StorageMedia path={mediaPreview} type={post.type} className="max-h-60 rounded-md" />
                                    )}
                                </div>
                            )}
                            <p className="text-xs text-yellow-400 mt-2">Selecionar um novo arquivo substituirá o atual.</p>
                        </div>
                     )}

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Instruções</label>
                        <textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-300">Link da Postagem</label>
                         <InputWithIcon Icon={LinkIcon} type="url" name="postLink" placeholder="Link da Postagem (Ex: link do post no instagram)" value={postLink} onChange={e => setPostLink(e.target.value)} />
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
