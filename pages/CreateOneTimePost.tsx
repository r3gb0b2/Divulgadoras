import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllCampaigns } from '../services/settingsService';
import { createOneTimePost } from '../services/postService';
import { Campaign, OneTimePost } from '../types';
import { storage } from '../firebase/config';
import { ArrowLeftIcon, LinkIcon } from '../components/Icons';

const InputWithIcon: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { Icon: React.ElementType }> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200" />
    </div>
);


const CreateOneTimePost: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();

    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const [formData, setFormData] = useState({
        campaignId: '',
        eventName: '',
        guestListName: '',
        type: 'image' as 'image' | 'text' | 'video',
        textContent: '',
        googleDriveUrl: '',
        instructions: '',
        isActive: true,
    });
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);

    useEffect(() => {
        const loadCampaigns = async () => {
            if (!selectedOrgId) {
                setError("Nenhuma organização selecionada.");
                setIsLoading(false);
                return;
            }
            try {
                const campaignsData = await getAllCampaigns(selectedOrgId);
                setCampaigns(campaignsData.sort((a,b) => a.name.localeCompare(b.name)));
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        loadCampaigns();
    }, [selectedOrgId]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setMediaFile(file);
            setMediaPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrgId || !adminData?.email) {
            setError("Dados do administrador inválidos.");
            return;
        }
        const { campaignId, guestListName, type, textContent, googleDriveUrl } = formData;
        if (!campaignId || !guestListName.trim()) {
            setError("Evento e Nome da Lista são obrigatórios.");
            return;
        }
         if (type === 'image' && !mediaFile && !googleDriveUrl) {
            setError(`Selecione uma imagem ou forneça um link do Google Drive.`);
            return;
        }
        if (type === 'video' && !googleDriveUrl.trim()) {
            setError('Cole o link compartilhável do Google Drive para o vídeo.');
            return;
        }
        if (type === 'text' && !textContent.trim()) {
            setError("Escreva o conteúdo do post de texto.");
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            const selectedCampaign = campaigns.find(c => c.id === campaignId);
            if (!selectedCampaign) throw new Error("Evento inválido.");

            let finalMediaUrl: string | undefined = undefined;
            if (mediaFile) {
                const fileExtension = mediaFile.name.split('.').pop();
                const fileName = `one-time-posts/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = storage.ref(fileName);
                await storageRef.put(mediaFile);
                finalMediaUrl = storageRef.fullPath;
            }

            const postData: Omit<OneTimePost, 'id' | 'createdAt'> = {
                organizationId: selectedOrgId,
                campaignId: selectedCampaign.id,
                campaignName: selectedCampaign.name,
                guestListName: formData.guestListName.trim(),
                type: formData.type,
                instructions: formData.instructions,
                isActive: formData.isActive,
                createdByEmail: adminData.email,
                ...(formData.eventName.trim() && { eventName: formData.eventName.trim() }),
                ...(formData.type === 'text' && { textContent: formData.textContent }),
                ...(finalMediaUrl && { mediaUrl: finalMediaUrl }),
                ...(formData.googleDriveUrl.trim() && { googleDriveUrl: formData.googleDriveUrl.trim() }),
            };

            await createOneTimePost(postData);
            alert("Post Único criado com sucesso!");
            navigate('/admin/one-time-posts');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <h1 className="text-3xl font-bold mb-6">Criar Post Único</h1>

            <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}

                <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                    <legend className="px-2 font-semibold text-primary">Informações Básicas</legend>
                    <select name="campaignId" value={formData.campaignId} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                        <option value="" disabled>Selecione um Evento</option>
                        {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.stateAbbr})</option>)}
                    </select>
                    <input type="text" name="eventName" placeholder="Nome do Evento Específico (Opcional)" value={formData.eventName} onChange={handleChange} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    <input type="text" name="guestListName" placeholder="Nome da Lista de Convidados (ex: VIP Post)" value={formData.guestListName} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                </fieldset>

                <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                     <legend className="px-2 font-semibold text-primary">Conteúdo do Post</legend>
                     <div className="flex gap-4"><label><input type="radio" name="type" value="image" checked={formData.type === 'image'} onChange={handleChange} /> Imagem</label><label><input type="radio" name="type" value="text" checked={formData.type === 'text'} onChange={handleChange} /> Texto</label><label><input type="radio" name="type" value="video" checked={formData.type === 'video'} onChange={handleChange} /> Vídeo</label></div>
                     
                     {formData.type === 'text' && <textarea name="textContent" value={formData.textContent} onChange={handleChange} placeholder="Texto da publicação" rows={6} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />}
                     
                     {formData.type === 'image' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 1: Upload para Servidor</label>
                                <input type="file" accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />
                                {mediaPreview && <img src={mediaPreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />}
                            </div>
                            <div className="flex items-center gap-2">
                                <hr className="flex-grow border-gray-600" /><span className="text-xs text-gray-400">E/OU</span><hr className="flex-grow border-gray-600" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 2: Link do Google Drive</label>
                                <InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Cole o link compartilhável do Google Drive" value={formData.googleDriveUrl} onChange={handleChange} />
                            </div>
                        </div>
                     )}

                     {formData.type === 'video' && (
                        <div>
                            <label className="block text-sm font-medium text-gray-300">Link do Vídeo (Google Drive)</label>
                             <p className="text-xs text-gray-400 mb-2">No Google Drive: clique com o botão direito no vídeo &gt; Compartilhar &gt; Altere para "Qualquer pessoa com o link" &gt; Copiar link.</p>
                            <InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Link compartilhável do Google Drive para o vídeo" value={formData.googleDriveUrl} onChange={handleChange} required />
                        </div>
                     )}
                     
                     <textarea name="instructions" value={formData.instructions} onChange={handleChange} placeholder="Instruções para a publicação" rows={4} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                </fieldset>

                <div className="flex justify-end">
                    <button type="submit" disabled={isSubmitting || isLoading} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSubmitting ? 'Criando...' : 'Criar Post e Gerar Link'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreateOneTimePost;