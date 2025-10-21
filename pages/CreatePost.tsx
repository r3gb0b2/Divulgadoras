import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getApprovedPromoters } from '../services/promoterService';
import { createPost, getPostWithAssignments } from '../services/postService';
import { Campaign, Promoter } from '../types';
import { ArrowLeftIcon, LinkIcon } from '../components/Icons';
import { Timestamp } from 'firebase/firestore';
// FIX: Removed modular signOut import to use compat syntax.
import { auth } from '../firebase/config';
import { storage } from '../firebase/config';
import { ref, getDownloadURL } from 'firebase/storage';

const timestampToInputDate = (ts: Timestamp | undefined | null | any): string => {
    if (!ts) return '';
    let date;
    if (ts.toDate) { date = ts.toDate(); }
    else if (typeof ts === 'object' && (ts.seconds || ts._seconds)) {
        const seconds = ts.seconds || ts._seconds;
        date = new Date(seconds * 1000);
    } else { date = new Date(ts); }
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

const CreatePost: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { adminData, selectedOrgId } = useAdminAuth();

    // Data fetching states
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [assignedStates, setAssignedStates] = useState<string[]>([]);
    const [rulesHistory, setRulesHistory] = useState<string[]>([]);
    
    // Form states
    const [selectedState, setSelectedState] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [selectedPromoters, setSelectedPromoters] = useState<Set<string>>(new Set());
    const [postType, setPostType] = useState<'text' | 'image' | 'video'>('text');
    const [postFormats, setPostFormats] = useState<('story' | 'reels')[]>([]);
    const [textContent, setTextContent] = useState('');
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [videoUrl, setVideoUrl] = useState('');
    const [instructions, setInstructions] = useState('');
    const [postLink, setPostLink] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [expiresAt, setExpiresAt] = useState('');
    const [autoAssign, setAutoAssign] = useState(false);
    const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
    const [allowImmediateProof, setAllowImmediateProof] = useState(false);
    
    // UI states
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const loadInitialData = async () => {
            if (!selectedOrgId || !adminData?.uid) {
                setError("Nenhuma organização selecionada ou admin não identificado.");
                setIsLoading(false);
                return;
            }
            try {
                const [orgData, allCampaigns] = await Promise.all([
                    getOrganization(selectedOrgId),
                    getAllCampaigns(selectedOrgId)
                ]);

                if (orgData?.assignedStates) {
                    setAssignedStates(orgData.assignedStates);
                }
                setCampaigns(allCampaigns);
                
                const storedHistory = localStorage.getItem(`rulesHistory_${adminData.uid}`);
                if (storedHistory) {
                    setRulesHistory(JSON.parse(storedHistory));
                }

                // Check for duplication request
                const queryParams = new URLSearchParams(location.search);
                const fromPostId = queryParams.get('fromPost');
                if (fromPostId) {
                    const { post: originalPost } = await getPostWithAssignments(fromPostId);
                    // Pre-fill form fields, but not the target (state/campaign/promoters)
                    setPostType(originalPost.type);
                    setTextContent(originalPost.textContent || '');
                    setInstructions(originalPost.instructions || '');
                    setPostLink(originalPost.postLink || '');
                    setIsActive(originalPost.isActive);
                    setExpiresAt(timestampToInputDate(originalPost.expiresAt));
                    setAutoAssign(originalPost.autoAssignToNewPromoters || false);
                    setAllowLateSubmissions(originalPost.allowLateSubmissions || false);
                    setAllowImmediateProof(originalPost.allowImmediateProof || false);
                    if (originalPost.postFormats) {
                        setPostFormats(originalPost.postFormats);
                    }
                    if (originalPost.type === 'video' && originalPost.mediaUrl) {
                        setVideoUrl(originalPost.mediaUrl);
                    }
                    if (originalPost.type === 'image' && originalPost.mediaUrl) {
                        const storageRef = ref(storage, originalPost.mediaUrl);
                        getDownloadURL(storageRef).then(url => {
                            setMediaPreview(url);
                        }).catch(console.error);
                    }
                }

            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [adminData, location.search, selectedOrgId]);
    
    useEffect(() => {
        const fetchPromoters = async () => {
            if (selectedCampaign && selectedState && selectedOrgId) {
                setIsLoading(true);
                try {
                    const campaignDetails = campaigns.find(c => c.id === selectedCampaign);
                    if (campaignDetails) {
                        const promoterData = await getApprovedPromoters(selectedOrgId, selectedState, campaignDetails.name);
                        
                        // Sort promoters: those who joined the group first, then alphabetically.
                        promoterData.sort((a, b) => {
                            const aJoined = a.hasJoinedGroup ? 1 : 0;
                            const bJoined = b.hasJoinedGroup ? 1 : 0;
                            if (bJoined !== aJoined) {
                                return bJoined - aJoined; // Promoters in group come first (descending order of joined status)
                            }
                            return a.name.localeCompare(b.name); // Then sort by name alphabetically
                        });

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
    }, [selectedCampaign, selectedState, selectedOrgId, campaigns]);
    
    const handleLogout = async () => {
        try {
            // FIX: Use compat signOut method.
            await auth.signOut();
        } catch (error) {
            console.error("Logout failed", error);
        }
    };

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
            setMediaPreview(URL.createObjectURL(file));
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrgId || !adminData?.email) {
            setError("Dados do administrador inválidos ou organização não selecionada.");
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
        if (postType === 'image' && !mediaFile && !mediaPreview) {
            setError(`Selecione uma imagem para o post.`);
            return;
        }
        if (postType === 'video' && !videoUrl.trim()) {
            setError('Cole o link compartilhável do Google Drive para o vídeo.');
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
                organizationId: selectedOrgId,
                createdByEmail: adminData.email,
                campaignName: campaignDetails.name,
                stateAbbr: selectedState,
                type: postType,
                textContent: postType === 'text' ? textContent : '',
                mediaUrl: postType === 'video' ? videoUrl : undefined,
                instructions,
                postLink,
                isActive,
                expiresAt: expiryTimestamp,
                autoAssignToNewPromoters: autoAssign,
                allowLateSubmissions: allowLateSubmissions,
                allowImmediateProof: allowImmediateProof,
                postFormats: postFormats,
            };

            await createPost(postData, postType === 'image' ? mediaFile : null, promotersToAssign);
            
            if (instructions.trim() && adminData?.uid) {
                const newHistory = [instructions.trim(), ...rulesHistory.filter(r => r !== instructions.trim())].slice(0, 10);
                setRulesHistory(newHistory);
                localStorage.setItem(`rulesHistory_${adminData.uid}`, JSON.stringify(newHistory));
            }

            alert('Publicação criada com sucesso! As notificações para as divulgadoras estão sendo enviadas em segundo plano.');
            navigate('/admin/posts');

        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div>
            <div className="flex justify-between items-center">
                <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4">
                    <ArrowLeftIcon className="w-5 h-5" />
                    <span>Voltar</span>
                </button>
                {adminData?.role === 'poster' && (
                    <button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">
                        Sair
                    </button>
                )}
            </div>
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
                                            <input type="checkbox" checked={selectedPromoters.has(p.id)} onChange={() => handlePromoterToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded flex-shrink-0" />
                                            <span 
                                                className={`truncate ${p.hasJoinedGroup ? 'text-green-400 font-semibold' : ''}`}
                                                title={`${p.name} (${p.instagram})${p.hasJoinedGroup ? ' - no grupo' : ''}`}
                                            >
                                                {p.instagram || p.name}
                                            </span>
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
                        <label className="flex items-center space-x-2"><input type="radio" name="postType" value="video" checked={postType === 'video'} onChange={() => setPostType('video')} /><span>Vídeo (Google Drive)</span></label>
                     </div>
                     <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-400 mb-2">Formato (informativo):</label>
                        <div className="flex gap-6">
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
                     {postType === 'text' && (
                        <textarea value={textContent} onChange={e => setTextContent(e.target.value)} placeholder="Digite o texto da publicação aqui..." rows={6} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                     )}
                     {postType === 'image' && (
                        <div>
                            <input type="file" accept="image/*" onChange={handleFileChange} className="block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />
                            {mediaPreview && <img src={mediaPreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />}
                            {mediaPreview && !mediaFile && <p className="text-xs text-yellow-400 mt-2">Atenção: Esta é uma pré-visualização. Por favor, selecione um novo arquivo para esta publicação.</p>}
                        </div>
                     )}
                     {postType === 'video' && (
                        <div>
                            <input type="text" value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="Cole o link compartilhável do Google Drive" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                            <p className="text-xs text-gray-400 mt-2">
                                No Google Drive: clique com o botão direito no vídeo &gt; Compartilhar &gt; Altere para "Qualquer pessoa com o link" pode ser "Leitor" &gt; Copiar link.
                            </p>
                        </div>
                     )}
                     {rulesHistory.length > 0 && (
                        <div className="mt-4">
                            <label htmlFor="rules-history" className="block text-sm font-medium text-gray-400">Usar regras recentes:</label>
                            <select
                                id="rules-history"
                                onChange={(e) => {
                                    if (e.target.value) {
                                        setInstructions(e.target.value);
                                    }
                                }}
                                className="mt-1 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                            >
                                <option value="">Selecione para preencher...</option>
                                {rulesHistory.map((rule, index) => (
                                    <option key={index} value={rule}>
                                        {rule.substring(0, 80)}{rule.length > 80 ? '...' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                     )}
                     <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instruções para a publicação (ex: marque nosso @, use a #, etc)" rows={4} className="mt-4 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                    <div className="mt-4">
                       <InputWithIcon Icon={LinkIcon} type="url" name="postLink" placeholder="Link da Postagem (Ex: link do post no instagram)" value={postLink} onChange={e => setPostLink(e.target.value)} />
                    </div>
                </fieldset>
                
                {/* Step 4: Options */}
                <fieldset className="p-4 border border-gray-700 rounded-lg">
                    <legend className="px-2 font-semibold text-primary">4. Opções da Publicação</legend>
                    <div className="space-y-4">
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
                            <input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" />
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
                </fieldset>

                <div className="flex justify-end">
                    <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                        {isSubmitting ? 'Criando...' : 'Criar e Enviar Publicação'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default CreatePost;