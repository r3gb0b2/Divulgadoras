
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
                        if (postData.type === 'image' && postData.mediaUrl) {
                            setOriginalMediaPath(postData.mediaUrl);
                            if (postData.mediaUrl.startsWith('http')) setMediaPreview(postData.mediaUrl);
                            else storage.ref(postData.mediaUrl).getDownloadURL().then(url => setMediaPreview(url)).catch(console.error);
                        } else if (postData.type === 'video' && postData.mediaUrl) setGoogleDriveUrl(postData.googleDriveUrl || postData.mediaUrl || '');
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
                        
                        // Handle single campaign from edit
                        const campaign = allCampaigns.find(c => c.name === postData.campaignName && c.stateAbbr === postData.stateAbbr);
                        if (campaign) setSelectedCampaigns(new Set([campaign.id]));
                        else {
                            // Try to handle combined names if possible, but for simplicity just leave empty or try to match parts
                            // For now, if we can't find exact match, we might need a workaround or accept it won't pre-select in UI correctly if it was a combo
                        }
                    }
                } else if (fromPostId) {
                    const { post: originalPost } = await getPostWithAssignments(fromPostId);
                    setPostType(originalPost.type);
                    setTextContent(originalPost.textContent || '');
                    setInstructions(originalPost.instructions || '');
                    setPostLink(originalPost.postLink || '');
                    setEventName(originalPost.eventName || '');
                    setIsActive(originalPost.isActive);
                    setExpiresAt(timestampToInputDate(originalPost.expiresAt));
                    setAutoAssign(originalPost.autoAssignToNewPromoters || false);
                    setAllowLateSubmissions(originalPost.allowLateSubmissions || false);
                    setAllowImmediateProof(originalPost.allowImmediateProof || false);
                    setSkipProofRequirement(originalPost.skipProofRequirement || false);
                    setAllowJustification(originalPost.allowJustification !== false);
                    if (originalPost.postFormats) setPostFormats(originalPost.postFormats);
                    if (originalPost.googleDriveUrl) setGoogleDriveUrl(originalPost.googleDriveUrl);
                    if (originalPost.mediaUrl) {
                        setOriginalMediaPath(originalPost.mediaUrl);
                        if (originalPost.mediaUrl.startsWith('http')) setMediaPreview(originalPost.mediaUrl);
                        else storage.ref(originalPost.mediaUrl).getDownloadURL().then(url => setMediaPreview(url)).catch(console.error);
                    }
                }
            } catch (err: any) { setError(err.message); } finally { setIsLoading(false); }
        };
        loadInitialData();
    }, [adminData, location.search, selectedOrgId]);

    // Fetch Promoters when campaigns or state change
    useEffect(() => {
        const fetchPromoters = async () => {
            if (selectedCampaigns.size > 0 && selectedState && selectedOrgId) {
                setIsLoading(true);
                try {
                    const allPromotersMap = new Map<string, Promoter>();
                    
                    // Iterate through each selected campaign
                    for (const campId of selectedCampaigns) {
                        const campaignDetails = campaigns.find(c => c.id === campId);
                        if (campaignDetails) {
                            const promoterData = await getApprovedPromoters(selectedOrgId, selectedState, campaignDetails.name);
                            promoterData.forEach(p => allPromotersMap.set(p.id, p)); // Deduplicate by ID
                        }
                    }
                    
                    const uniquePromoters = Array.from(allPromotersMap.values());
                    
                    uniquePromoters.sort((a, b) => {
                        const aJoined = a.hasJoinedGroup ? 1 : 0;
                        const bJoined = b.hasJoinedGroup ? 1 : 0;
                        if (bJoined !== aJoined) return bJoined - aJoined;
                        return a.name.localeCompare(b.name);
                    });
                    setPromoters(uniquePromoters);
                } catch(err: any) { setError(err.message); } finally { setIsLoading(false); }
            } else {
                setPromoters([]);
            }
        };
        fetchPromoters();
    }, [selectedCampaigns, selectedState, selectedOrgId, campaigns]);
    
    const handleLogout = async () => { try { await auth.signOut(); } catch (error) { console.error("Logout failed", error); } };
    const handleRefreshTemplates = async () => { if (!selectedOrgId) return; const templatesData = await getInstructionTemplates(selectedOrgId); setInstructionTemplates(templatesData); };
    const handleRefreshLinkTemplates = async () => { if (!selectedOrgId) return; const linksData = await getLinkTemplates(selectedOrgId); setLinkTemplates(linksData); };
    
    const filteredCampaigns = useMemo(() => campaigns.filter(c => c.stateAbbr === selectedState), [campaigns, selectedState]);
    
    const handleCampaignToggle = (campaignId: string) => {
        setSelectedCampaigns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(campaignId)) newSet.delete(campaignId);
            else newSet.add(campaignId);
            return newSet;
        });
        // Clear previous selection logic handled by useEffect
        setSelectedPromoters(new Set());
    };

    const handlePromoterToggle = (promoterId: string) => setSelectedPromoters(prev => { const newSet = new Set(prev); if (newSet.has(promoterId)) newSet.delete(promoterId); else newSet.add(promoterId); return newSet; });
    
    const handleSelectAllPromoters = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.checked) {
            // Select ONLY promoters who have joined the group
            const inGroupPromoters = promoters.filter(p => p.hasJoinedGroup);
            setSelectedPromoters(new Set(inGroupPromoters.map(p => p.id)));
        } else {
            setSelectedPromoters(new Set());
        }
    };
    
    const handleFormatChange = (format: 'story' | 'reels') => setPostFormats(prev => prev.includes(format) ? prev.filter(f => f !== format) : [...prev, format]);
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) { setMediaFile(file); setMediaPreview(URL.createObjectURL(file)); } }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedOrgId || !adminData?.email) { setError("Dados do administrador inválidos ou organização não selecionada."); return; }
        if (selectedCampaigns.size === 0 || !selectedState) { setError("Selecione um estado e pelo menos um evento."); return; }
        if (selectedPromoters.size === 0) { setError("Selecione ao menos uma divulgadora."); return; }
        if (postType === 'image' && !mediaFile && !mediaPreview && !googleDriveUrl) { setError(`Selecione uma imagem ou forneça um link do Google Drive.`); return; }
        if (postType === 'video' && !mediaFile && !mediaPreview && !googleDriveUrl.trim()) { setError('Faça o upload de um vídeo ou forneça um link do Google Drive.'); return; }
        if (postType === 'text' && !textContent.trim()) { setError("Escreva o conteúdo do post de texto."); return; }

        setIsSubmitting(true);
        setError('');
        try {
            // Construct a combined name if multiple campaigns are selected
            const selectedCampaignDetails = campaigns.filter(c => selectedCampaigns.has(c.id));
            let finalCampaignName = selectedCampaignDetails.length === 1 
                ? selectedCampaignDetails[0].name 
                : selectedCampaignDetails.map(c => c.name).join(" + ");
            
            // Truncate if too long for display safety
            if (finalCampaignName.length > 50 && selectedCampaignDetails.length > 1) {
                finalCampaignName = `${selectedCampaignDetails.length} Eventos Selecionados`;
            }

            const promotersToAssignFull = promoters.filter(p => selectedPromoters.has(p.id));
            const promotersToAssignMapped = promotersToAssignFull.map(p => ({ id: p.id, email: p.email, name: p.name }));
            let expiryTimestamp: Date | null = null;
            if (expiresAt) { const [year, month, day] = expiresAt.split('-').map(Number); expiryTimestamp = new Date(year, month - 1, day, 23, 59, 59); }

            const basePostData: Omit<ScheduledPostData, 'mediaUrl'> & { mediaUrl?: string } = {
                campaignName: finalCampaignName,
                eventName: eventName.trim() || undefined,
                stateAbbr: selectedState,
                type: postType,
                textContent: postType === 'text' ? textContent : '',
                googleDriveUrl: googleDriveUrl.trim() || undefined,
                instructions,
                postLink,
                isActive,
                expiresAt: expiryTimestamp ? firebase.firestore.Timestamp.fromDate(expiryTimestamp) : null,
                autoAssignToNewPromoters: autoAssign,
                allowLateSubmissions: allowLateSubmissions,
                allowImmediateProof: allowImmediateProof,
                postFormats: postFormats,
                skipProofRequirement: skipProofRequirement,
                allowJustification: allowJustification,
            };
            
            if (editingScheduledPostId) {
                let scheduledMediaUrl: string | undefined = undefined;
                if (postType === 'image' || postType === 'video') {
                    if (mediaFile) {
                        const fileExtension = mediaFile.name.split('.').pop();
                        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                        const storageRef = storage.ref(`posts-media/${fileName}`);
                        await storageRef.put(mediaFile);
                        scheduledMediaUrl = storageRef.fullPath;
                    } else { scheduledMediaUrl = originalMediaPath || undefined; }
                }
                
                const postDataForUpdate: ScheduledPostData = { ...basePostData, mediaUrl: scheduledMediaUrl };
                const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
                const scheduledTimestamp = firebase.firestore.Timestamp.fromDate(scheduledDateTime);
                const cleanPostData = JSON.parse(JSON.stringify(postDataForUpdate));

                await updateScheduledPost(editingScheduledPostId, { postData: cleanPostData, assignedPromoters: promotersToAssignMapped, scheduledAt: scheduledTimestamp });
                alert('Agendamento atualizado com sucesso!');
                navigate('/admin/scheduled-posts');

            } else if (isScheduling) {
                 if (!scheduleDate || !scheduleTime) throw new Error("Por favor, selecione data e hora para agendar.");
                let scheduledMediaUrl: string | undefined = undefined;
                if ((postType === 'image' || postType === 'video')) {
                    if (mediaFile) {
                        const fileExtension = mediaFile.name.split('.').pop();
                        const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                        const storageRef = storage.ref(`posts-media/${fileName}`);
                        await storageRef.put(mediaFile);
                        scheduledMediaUrl = storageRef.fullPath;
                    } else {
                        scheduledMediaUrl = originalMediaPath || undefined;
                    }
                }
                const postDataForScheduling: ScheduledPostData = { ...basePostData, mediaUrl: scheduledMediaUrl };
                const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
                const scheduledTimestamp = firebase.firestore.Timestamp.fromDate(scheduledDateTime);
                const cleanPostData = JSON.parse(JSON.stringify(postDataForScheduling));

                await schedulePost({ postData: cleanPostData, assignedPromoters: promotersToAssignMapped, scheduledAt: scheduledTimestamp, organizationId: selectedOrgId, createdByEmail: adminData.email, status: 'pending' });
                alert('Publicação agendada com sucesso!');
                navigate('/admin/scheduled-posts');

            } else {
                const postDataForImmediate = {
                    ...basePostData,
                    organizationId: selectedOrgId,
                    createdByEmail: adminData.email,
                    mediaUrl: (mediaFile ? undefined : originalMediaPath) || undefined
                };
                await createPost(postDataForImmediate, mediaFile, promotersToAssignFull);
                alert('Publicação criada com sucesso! As notificações para as divulgadoras estão sendo enviadas em segundo plano.');
                navigate('/admin/posts');
            }
        } catch (err: any) { setError(err.message); } finally { setIsSubmitting(false); }
    };

    return (
        <div>
            <div className="flex justify-between items-center"><button onClick={() => navigate(-1)} className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:text-primary-dark transition-colors mb-4"><ArrowLeftIcon className="w-5 h-5" /><span>Voltar</span></button>{adminData?.role === 'poster' && (<button onClick={handleLogout} className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm">Sair</button>)}</div>
            <h1 className="text-3xl font-bold mb-6">{editingScheduledPostId ? 'Editar Agendamento' : 'Nova Publicação'}</h1>
            <form onSubmit={handleSubmit} className="bg-secondary shadow-lg rounded-lg p-6 space-y-6">
                {error && <div className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm font-semibold">{error}</div>}
                
                <fieldset className="p-4 border border-gray-700 rounded-lg">
                    <legend className="px-2 font-semibold text-primary">1. Selecione o Alvo</legend>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Estado</label>
                            <select 
                                value={selectedState} 
                                onChange={e => { setSelectedState(e.target.value); setSelectedCampaigns(new Set()); setPromoters([]); setSelectedPromoters(new Set()); }} 
                                className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"
                            >
                                <option value="" disabled>Selecione um Estado</option>
                                {assignedStates.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Eventos / Gêneros (Multi-seleção)</label>
                            <div className="w-full h-40 overflow-y-auto border border-gray-600 rounded-md bg-gray-700 p-2">
                                {selectedState ? (
                                    filteredCampaigns.map(c => (
                                        <label key={c.id} className={`flex items-center space-x-2 p-1.5 rounded hover:bg-gray-600 cursor-pointer ${c.status === 'inactive' ? 'opacity-50' : ''}`}>
                                            <input 
                                                type="checkbox" 
                                                checked={selectedCampaigns.has(c.id)} 
                                                onChange={() => handleCampaignToggle(c.id)}
                                                disabled={c.status === 'inactive'}
                                                className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"
                                            />
                                            <span className="text-gray-200 text-sm">
                                                {c.name} {c.status !== 'active' ? `(${c.status === 'inactive' ? 'Inativo' : 'Oculto'})` : ''}
                                            </span>
                                        </label>
                                    ))
                                ) : (
                                    <p className="text-gray-400 text-sm p-2">Selecione um estado primeiro.</p>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mt-1">Marque todos os eventos para os quais deseja enviar.</p>
                        </div>
                    </div>
                     <div className="mt-4"><input type="text" value={eventName} onChange={e => setEventName(e.target.value)} placeholder="Nome do Evento (Opcional, ex: Festa Neon)" className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"/></div>
                </fieldset>

                {selectedCampaigns.size > 0 && (
                    <fieldset className="p-4 border border-gray-700 rounded-lg">
                        <legend className="px-2 font-semibold text-primary">2. Selecione as Divulgadoras</legend>
                        {isLoading ? <p>Carregando divulgadoras...</p> : promoters.length > 0 ? (
                            <>
                                <label className="flex items-center space-x-2 mb-2 p-1 bg-gray-700/50 rounded cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        onChange={handleSelectAllPromoters} 
                                        className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded" 
                                    />
                                    <span>Selecionar Todas do Grupo ({promoters.filter(p => p.hasJoinedGroup).length} disponíveis)</span>
                                </label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto p-2 border border-gray-600 rounded-md">
                                    {promoters.map(p => (
                                        <label key={p.id} className="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-700/50">
                                            <input type="checkbox" checked={selectedPromoters.has(p.id)} onChange={() => handlePromoterToggle(p.id)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded flex-shrink-0" />
                                            <span className={`truncate text-sm ${p.hasJoinedGroup ? 'text-green-400 font-semibold' : 'text-gray-400'}`} title={`${p.name} (${p.instagram})${p.hasJoinedGroup ? ' - no grupo' : ' - fora do grupo'}`}>
                                                {p.instagram || p.name}
                                            </span>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-xs text-gray-400 mt-2">* Nomes em verde estão no grupo do WhatsApp.</p>
                            </>
                        ) : (
                            <p className="text-gray-400">Nenhuma divulgadora aprovada encontrada para os eventos selecionados.</p>
                        )}
                    </fieldset>
                )}

                <fieldset className="p-4 border border-gray-700 rounded-lg"><legend className="px-2 font-semibold text-primary">3. Crie o Conteúdo</legend>
                     <div className="flex gap-4 mb-4"><label className="flex items-center space-x-2"><input type="radio" name="postType" value="text" checked={postType === 'text'} onChange={() => setPostType('text')} /><span>Texto</span></label><label className="flex items-center space-x-2"><input type="radio" name="postType" value="image" checked={postType === 'image'} onChange={() => setPostType('image')} /><span>Imagem</span></label><label className="flex items-center space-x-2"><input type="radio" name="postType" value="video" checked={postType === 'video'} onChange={() => setPostType('video')} /><span>Vídeo</span></label></div>
                     <div className="mb-4"><label className="block text-sm font-medium text-gray-400 mb-2">Formato (informativo):</label><div className="flex gap-6"><label className="flex items-center space-x-2"><input type="checkbox" checked={postFormats.includes('story')} onChange={() => handleFormatChange('story')} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"/><span>Story</span></label><label className="flex items-center space-x-2"><input type="checkbox" checked={postFormats.includes('reels')} onChange={() => handleFormatChange('reels')} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary"/><span>Reels</span></label></div></div>
                     {postType === 'text' && (<textarea value={textContent} onChange={e => setTextContent(e.target.value)} placeholder="Digite o texto da publicação aqui..." rows={6} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" />)}
                     {postType === 'image' && (<div className="space-y-4"><div><label className="block text-sm font-medium text-gray-300">Opção 1: Upload para Servidor</label><input type="file" accept="image/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />{mediaPreview && <img src={mediaPreview} alt="Preview" className="mt-4 max-h-60 rounded-md" />}</div><div className="flex items-center gap-2"><hr className="flex-grow border-gray-600" /><span className="text-xs text-gray-400">E/OU</span><hr className="flex-grow border-gray-600" /></div><div><label className="block text-sm font-medium text-gray-300">Opção 2: Link do Google Drive</label><InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Cole o link compartilhável do Google Drive" value={googleDriveUrl} onChange={e => setGoogleDriveUrl(e.target.value)} /></div></div>)}
                      {postType === 'video' && (<div className="space-y-4"><div><label className="block text-sm font-medium text-gray-300">Opção 1: Upload para Servidor</label><input type="file" accept="video/*" onChange={handleFileChange} className="mt-1 block w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-primary-dark" />{mediaPreview && <video src={mediaPreview} controls className="mt-4 max-h-60 rounded-md" />}</div><div className="flex items-center gap-2"><hr className="flex-grow border-gray-600" /><span className="text-xs text-gray-400">E/OU</span><hr className="flex-grow border-gray-600" /></div><div><label className="block text-sm font-medium text-gray-300">Opção 2: Link do Google Drive</label><p className="text-xs text-gray-400 mb-2">No Google Drive: clique com o botão direito no vídeo &gt; Compartilhar &gt; Altere para "Qualquer pessoa com o link" &gt; Copiar link.</p><InputWithIcon Icon={LinkIcon} type="url" name="googleDriveUrl" placeholder="Cole o link compartilhável do Google Drive" value={googleDriveUrl} onChange={e => setGoogleDriveUrl(e.target.value)} /></div></div>)}
                     <div className="mt-4"><div className="flex justify-between items-center mb-1"><label htmlFor="instruction-templates" className="block text-sm font-medium text-gray-400">Usar modelo de instrução:</label><button type="button" onClick={() => setIsInstructionsModalOpen(true)} className="text-xs text-primary hover:underline">Gerenciar Modelos</button></div><select id="instruction-templates" onChange={(e) => { if (e.target.value) { setInstructions(e.target.value); } }} className="w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200"><option value="">Selecione para preencher...</option>{instructionTemplates.map((template) => (<option key={template.id} value={template.text}>{template.text.substring(0, 80)}{template.text.length > 80 ? '...' : ''}</option>))}</select></div>
                     <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Instruções para a publicação (ex: marque nosso @, use a #, etc)" rows={4} className="mt-4 w-full px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200" required />
                    <div className="mt-4"><div className="flex justify-between items-center mb-1"><label className="block text-sm font-medium text-gray-300">Link da Postagem</label><button type="button" onClick={() => setIsLinksModalOpen(true)} className="text-xs text-primary hover:underline">Gerenciar Links</button></div><div className="flex gap-2"><div className="flex-grow"><InputWithIcon Icon={LinkIcon} type="url" name="postLink" placeholder="Link da Postagem (Ex: link do post no instagram)" value={postLink} onChange={e => setPostLink(e.target.value)} /></div><select onChange={(e) => { if (e.target.value) setPostLink(e.target.value); }} className="w-1/3 px-3 py-2 border border-gray-600 rounded-md bg-gray-700 text-gray-200 text-sm"><option value="">Modelos...</option>{linkTemplates.map((template) => (<option key={template.id} value={template.url}>{template.name}</option>))}</select></div></div>
                </fieldset>
                <fieldset className="p-4 border border-gray-700 rounded-lg"><legend className="px-2 font-semibold text-primary">4. Opções da Publicação</legend><div className="space-y-4"><div className="flex flex-col sm:flex-row items-start sm:items-center gap-6"><label className="flex items-center space-x-2 pt-2"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" /><span>Ativo (visível para divulgadoras)</span></label><div><label className="block text-sm font-medium text-gray-400">Data Limite (opcional)</label><input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="mt-1 px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} /></div></div><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={autoAssign} onChange={(e) => setAutoAssign(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" /><span>Atribuir automaticamente para novas divulgadoras</span></label><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={allowLateSubmissions} onChange={(e) => setAllowLateSubmissions(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" /><span>Permitir envio de comprovação fora do prazo</span></label><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={allowImmediateProof} onChange={(e) => setAllowImmediateProof(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" /><span>Liberar envio de comprovação imediato</span></label><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={skipProofRequirement} onChange={(e) => setSkipProofRequirement(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" /><span>Não exigir envio de print (conclusão automática)</span></label><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={allowJustification} onChange={(e) => setAllowJustification(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" /><span>Permitir envio de justificativa</span></label></div></fieldset>
                <fieldset className="p-4 border border-gray-700 rounded-lg"><legend className="px-2 font-semibold text-primary">5. Envio</legend><label className="flex items-center space-x-2 cursor-pointer"><input type="checkbox" checked={isScheduling} onChange={(e) => setIsScheduling(e.target.checked)} className="h-4 w-4 text-primary bg-gray-700 border-gray-500 rounded focus:ring-primary" /><span>Agendar Publicação</span></label>{isScheduling && (<div className="flex flex-col sm:flex-row gap-4 mt-4"><div><label className="block text-sm font-medium text-gray-400">Data do Envio</label><input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} required={isScheduling} className="mt-1 px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} /></div><div><label className="block text-sm font-medium text-gray-400">Hora do Envio</label><input type="time" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} required={isScheduling} className="mt-1 px-3 py-1 border border-gray-600 rounded-md bg-gray-700 text-gray-200" style={{ colorScheme: 'dark' }} /></div></div>)}{utcDisplayTime && (<p className="text-xs text-blue-300 bg-blue-900/30 p-2 rounded-md mt-3">{utcDisplayTime}</p>)}</fieldset>
                <div className="flex justify-end"><button type="submit" disabled={isSubmitting} className="px-6 py-3 bg-primary text-white font-semibold rounded-md hover:bg-primary-dark disabled:opacity-50">{isSubmitting ? (editingScheduledPostId ? 'Salvando...' : (isScheduling ? 'Agendando...' : 'Criando...')) : (editingScheduledPostId ? 'Salvar Alterações' : (isScheduling ? 'Agendar Publicação' : 'Criar e Enviar Publicação'))}</button></div>
            </form>
            {selectedOrgId && (<><ManageInstructionsModal isOpen={isInstructionsModalOpen} onClose={() => setIsInstructionsModalOpen(false)} onTemplatesUpdated={handleRefreshTemplates} organizationId={selectedOrgId}/><ManageLinksModal isOpen={isLinksModalOpen} onClose={() => setIsLinksModalOpen(false)} onTemplatesUpdated={handleRefreshLinkTemplates} organizationId={selectedOrgId}/></>)}
        </div>
    );
};

export default CreatePost;
