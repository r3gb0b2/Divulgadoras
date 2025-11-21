
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getAllCampaigns } from '../services/settingsService';
import { getOneTimePostById, updateOneTimePost } from '../services/postService';
import { Campaign, OneTimePost, Timestamp } from '../types';
import { storage } from '../firebase/config';
import { ArrowLeftIcon, LinkIcon } from '../components/Icons';
import firebase from 'firebase/compat/app';

const InputWithIcon: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { Icon: React.ElementType }> = ({ Icon, ...props }) => (
    <div className="relative">
        <span className="absolute inset-y-0 left-0 flex items-center pl-3">
            <Icon className="h-5 w-5 text-gray-400" />
        </span>
        <input {...props} className="w-full pl-10 pr-3 py-2 border border-gray-600 rounded-md shadow-sm placeholder-gray-500 focus:outline-none focus:ring-primary focus:border-primary sm:text-sm bg-gray-700 text-gray-200" />
    </div>
);

const timestampToDateTimeLocal = (ts: any): string => {
    if (!ts) return '';
    try {
        const date = ts.toDate ? ts.toDate() : new Date(ts.seconds * 1000);
        if (isNaN(date.getTime())) return '';
        const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
        return localDate.toISOString().slice(0, 16);
    } catch (e) { return ''; }
};

const EditOneTimePost: React.FC = () => {
    const { postId } = useParams<{ postId: string }>();
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
        expiresAt: '',
        successMessage: '',
        femaleOnly: false,
        askEmail: true,
    });
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [originalMediaPath, setOriginalMediaPath] = useState<string | null>(null);

    // Limit state
    const [hasLimit, setHasLimit] = useState(false);
    const [submissionLimit, setSubmissionLimit] = useState<string>('');

    useEffect(() => {
        const loadInitialData = async () => {
            if (!selectedOrgId || !postId) {
                setError("Dados ausentes para carregar a página.");
                setIsLoading(false);
                return;
            }
            try {
                const [campaignsData, postData] = await Promise.all([
                    getAllCampaigns(selectedOrgId),
                    getOneTimePostById(postId)
                ]);

                setCampaigns(campaignsData.sort((a,b) => a.name.localeCompare(b.name)));

                if (postData) {
                    setFormData({
                        campaignId: postData.campaignId,
                        eventName: postData.eventName || '',
                        guestListName: postData.guestListName,
                        type: postData.type,
                        textContent: postData.textContent || '',
                        googleDriveUrl: postData.googleDriveUrl || '',
                        instructions: postData.instructions,
                        isActive: postData.isActive,
                        expiresAt: timestampToDateTimeLocal(postData.expiresAt),
                        successMessage: postData.successMessage || '',
                        femaleOnly: postData.femaleOnly || false,
                        askEmail: postData.askEmail !== false, // default true if undefined
                    });
                    
                    if (postData.submissionLimit && postData.submissionLimit > 0) {
                        setHasLimit(true);
                        setSubmissionLimit(postData.submissionLimit.toString());
                    }

                    setOriginalMediaPath(postData.mediaUrl || null);
                    if (postData.mediaUrl) {
                        if (postData.mediaUrl.startsWith('http')) {
                            setMediaPreview(postData.mediaUrl);
                        } else {
                            storage.ref(postData.mediaUrl).getDownloadURL().then(setMediaPreview);
                        }
                    }
                } else {
                    setError("Post não encontrado.");
                }

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [selectedOrgId, postId]);

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
        if (!postId) return;

        if (hasLimit && (!submissionLimit || parseInt(submissionLimit) <= 0)) {
            setError("Por favor, informe um número válido para o limite.");
            return;
        }
        
        if (!formData.eventName.trim()) {
            setError("O nome do evento é obrigatório.");
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            let finalMediaUrl = originalMediaPath;
            if (mediaFile) {
                const fileExtension = mediaFile.name.split('.').pop();
                const fileName = `one-time-posts/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = storage.ref(fileName);
                await storageRef.put(mediaFile);
                finalMediaUrl = storageRef.fullPath;
            }

            const selectedCampaign = campaigns.find(c => c.id === formData.campaignId);

            const postData: Partial<OneTimePost> = {
                ...formData,
                campaignName: selectedCampaign?.name,
                eventName: formData.eventName.trim(),
                mediaUrl: finalMediaUrl || undefined,
                expiresAt: formData.expiresAt ? firebase.firestore.Timestamp.fromDate(new Date(formData.expiresAt)) : null,
                submissionLimit: hasLimit ? parseInt(submissionLimit) : null as any, // using 'as any' to pass null which Firestore interprets as delete or null value depending on merge
                successMessage: formData.successMessage.trim() || undefined,
            };
            
            // If hasLimit is false, ensure we clear the limit in DB or set to null
            if (!hasLimit) {
                postData.submissionLimit = null as any;
            }
            
            // Clean undefined values
            Object.keys(postData).forEach(key => (postData as any)[key] === undefined && delete (postData as any)[key]);

            await updateOneTimePost(postId, postData);
            alert("Post Único atualizado com sucesso!");
            navigate('/admin/one-time-posts');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <div className="text-center py-10">Carregando post...</div>;
    }

    return (
        <div>
            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                <ArrowLeftIcon className="w-5 h-5" />
                <span>Voltar</span>
            </button>
            <h1 className="text-3xl font-bold mb-6">Editar Post Único</h1>

            <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}

                <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                    <legend className="px-2 font-semibold text-primary">Informações Básicas</legend>
                     <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Categoria / Grupo (Interno)</label>
                        <select name="campaignId" value={formData.campaignId} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                            <option value="" disabled>Selecione a Categoria</option>
                            {campaigns.map(c => <option key={c.id} value={c.id}>{c.name} ({c.stateAbbr})</option>)}
                        </select>
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Evento (Público)</label>
                         <input type="text" name="eventName" placeholder="Nome do Evento que aparecerá no site" value={formData.eventName} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-300 mb-1">Nome da Lista</label>
                         <input type="text" name="guestListName" placeholder="Nome da Lista de Convidados (ex: VIP Post)" value={formData.guestListName} onChange={handleChange} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-400">Data Final para a Lista (opcional)</label>
                            <input type="datetime-local" name="expiresAt" value={formData.expiresAt} onChange={handleChange} className="mt-1 w-full px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                        </div>
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-400 mb-1">Restrições</label>
                            <div className="flex flex-col gap-2 mt-2">
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={hasLimit} 
                                        onChange={(e) => setHasLimit(e.target.checked)} 
                                        className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                    />
                                    <span className="text-sm text-gray-200">Limitar quantidade?</span>
                                </label>
                                {hasLimit && (
                                    <input 
                                        type="number" 
                                        placeholder="Máx" 
                                        value={submissionLimit} 
                                        onChange={(e) => setSubmissionLimit(e.target.value)}
                                        min="1"
                                        className="w-24 px-2 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200 text-sm"
                                    />
                                )}
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        name="femaleOnly"
                                        checked={formData.femaleOnly} 
                                        onChange={handleChange}
                                        className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                    />
                                    <span className="text-sm text-gray-200">Permitir apenas nomes femininos?</span>
                                </label>
                                <label className="flex items-center space-x-2 cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        name="askEmail"
                                        checked={formData.askEmail} 
                                        onChange={handleChange}
                                        className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                    />
                                    <span className="text-sm text-gray-200">Solicitar E-mail do Convidado?</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </fieldset>

                <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                     <legend className="px-2 font-semibold text-primary">Conteúdo do Post</legend>
                     <div className="flex gap-4"><label><input type="radio" name="type" value="image" checked={formData.type === 'image'} onChange={handleChange} /> Imagem</label><label><input type="radio" name="type" value="text" checked={formData.type === 'text'} onChange={handleChange} /> Texto</label><label><input type="radio" name="type" value="video" checked={formData.type === 'video'} onChange={handleChange} /> Vídeo</label></div>
                     
                     {formData.type === 'text' && <textarea name="textContent" value={formData.textContent} onChange={handleChange} placeholder="Texto da publicação" rows={6} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />}
                     
                     {formData.type === 'image' && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 1: Upload (substitui existente)</label>
                                <input type="file" accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />
                                {mediaPreview && <img src={mediaPreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />}
                            </div>
                            <div className="flex items-center gap-2"><hr className="flex-grow border-gray-600" /><span className="text-xs text-gray-400">E/OU</span><hr className="flex-grow border-gray-600" /></div>
                            <div>
                                <label className="block text-sm font-medium text-gray-300">Opção 2: Link do Google Drive</label>
                                <InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Cole o link compartilhável do Google Drive" value={formData.googleDriveUrl} onChange={handleChange} />
                            </div>
                        </div>
                     )}
                     {formData.type === 'video' && <InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Link compartilhável do Google Drive" value={formData.googleDriveUrl} onChange={handleChange} required />}
                     <textarea name="instructions" value={formData.instructions} onChange={handleChange} placeholder="Instruções para a publicação" rows={4} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                     
                     <div>
                        <label className="block text-sm font-medium text-gray-300 mb-1">Mensagem de Sucesso Personalizada (Opcional)</label>
                        <textarea 
                            name="successMessage" 
                            value={formData.successMessage} 
                            onChange={handleChange} 
                            placeholder="Ex: Obrigado! Entre agora no grupo do WhatsApp para confirmar sua presença: https://chat.whatsapp.com/..." 
                            rows={3} 
                            className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" 
                        />
                        <p className="text-xs text-gray-400 mt-1">Esta mensagem aparecerá para a pessoa logo após ela enviar a comprovação.</p>
                     </div>
                </fieldset>

                <div className="flex justify-end">
                    <button type="submit" disabled={isSubmitting || isLoading} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSubmitting ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default EditOneTimePost;
