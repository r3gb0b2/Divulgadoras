
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { getAllCampaigns, getInstructionTemplates, addInstructionTemplate, updateInstructionTemplate, deleteInstructionTemplate, getLinkTemplates, addLinkTemplate, updateLinkTemplate, deleteLinkTemplate } from '../services/settingsService';
import { getApprovedPromoters } from '../services/promoterService';
import { createPost, getPostWithAssignments, schedulePost, getScheduledPostById, updateScheduledPost } from '../services/postService';
import { Campaign, Promoter, ScheduledPostData, InstructionTemplate, LinkTemplate, Timestamp } from '../types';
import { ArrowLeftIcon, LinkIcon } from '../components/Icons';
import { auth } from '../firebase/config';
import { storage } from '../firebase/config';
import firebase from 'firebase/compat/app';

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

interface ManageInstructionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTemplatesUpdated: () => void;
  organizationId: string;
}

const ManageInstructionsModal: React.FC<ManageInstructionsModalProps> = ({ isOpen, onClose, onTemplatesUpdated, organizationId }) => {
  const [templates, setTemplates] = useState<InstructionTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [newTemplateText, setNewTemplateText] = useState('');
  const [editingTemplate, setEditingTemplate] = useState<InstructionTemplate | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!organizationId) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await getInstructionTemplates(organizationId);
      setTemplates(data);
    } catch (err) {
      setError('Falha ao carregar os modelos.');
    } finally {
      setIsLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen, fetchTemplates]);

  if (!isOpen) return null;

  const handleAddTemplate = async () => {
    if (!newTemplateText.trim() || !organizationId) return;
    try {
      await addInstructionTemplate(newTemplateText, organizationId);
      setNewTemplateText('');
      await fetchTemplates();
      onTemplatesUpdated();
    } catch (err) {
      setError('Falha ao adicionar modelo.');
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !editingTemplate.text.trim()) return;
    try {
      await updateInstructionTemplate(editingTemplate.id, editingTemplate.text);
      setEditingTemplate(null);
      await fetchTemplates();
      onTemplatesUpdated();
    } catch (err) {
      setError('Falha ao atualizar modelo.');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (window.confirm('Tem certeza que deseja remover este modelo?')) {
      try {
        await deleteInstructionTemplate(id);
        await fetchTemplates();
        onTemplatesUpdated();
      } catch (err) {
        setError('Falha ao remover modelo.');
      }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
      <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-white">Gerenciar Modelos de Instruções</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
        </div>
        <div className="space-y-4 mb-4">
            <h3 className="text-lg font-semibold text-gray-200">Adicionar Novo Modelo</h3>
            <div className="flex flex-col gap-2">
                <textarea value={newTemplateText} onChange={(e) => setNewTemplateText(e.target.value)} placeholder="Digite o novo modelo de instruções aqui..." rows={4} className="flex-grow w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"/>
                <button onClick={handleAddTemplate} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark self-end">Adicionar</button>
            </div>
        </div>
        <div className="flex-grow overflow-y-auto border-t border-b border-gray-700 py-4">
            <h3 className="text-lg font-semibold text-gray-200 mb-2">Modelos Existentes</h3>
            {isLoading && <p>Carregando...</p>}
            {error && <p className="text-red-500">{error}</p>}
            <ul className="space-y-2">
                {templates.map(template => (
                    <li key={template.id} className="p-2 bg-gray-700/50 rounded-md">
                        {editingTemplate?.id === template.id ? (
                            <textarea value={editingTemplate.text} onChange={(e) => setEditingTemplate({ ...editingTemplate, text: e.target.value })} rows={4} className="w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-800"/>
                        ) : <p className="text-gray-200 whitespace-pre-wrap">{template.text}</p>}
                        <div className="flex gap-4 justify-end mt-2">
                            {editingTemplate?.id === template.id ? (
                                <><button onClick={handleUpdateTemplate} className="text-green-400 hover:text-green-300 text-sm">Salvar</button><button onClick={() => setEditingTemplate(null)} className="text-gray-400 hover:text-gray-300 text-sm">Cancelar</button></>
                            ) : (
                                <><button onClick={() => setEditingTemplate(template)} className="text-indigo-400 hover:text-indigo-300 text-sm">Editar</button><button onClick={() => handleDeleteTemplate(template.id)} className="text-red-400 hover:text-red-300 text-sm">Excluir</button></>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
        <div className="mt-6 flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">Fechar</button></div>
      </div>
    </div>
  );
};

interface ManageLinksModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTemplatesUpdated: () => void;
    organizationId: string;
}

const ManageLinksModal: React.FC<ManageLinksModalProps> = ({ isOpen, onClose, onTemplatesUpdated, organizationId }) => {
    const [templates, setTemplates] = useState<LinkTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [editingTemplate, setEditingTemplate] = useState<LinkTemplate | null>(null);

    const fetchTemplates = useCallback(async () => {
        if (!organizationId) return;
        setIsLoading(true);
        setError('');
        try {
            const data = await getLinkTemplates(organizationId);
            setTemplates(data);
        } catch (err) {
            setError('Falha ao carregar os modelos.');
        } finally {
            setIsLoading(false);
        }
    }, [organizationId]);

    useEffect(() => {
        if (isOpen) fetchTemplates();
    }, [isOpen, fetchTemplates]);

    if (!isOpen) return null;

    const handleAddTemplate = async () => {
        if (!newName.trim() || !newUrl.trim() || !organizationId) return;
        try {
            await addLinkTemplate(newName.trim(), newUrl.trim(), organizationId);
            setNewName('');
            setNewUrl('');
            await fetchTemplates();
            onTemplatesUpdated();
        } catch (err) {
            setError('Falha ao adicionar modelo.');
        }
    };

    const handleUpdateTemplate = async () => {
        if (!editingTemplate || !editingTemplate.name.trim() || !editingTemplate.url.trim()) return;
        try {
            await updateLinkTemplate(editingTemplate.id, editingTemplate.name, editingTemplate.url);
            setEditingTemplate(null);
            await fetchTemplates();
            onTemplatesUpdated();
        } catch (err) {
            setError('Falha ao atualizar modelo.');
        }
    };

    const handleDeleteTemplate = async (id: string) => {
        if (window.confirm('Tem certeza que deseja remover este modelo?')) {
            try {
                await deleteLinkTemplate(id);
                await fetchTemplates();
                onTemplatesUpdated();
            } catch (err) {
                setError('Falha ao remover modelo.');
            }
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-secondary rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-white">Gerenciar Modelos de Links</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-300 text-3xl">&times;</button>
                </div>
                <div className="space-y-4 mb-4">
                    <h3 className="text-lg font-semibold text-gray-200">Adicionar Novo Modelo</h3>
                    <div className="flex flex-col gap-2">
                        <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do Link (ex: Instagram Festa)" className="flex-grow w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"/>
                         <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="URL (ex: https://instagram.com/...)" className="flex-grow w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"/>
                        <button onClick={handleAddTemplate} className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary-dark self-end">Adicionar</button>
                    </div>
                </div>
                <div className="flex-grow overflow-y-auto border-t border-b border-gray-700 py-4">
                    <h3 className="text-lg font-semibold text-gray-200 mb-2">Modelos Existentes</h3>
                    {isLoading && <p>Carregando...</p>}
                    {error && <p className="text-red-500">{error}</p>}
                    <ul className="space-y-2">
                        {templates.map(template => (
                            <li key={template.id} className="p-2 bg-gray-700/50 rounded-md">
                                {editingTemplate?.id === template.id ? (
                                    <div className="flex flex-col gap-2">
                                        <input type="text" value={editingTemplate.name} onChange={(e) => setEditingTemplate({ ...editingTemplate, name: e.target.value })} className="w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-800"/>
                                         <input type="url" value={editingTemplate.url} onChange={(e) => setEditingTemplate({ ...editingTemplate, url: e.target.value })} className="w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-800"/>
                                    </div>
                                ) : (
                                    <div><p className="text-gray-200 font-semibold">{template.name}</p><p className="text-gray-400 text-sm truncate">{template.url}</p></div>
                                )}
                                <div className="flex gap-4 justify-end mt-2">
                                    {editingTemplate?.id === template.id ? (
                                        <><button onClick={handleUpdateTemplate} className="text-green-400 hover:text-green-300 text-sm">Salvar</button><button onClick={() => setEditingTemplate(null)} className="text-gray-400 hover:text-gray-300 text-sm">Cancelar</button></>
                                    ) : (
                                        <><button onClick={() => setEditingTemplate(template)} className="text-indigo-400 hover:text-indigo-300 text-sm">Editar</button><button onClick={() => handleDeleteTemplate(template.id)} className="text-red-400 hover:text-red-300 text-sm">Excluir</button></>
                                    )}
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="mt-6 flex justify-end"><button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">Fechar</button></div>
            </div>
        </div>
    );
};

const CreatePost: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { adminData, selectedOrgId } = useAdminAuth();
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [assignedStates, setAssignedStates] = useState<string[]>([]);
    const [instructionTemplates, setInstructionTemplates] = useState<InstructionTemplate[]>([]);
    const [linkTemplates, setLinkTemplates] = useState<LinkTemplate[]>([]);
    
    // Multi-select state for campaigns
    const [selectedState, setSelectedState] = useState('');
    const [selectedCampaigns, setSelectedCampaigns] = useState<Set<string>>(new Set());
    
    const [eventName, setEventName] = useState('');
    const [selectedPromoters, setSelectedPromoters] = useState<Set<string>>(new Set());
    const [postType, setPostType] = useState<'text' | 'image' | 'video'>('text');
    const [postFormats, setPostFormats] = useState<('story' | 'reels')[]>([]);
    const [textContent, setTextContent] = useState('');
    const [mediaFile, setMediaFile] = useState<File | null>(null);
    const [mediaPreview, setMediaPreview] = useState<string | null>(null);
    const [googleDriveUrl, setGoogleDriveUrl] = useState('');
    const [instructions, setInstructions] = useState('');
    const [postLink, setPostLink] = useState('');
    const [isActive, setIsActive] = useState(true);
    const [expiresAt, setExpiresAt] = useState('');
    const [autoAssign, setAutoAssign] = useState(false);
    const [allowLateSubmissions, setAllowLateSubmissions] = useState(false);
    const [allowImmediateProof, setAllowImmediateProof] = useState(false);
    const [skipProofRequirement, setSkipProofRequirement] = useState(false);
    const [allowJustification, setAllowJustification] = useState(true);
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [utcDisplayTime, setUtcDisplayTime] = useState<string | null>(null);
    const [editingScheduledPostId, setEditingScheduledPostId] = useState<string | null>(null);
    const [originalMediaPath, setOriginalMediaPath] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
    const [isLinksModalOpen, setIsLinksModalOpen] = useState(false);
    
    useEffect(() => {
        if (isScheduling && scheduleDate && scheduleTime) {
            const localDate = new Date(`${scheduleDate}T${scheduleTime}`);
            if (!isNaN(localDate.getTime())) {
                const utcHours = localDate.getUTCHours().toString().padStart(2, '0');
                const utcMinutes = localDate.getUTCMinutes().toString().padStart(2, '0');
                const userTimezoneOffset = -localDate.getTimezoneOffset() / 60;
                const timezoneString = `GMT${userTimezoneOffset >= 0 ? '+' : ''}${userTimezoneOffset}`;
                setUtcDisplayTime(`O envio ocorrerá às ${utcHours}:${utcMinutes} UTC (seu fuso horário: ${timezoneString}).`);
            } else setUtcDisplayTime(null);
        } else setUtcDisplayTime(null);
    }, [scheduleDate, scheduleTime, isScheduling]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!selectedOrgId || !adminData?.uid) { setError("Nenhuma organização selecionada ou admin não identificado."); setIsLoading(false); return; }
            try {
                const [orgData, allCampaigns, templatesData, linksData] = await Promise.all([
                    getOrganization(selectedOrgId),
                    getAllCampaigns(selectedOrgId),
                    getInstructionTemplates(selectedOrgId),
                    getLinkTemplates(selectedOrgId),
                ]);
                if (orgData?.assignedStates) setAssignedStates(orgData.assignedStates);
                setCampaigns(allCampaigns);
                setInstructionTemplates(templatesData);
                setLinkTemplates(linksData);
                const queryParams = new URLSearchParams(location.search);
                const fromPostId = queryParams.get('fromPost');
                const editScheduledId = queryParams.get('editScheduled');

                if (editScheduledId) {
                    setEditingScheduledPostId(editScheduledId);
                    const scheduledPost = await getScheduledPostById(editScheduledId);
                    if (scheduledPost && scheduledPost.organizationId === selectedOrgId) {
                        const { postData, assignedPromoters, scheduledAt } = scheduledPost;
                        setSelectedState(postData.stateAbbr);
                        setEventName(postData.eventName || '');
                        setPostType(postData.type);
                        setPostFormats(postData.postFormats || []);
                        setTextContent(postData.textContent || '');
                        setGoogleDriveUrl(postData.googleDriveUrl || '');
                        if ((postData.type === 'image' || postData.type === 'video') && postData.mediaUrl) {
                            setOriginalMediaPath(postData.mediaUrl);
                            if (postData.mediaUrl.startsWith('http')) setMediaPreview(postData.mediaUrl);
                            else storage.ref(postData.mediaUrl).getDownloadURL().then(url => setMediaPreview(url)).catch(console.error);
                        }
                        setInstructions(postData.instructions || '');
                        setPostLink(postData.postLink || '');
                        setIsActive(postData.isActive);
                        setExpiresAt(timestampToInputDate(postData.expiresAt));
                        setAutoAssign(postData.autoAssignToNewPromoters || false);
                        setAllowLateSubmissions(postData.allowLateSubmissions || false);
                        setAllowImmediateProof(postData.allowImmediateProof || false);
                        setSkipProofRequirement(postData.skipProofRequirement || false);
                        setAllowJustification(postData.allowJustification !== false);
                        setSelectedPromoters(new Set(assignedPromoters.map(p => p.id)));
                        setIsScheduling(true);
                        const scheduledDate = (scheduledAt as Timestamp).toDate();
                        const localScheduledDate = new Date(scheduledDate.getTime() - (scheduledDate.getTimezoneOffset() * 60000));
                        setScheduleDate(localScheduledDate.toISOString().split('T')[0]);
                        setScheduleTime(localScheduledDate.toTimeString().split(' ')[0].substring(0, 5));
                        
                        const campaign = allCampaigns.find(c => c.name === postData.campaignName && c.stateAbbr === postData.stateAbbr);
                        if (campaign) {
                            setSelectedCampaigns(new Set([campaign.id]));
                        } else {
                            setError("O evento/gênero original deste agendamento não foi encontrado. Por favor, selecione um novo evento.");
                        }
                    }
                } else if (fromPostId) { // Duplicating a post
                    const { post: postToDuplicate } = await getPostWithAssignments(fromPostId);
                    if (postToDuplicate.organizationId === selectedOrgId) {
                        setEventName(postToDuplicate.eventName || '');
                        setPostType(postToDuplicate.type);
                        setTextContent(postToDuplicate.textContent || '');
                        setGoogleDriveUrl(postToDuplicate.googleDriveUrl || '');
                        setInstructions(postToDuplicate.instructions || '');
                        setPostLink(postToDuplicate.postLink || '');
                        if (postToDuplicate.mediaUrl) {
                             setOriginalMediaPath(postToDuplicate.mediaUrl);
                             if (postToDuplicate.mediaUrl.startsWith('http')) {
                                setMediaPreview(postToDuplicate.mediaUrl);
                             } else {
                                storage.ref(postToDuplicate.mediaUrl).getDownloadURL().then(url => setMediaPreview(url)).catch(console.error);
                             }
                        }
                    }
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        loadInitialData();
    }, [location.search, selectedOrgId, adminData]);

    const handleCampaignChange = (campaignId: string) => {
        setSelectedCampaigns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(campaignId)) {
                newSet.delete(campaignId);
            } else {
                newSet.add(campaignId);
            }
            return newSet;
        });
        setSelectedPromoters(new Set());
    };
    
    const handlePromoterToggle = (id: string) => {
        setSelectedPromoters(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
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
        if (!selectedOrgId || !adminData?.email) { setError("Dados do administrador inválidos."); return; }
        if (selectedCampaigns.size === 0) { setError("Selecione pelo menos um evento/gênero."); return; }
        if (selectedPromoters.size === 0) { setError("Selecione pelo menos uma divulgadora."); return; }
        if ((postType === 'image' || postType === 'video') && !mediaFile && !googleDriveUrl && !originalMediaPath) { setError("Selecione um arquivo de mídia (upload) ou forneça um link do Google Drive."); return; }
        if (postType === 'text') {
            if (!postLink.trim()) {
                setError("O link da interação é obrigatório.");
                return;
            }
            // For interaction type, textContent is not used, but we can set a descriptive default
            setTextContent("Interação"); 
        }
        
        if (isScheduling && (!scheduleDate || !scheduleTime)) { setError("Defina a data e hora para o agendamento."); return; }
    
        setIsSubmitting(true);
        setError('');
    
        try {
            let uploadedMediaPath: string | undefined = originalMediaPath || undefined;
            if (mediaFile) {
                const fileExtension = mediaFile.name.split('.').pop();
                const fileName = `posts-media/${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                const storageRef = storage.ref(fileName);
                await storageRef.put(mediaFile);
                uploadedMediaPath = storageRef.fullPath;
            }

            const creationPromises = [];
    
            for (const campaignId of selectedCampaigns) {
                const campaign = campaigns.find(c => c.id === campaignId);
                if (!campaign) continue;
    
                const promotersForThisCampaign = promoters.filter(p => p.campaignName === campaign.name);
                const promotersToAssign = promotersForThisCampaign.filter(p => selectedPromoters.has(p.id));
    
                if (promotersToAssign.length === 0) continue;
    
                let expiryTimestamp: Date | null = null;
                if (expiresAt) {
                    const [year, month, day] = expiresAt.split('-').map(Number);
                    expiryTimestamp = new Date(Date.UTC(year, month - 1, day, 23, 59, 59));
                }
    
                const postPayload: ScheduledPostData = {
                    campaignName: campaign.name,
                    eventName: eventName.trim() || undefined,
                    stateAbbr: campaign.stateAbbr,
                    type: postType,
                    textContent: postType === 'text' ? undefined : (textContent || undefined), 
                    instructions,
                    postLink: postLink.trim() || undefined,
                    isActive,
                    expiresAt: expiryTimestamp ? firebase.firestore.Timestamp.fromDate(expiryTimestamp) : null,
                    autoAssignToNewPromoters: autoAssign,
                    allowLateSubmissions,
                    allowImmediateProof,
                    postFormats,
                    skipProofRequirement,
                    allowJustification,
                    googleDriveUrl: googleDriveUrl.trim() || undefined,
                    mediaUrl: uploadedMediaPath || undefined,
                };
    
                if (isScheduling) {
                    const scheduleDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
                    const scheduledData = {
                        organizationId: selectedOrgId,
                        postData: postPayload,
                        assignedPromoters: promotersToAssign.map(p => ({ id: p.id, email: p.email, name: p.name })),
                        scheduledAt: firebase.firestore.Timestamp.fromDate(scheduleDateTime),
                        status: 'pending' as 'pending',
                        createdByEmail: adminData.email,
                    };

                    if (editingScheduledPostId) {
                         // When editing a schedule, we assume it's for one event, so just update.
                         creationPromises.push(updateScheduledPost(editingScheduledPostId, scheduledData));
                    } else {
                        creationPromises.push(schedulePost(scheduledData));
                    }
                } else {
                    const finalPostData = { ...postPayload, organizationId: selectedOrgId, createdByEmail: adminData.email };
                    creationPromises.push(createPost(finalPostData, promotersToAssign));
                }
            }

            if(creationPromises.length === 0){
                throw new Error("Nenhuma divulgadora selecionada pertence aos eventos escolhidos.");
            }
    
            await Promise.all(creationPromises);
    
            if (isScheduling) {
                 alert(`${creationPromises.length} publicação(ões) agendada(s) com sucesso!`);
                 navigate('/admin/scheduled-posts');
            } else {
                 alert(`${creationPromises.length} publicação(ões) criada(s) e atribuída(s) com sucesso!`);
                 navigate('/admin/posts');
            }
    
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    useEffect(() => {
        const fetchPromotersForCampaign = async () => {
            if (selectedCampaigns.size === 0 || !selectedState) { setPromoters([]); return; }
            try {
                const campaignNames = Array.from(selectedCampaigns).map(id => campaigns.find(c => c.id === id)?.name).filter(Boolean) as string[];
                const approvedPromoters = await Promise.all(
                    campaignNames.map(name => getApprovedPromoters(selectedOrgId!, selectedState, name))
                );
                const flattened = approvedPromoters.flat();
                const unique = Array.from(new Map(flattened.map(p => [p.id, p])).values());
                unique.sort((a,b) => a.name.localeCompare(b.name));
                setPromoters(unique);
            } catch (err) { console.error(err); }
        };
        fetchPromotersForCampaign();
    }, [selectedCampaigns, selectedState, selectedOrgId, campaigns]);
    
    const campaignsForSelectedState = campaigns.filter(c => c.stateAbbr === selectedState);

    const selectablePromoters = useMemo(() => {
        return promoters.filter(p => p.hasJoinedGroup);
    }, [promoters]);

    const handleSelectAllPromoters = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            setSelectedPromoters(new Set(selectablePromoters.map(p => p.id)));
        } else {
            setSelectedPromoters(new Set());
        }
    };

    return (
        <div>
            {/* Modal Components */}
            {selectedOrgId && <ManageInstructionsModal isOpen={isInstructionsModalOpen} onClose={() => setIsInstructionsModalOpen(false)} onTemplatesUpdated={async () => setInstructionTemplates(await getInstructionTemplates(selectedOrgId))} organizationId={selectedOrgId} />}
            {selectedOrgId && <ManageLinksModal isOpen={isLinksModalOpen} onClose={() => setIsLinksModalOpen(false)} onTemplatesUpdated={async () => setLinkTemplates(await getLinkTemplates(selectedOrgId))} organizationId={selectedOrgId} />}

            <button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>
            <h1 className="text-3xl font-bold mb-6">{editingScheduledPostId ? "Editar Agendamento" : "Nova Publicação"}</h1>
            {isLoading ? <p>Carregando...</p> : (
                <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                     <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                        <legend className="px-2 font-semibold text-primary">Informações Básicas</legend>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Estado</label>
                            <select value={selectedState} onChange={e => { setSelectedState(e.target.value); setSelectedCampaigns(new Set()); }} required className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200">
                                <option value="" disabled>Selecione o Estado</option>
                                {assignedStates.map(abbr => <option key={abbr} value={abbr}>{abbr}</option>)}
                            </select>
                        </div>
                        {selectedState && (
                            <div>
                                <label className="block text-sm font-medium text-gray-300 mb-1">Evento / Gênero (pode selecionar mais de um)</label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                    {campaignsForSelectedState.map(c => (
                                        <label key={c.id} className="flex items-center space-x-2 p-2 bg-gray-800 rounded-md">
                                            <input 
                                                type="checkbox" 
                                                name="campaign" 
                                                value={c.id} 
                                                checked={selectedCampaigns.has(c.id)} 
                                                onChange={() => handleCampaignChange(c.id)}
                                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                            />
                                            <span>{c.name}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div>
                             <label className="block text-sm font-medium text-gray-300 mb-1">Nome do Evento (Opcional)</label>
                             <input type="text" placeholder="Ex: After Secreto, Lançamento de Coleção" value={eventName} onChange={e => setEventName(e.target.value)} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />
                        </div>
                    </fieldset>

                     <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                        <legend className="px-2 font-semibold text-primary">Conteúdo do Post</legend>
                        <div className="flex gap-4">
                            <label><input type="radio" name="type" value="text" checked={postType === 'text'} onChange={() => setPostType('text')} /> Interação</label>
                            <label><input type="radio" name="type" value="image" checked={postType === 'image'} onChange={() => setPostType('image')} /> Imagem</label>
                            <label><input type="radio" name="type" value="video" checked={postType === 'video'} onChange={() => setPostType('video')} /> Vídeo</label>
                        </div>
                        
                        {(postType === 'image' || postType === 'video') && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-300">Opção 1: Upload (Servidor)</label>
                                    <input type="file" accept={postType === 'image' ? "image/*" : "video/*"} onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />
                                    {mediaPreview && postType === 'image' && <img src={mediaPreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />}
                                    {mediaPreview && postType === 'video' && <video src={mediaPreview} controls className="mt-4 max-h-60 rounded-md" />}
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
                        
                        <div>
                            <div className="flex justify-between items-center mb-1"><label className="block text-sm font-medium text-gray-300">Instruções</label><button type="button" onClick={() => setIsInstructionsModalOpen(true)} className="text-xs text-primary hover:underline">Gerenciar Modelos</button></div>
                            <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instruções para a publicação" rows={6} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                            <select onChange={e => setInstructions(e.target.value)} className="mt-2 w-full px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700"><option value="">Usar um modelo de instrução...</option>{instructionTemplates.map(t => <option key={t.id} value={t.text}>{t.text.substring(0, 50)}...</option>)}</select>
                        </div>
                        
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-300">
                                    {postType === 'text' ? 'Link da Interação (Obrigatório)' : 'Link da Postagem'}
                                </label>
                                <button type="button" onClick={() => setIsLinksModalOpen(true)} className="text-xs text-primary hover:underline">Gerenciar Modelos</button>
                            </div>
                            <InputWithIcon 
                                Icon={LinkIcon} 
                                type="url" 
                                name="postLink" 
                                placeholder={postType === 'text' ? "Link para o conteúdo de interação" : "Link da Postagem (Ex: instagram)"} 
                                value={postLink} 
                                onChange={e => setPostLink(e.target.value)} 
                                required={postType === 'text'}
                            />
                            <select onChange={e => setPostLink(e.target.value)} className="mt-2 w-full px-3 py-1 text-sm border border-gray-600 rounded-md bg-gray-700"><option value="">Usar um modelo de link...</option>{linkTemplates.map(t => <option key={t.id} value={t.url}>{t.name}</option>)}</select>
                        </div>
                    </fieldset>

                    <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                        <legend className="px-2 font-semibold text-primary">Atribuir Divulgadoras ({selectedPromoters.size})</legend>
                        {promoters.length > 0 ? (
                            <>
                                <div className="flex justify-between items-center">
                                    <label className="flex items-center space-x-2 p-1 font-semibold cursor-pointer">
                                        <input
                                            type="checkbox"
                                            onChange={handleSelectAllPromoters}
                                            checked={selectablePromoters.length > 0 && selectablePromoters.every(p => selectedPromoters.has(p.id))}
                                            className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"
                                        />
                                        <span>Selecionar Divulgadoras no Grupo ({selectablePromoters.length})</span>
                                    </label>
                                </div>
                                <div className="max-h-60 overflow-y-auto border border-gray-600 rounded-md p-2 space-y-1">
                                    {promoters.map(p =>
                                        <label key={p.id} className={`flex items-center space-x-2 p-1 rounded ${p.hasJoinedGroup ? 'hover:bg-gray-700/50 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                                            <input
                                                type="checkbox"
                                                checked={selectedPromoters.has(p.id)}
                                                onChange={() => handlePromoterToggle(p.id)}
                                                disabled={!p.hasJoinedGroup}
                                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded disabled:cursor-not-allowed disabled:opacity-50"
                                            />
                                            <span className={`truncate ${p.hasJoinedGroup ? 'text-green-400 font-semibold' : 'text-gray-400'}`} title={`${p.name} ${p.hasJoinedGroup ? '(No grupo)' : '(Fora do grupo)'}`}>
                                                {p.name} ({p.instagram})
                                            </span>
                                        </label>
                                    )}
                                </div>
                            </>
                        ) : <p className="text-sm text-gray-400">Selecione um evento para ver as divulgadoras aprovadas.</p>}
                    </fieldset>

                    <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                        <legend className="px-2 font-semibold text-primary">Opções da Publicação</legend>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                            <label className="flex items-center space-x-2"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Post Ativo</span></label>
                            <label className="flex items-center space-x-2"><input type="checkbox" checked={autoAssign} onChange={e => setAutoAssign(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Atribuir para novas divulgadoras</span></label>
                            <label className="flex items-center space-x-2"><input type="checkbox" checked={allowLateSubmissions} onChange={e => setAllowLateSubmissions(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Permitir comprovação fora do prazo</span></label>
                            <label className="flex items-center space-x-2"><input type="checkbox" checked={allowImmediateProof} onChange={e => setAllowImmediateProof(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Liberar comprovação imediata</span></label>
                            <label className="flex items-center space-x-2"><input type="checkbox" checked={skipProofRequirement} onChange={e => setSkipProofRequirement(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Não exigir envio de print</span></label>
                            <label className="flex items-center space-x-2"><input type="checkbox" checked={allowJustification} onChange={e => setAllowJustification(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Permitir justificativas</span></label>
                            <div><label className="block text-sm font-medium text-gray-400 mb-1">Data Limite (opcional)</label><input type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} className="w-full px-3 py-1 border border-gray-600 rounded-md bg-gray-700" style={{colorScheme: 'dark'}}/></div>
                        </div>
                        <div><label className="block text-sm font-medium text-gray-300 mb-2">Formato (informativo):</label><div className="flex gap-6"><label className="flex items-center space-x-2"><input type="checkbox" checked={postFormats.includes('story')} onChange={() => setPostFormats(prev => prev.includes('story') ? prev.filter(f=>f!=='story') : [...prev, 'story'])} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Story</span></label><label className="flex items-center space-x-2"><input type="checkbox" checked={postFormats.includes('reels')} onChange={() => setPostFormats(prev => prev.includes('reels') ? prev.filter(f=>f!=='reels') : [...prev, 'reels'])} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Reels</span></label></div></div>
                    </fieldset>

                    <fieldset className="p-4 border border-gray-700 rounded-lg space-y-4">
                        <legend className="px-2 font-semibold text-primary">Agendamento</legend>
                        <label className="flex items-center space-x-2"><input type="checkbox" checked={isScheduling} onChange={e => setIsScheduling(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded"/><span>Agendar esta publicação</span></label>
                        {isScheduling && (
                            <div className="flex flex-col sm:flex-row gap-4 items-center">
                                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} required className="flex-grow w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" style={{colorScheme: 'dark'}} />
                                <input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} required className="flex-grow w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700" style={{colorScheme: 'dark'}} />
                            </div>
                        )}
                        {utcDisplayTime && <p className="text-xs text-yellow-400 text-center">{utcDisplayTime}</p>}
                    </fieldset>
                    
                    {error && <p className="text-red-400 text-sm">{error}</p>}
                    <div className="flex justify-end">
                        <button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">
                            {isSubmitting ? 'Salvando...' : (isScheduling ? (editingScheduledPostId ? "Atualizar Agendamento" : "Agendar Publicação") : "Criar e Atribuir")}
                        </button>
                    </div>
                </form>
            )}
        </div>
    );
};

export default CreatePost;
