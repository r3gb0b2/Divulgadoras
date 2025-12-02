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
                            // For now, if we can't find exact match, we might need a workaround or accept it won't pre-select in UI correctly if it was