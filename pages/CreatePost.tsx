import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getApprovedPromoters } from '../services/promoterService';
import { createPost } from '../services/postService';
import { Campaign, Promoter } from '../types';
import { ArrowLeftIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';

const CreatePost: React.FC = () => {
    const navigate = useNavigate();
    const { adminData } = useAdminAuth();

    // Data fetching states
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [assignedStates, setAssignedStates] = useState<string[]>([]);
    
    // Form states
    const [selectedState, setSelectedState] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [selectedPromoters, setSelectedPromoters] = useState<Set<string>>(new Set());
    const [postType, setPostType] = useState<'text' | 'image'>('text');
    const [textContent, setTextContent] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [instructions, setInstructions] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [expiresAt, setExpiresAt] = useState('');
    const [autoAssign, setAutoAssign] = useState(false);
    
    // UI states
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadInitialData = async () => {
            if (!adminData?.organizationId) {
                setError("Admin não está vinculado a uma organização.");
                setIsLoading(false);
                return;
            }
            try {
                const [orgData, allCampaigns] = await Promise.all([
                    getOrganization(adminData.organizationId),
                    getAllCampaigns(adminData.organizationId)
                ]);

                if (orgData?.assignedStates) {
                    setAssignedStates(orgData.assignedStates);
                }
                setCampaigns(allCampaigns);

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [adminData]);
    
    useEffect(() => {
        const fetchPromoters = async () => {
            if (selectedCampaign && selectedState && adminData?.organizationId) {
                setIsLoading(true);
                try {
                    const campaignDetails = campaigns.find(c => c.id === selectedCampaign);
                    if (campaignDetails) {
                        const promoterData = await getApprovedPromoters(adminData.organizationId, selectedState, campaignDetails.name);
                        setPromoters(promoterData);
                    }
                } catch(err:any) {
                    setError(err.message);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setPromoters([]);
            }
        };
        fetchPromoters();
    }, [selectedCampaign, selectedState, adminData?.organizationId, campaigns]);
    
    const filteredCampaigns = useMemo(() => {
        return campaigns.filter(c => c.stateAbbr === selectedState);
    }, [campaigns, selectedState]);
    
    const handlePromoterToggle = (promoterId: string) => {
        setSelectedPromoters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(promoterId)) newSet.delete(promoterId);
            else newSet.add(promoterId);
            return newSet;
        });
    };

    const handleSelectAllPromoters = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            const allIds = new Set(promoters.map(p => p.id));
            setSelectedPromoters(allIds);
        } else {
            setSelectedPromoters(new Set());
        }
    };
    
    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adminData?.organizationId || !adminData.email) {
            setError("Dados do administrador inválidos.");
            return;
        }
        if (!selectedCampaign || !selectedState) {
            setError("Selecione um estado e evento.");
            return;
        }
        if (selectedPromoters.size === 0) {
            setError("Selecione ao menos uma divulgadora.");
            return;
        }
        if (postType === 'image' && !imageFile) {
            setError("Selecione uma imagem para o post.");
            return;
        }
        if (postType === 'text' && !textContent.trim()) {
            setError("Escreva o conteúdo do post de texto.");
            return;
        }

        setIsSubmitting(true);
        setError('');
        try {
            const campaignDetails = campaigns.find(c => c.id === selectedCampaign);
            if (!campaignDetails) throw new Error("Detalhes do evento não encontrados.");

            const promotersToAssign = promoters.filter(p => selectedPromoters.has(p.id));

            let expiryTimestamp = null;
            if (expiresAt) {
                // Set timestamp to the end of the selected day in local time
                const [year, month, day] = expiresAt.split('-').map(Number);
                const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
                expiryTimestamp = Timestamp.fromDate(expiryDate);
            }

            const postData = {
                organizationId: adminData.organizationId,
                createdByEmail: adminData.email,
                campaignName: campaignDetails.name,
                stateAbbr: selectedState,
                type: postType,
                textContent: postType === 'text' ? textContent : '',
                instructions,
                isActive,
                expiresAt: expiryTimestamp,
                autoAssignToNewPromoters: autoAssign,
            };

            await createPost(postData, imageFile, promotersToAssign);
            
            alert('Publicação criada e divulgadoras notificadas com sucesso!');
            navigate('/admin/posts');

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
            <h1 className="text-3xl font-bold mb-6">Nova Publicação</h1>

            <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}

                {/* Step 1: Target */}
                <fieldset className="p-4 border border-gray-700 rounded-lg">
                    <legend className="px-2 font-semibold text-primary">1. Selecione o Alvo</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <select value={selectedState} onChange={e => { setSelectedState(e.target.value); setSelectedCampaign(''); setPromoters([]); setSelectedPromoters(new Set()); }} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                            <option value="" disabled>Selecione um Estado</option>
                            {assignedStates.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                         <select value={selectedCampaign} onChange={e => setSelectedCampaign(e.target.value)} disabled={!selectedState} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 disabled:opacity-50">
                            <option value="" disabled>Selecione um Evento</option>
                            {filteredCampaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                    </div>
                </fieldset>

                {/* Step 2: Promoters */}
                {selectedCampaign && (
                    <fieldset className="p-4 border border-gray-700 rounded-lg">
                        <legend className="px-2 font-semibold text-primary">2. Selecione as Divulgadoras</legend>
                        {isLoading ? <p>Carregando divulgadoras...</p> : promoters.length > 0 ? (
                            <>
                                <label className="flex items-center space-x-2 mb-2 p-1">
                                    <input type="checkbox" onChange={handleSelectAllPromoters} checked={selectedPromoters.size === promoters.length && promoters.length > 0} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                    <span>Selecionar Todas ({selectedPromoters.size}/{promoters.length})</span>
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 border border-gray-600 rounded-md">
                                    {promoters.map(p => (
                                        <label key={p.id} className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-700/50">
                                            <input type="checkbox" checked={selectedPromoters.has(p.id)} onChange={() => handlePromoterToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" />
                                            <span className="truncate" title={p.name}>{p.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </>
                        ) : <p className="text-gray-400">Nenhuma divulgadora aprovada para este evento.</p>}
                    </fieldset>
                )}

                {/* Step 3: Content */}
                <fieldset className="p-4 border border-gray-700 rounded-lg">
                     <legend className="px-2 font-semibold text-primary">3. Crie o Conteúdo</legend>
                     <div className="flex gap-4 mb-4">
                        <label className="flex items-center space-x-2"><input type="radio" name="postType" value="text" checked={postType === 'text'} onChange={() => setPostType('text')} /><span>Texto</span></label>
                        <label className="flex items-center space-x-2"><input type="radio" name="postType" value="image" checked={postType === 'image'} onChange={() => setPostType('image')} /><span>Imagem</span></label>
                     </div>
                     {postType === 'text' ? (
                        <textarea value={textContent} onChange={e => setTextContent(e.target.value)} placeholder="Digite o texto da publicação aqui..." rows={6} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                     ) : (
                        <div>
                            <input type="file" accept="image/*" onChange={handleImageChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />
                            {imagePreview && <img src={imagePreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />}
                        </div>
                     )}
                     <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instruções para a publicação (ex: marque nosso @, use a #, etc)" rows={4} className="mt-4 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                    
                     <div className="flex flex-col sm:flex-row items-center gap-6 mt-4">
                        <label className="flex items-center space-x-2">
                            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Ativo (visível para divulgadoras)</span>
                        </label>
                        <div>
                            <label className="block text-sm font-medium text-gray-400">Data Limite (opcional)</label>
                            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} />
                        </div>
                    </div>
                    <div className="mt-4">
                        <label className="flex items-center space-x-2 cursor-pointer" title="Se marcado, este post será automaticamente enviado para todas as novas divulgadoras que forem aprovadas para este evento no futuro.">
                            <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
                            <span>Atribuir automaticamente para novas divulgadoras</span>
                        </label>
                    </div>
                </fieldset>

                <div className="flex justify-end">
                    <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSubmitting ? 'Criando e Notificando...' : 'Criar e Enviar Publicação'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreatePost;