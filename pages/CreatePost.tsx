import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganization } from '../services/organizationService';
import { getAllCampaigns, getInstructionTemplates, addInstructionTemplate, updateInstructionTemplate, deleteInstructionTemplate } from '../services/settingsService';
import { getApprovedPromoters } from '../services/promoterService';
import { createPost, getPostWithAssignments, schedulePost } from '../services/postService';
import { Campaign, Promoter, ScheduledPostData, InstructionTemplate } from '../types';
import { ArrowLeftIcon, LinkIcon } from '../components/Icons';
import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
// FIX: Removed modular signOut import to use compat syntax.
import { auth } from '../firebase/config';
import { storage } from '../firebase/config';
import { ref, getDownloadURL, uploadBytes } from 'firebase/storage';
// FIX: 'Timestamp' refers to a value, but is being used as a type here. Imported the type directly.
import { Timestamp } from 'firebase/firestore';

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

// ===================================================================
// START: Modal Component defined within the same file for convenience
// ===================================================================
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

  if (!isOpen) {
    return null;
  }

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
                <textarea
                    value={newTemplateText}
                    onChange={(e) => setNewTemplateText(e.target.value)}
                    placeholder="Digite o novo modelo de instruções aqui..."
                    rows={4}
                    className="flex-grow w-full px-3 py-2 border border-gray-600 rounded-md shadow-sm bg-gray-700 text-gray-200 focus:outline-none focus:ring-primary focus:border-primary"
                />
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
                            <textarea
                                value={editingTemplate.text}
                                onChange={(e) => setEditingTemplate({ ...editingTemplate, text: e.target.value })}
                                rows={4}
                                className="w-full px-2 py-1 border border-gray-600 rounded-md bg-gray-800"
                            />
                        ) : (
                            <p className="text-gray-200 whitespace-pre-wrap">{template.text}</p>
                        )}
                        <div className="flex gap-4 justify-end mt-2">
                            {editingTemplate?.id === template.id ? (
                                <>
                                    <button onClick={handleUpdateTemplate} className="text-green-400 hover:text-green-300 text-sm">Salvar</button>
                                    <button onClick={() => setEditingTemplate(null)} className="text-gray-400 hover:text-gray-300 text-sm">Cancelar</button>
                                </>
                            ) : (
                                <>
                                    <button onClick={() => setEditingTemplate(template)} className="text-indigo-400 hover:text-indigo-300 text-sm">Editar</button>
                                    <button onClick={() => handleDeleteTemplate(template.id)} className="text-red-400 hover:text-red-300 text-sm">Excluir</button>
                                </>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
        </div>
        <div className="mt-6 flex justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 bg-gray-600 text-gray-200 rounded-md hover:bg-gray-500">
              Fechar
            </button>
        </div>
      </div>
    </div>
  );
};
// ===================================================================
// END: Modal Component
// ===================================================================


// FIX: Changed to a named export to resolve module export issue in AdminAuth.tsx.
export const CreatePost: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { adminData, selectedOrgId } = useAdminAuth();

    // Data fetching states
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [assignedStates, setAssignedStates] = useState<string[]>([]);
    const [instructionTemplates, setInstructionTemplates] = useState<InstructionTemplate[]>([]);
    
    // Form states
    const [selectedState, setSelectedState] = useState('');
    const [selectedCampaign, setSelectedCampaign] = useState('');
    const [eventName, setEventName] = useState('');
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
    
    // Scheduling state
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [utcDisplayTime, setUtcDisplayTime] = useState<string | null>(null);


    // UI states
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
    
    useEffect(() => {
        if (isScheduling && scheduleDate && scheduleTime) {
            const localDate = new Date(`${scheduleDate}T${scheduleTime}`);
            if (!isNaN(localDate.getTime())) {
                const utcHours = localDate.getUTCHours().toString().padStart(2, '0');
                const utcMinutes = localDate.getUTCMinutes().toString().padStart(2, '0');
                const userTimezoneOffset = -localDate.getTimezoneOffset() / 60;
                const timezoneString = `GMT${userTimezoneOffset >= 0 ? '+' : ''}${userTimezoneOffset}`;
                
                setUtcDisplayTime(`O envio ocorrerá às ${utcHours}:${utcMinutes} UTC (seu fuso horário: ${timezoneString}).`);
            } else {
                setUtcDisplayTime(null);
            }
        } else {
            setUtcDisplayTime(null);
        }
    }, [scheduleDate, scheduleTime, isScheduling]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!selectedOrgId || !adminData?.uid) {
                setError("Nenhuma organização selecionada ou admin não identificado.");
                setIsLoading(false);
                return;
            }
            try {
                const [orgData, allCampaigns, templatesData] = await Promise.all([
                    getOrganization(selectedOrgId),
                    getAllCampaigns(selectedOrgId),
                    getInstructionTemplates(selectedOrgId),
                ]);

                if (orgData?.assignedStates) {
                    setAssignedStates(orgData.assignedStates);
                }
                setCampaigns(allCampaigns);
                setInstructionTemplates(templatesData);
                
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
                    setEventName(originalPost.eventName || '');
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

    const handleRefreshTemplates = async () => {
        if (!selectedOrgId) return;
        const templatesData = await getInstructionTemplates(selectedOrgId);
        setInstructionTemplates(templatesData);
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

            const promotersToAssign = promoters
                .filter(p => selectedPromoters.has(p.id))
                .map(p => ({ id: p.id, email: p.email, name: p.name }));

            let expiryTimestamp = null;
            if (expiresAt) {
                const [year, month, day] = expiresAt.split('-').map(Number);
                const expiryDate = new Date(year, month - 1, day, 23, 59, 59);
                expiryTimestamp = Timestamp.fromDate(expiryDate);
            }

            const basePostData = {
                campaignName: campaignDetails.name,
                eventName: eventName.trim() || undefined,
                stateAbbr: selectedState,
                type: postType,
                textContent: postType === 'text' ? textContent : '',
                instructions,
                postLink,
                isActive,
                expiresAt: expiryTimestamp,
                autoAssignToNewPromoters: autoAssign,
                allowLateSubmissions: allowLateSubmissions,
                allowImmediateProof: allowImmediateProof,
                postFormats: postFormats,
            };
            
            if (isScheduling) {
                 if (!scheduleDate || !scheduleTime) {
                    throw new Error("Por favor, selecione data e hora para agendar.");
                }

                let scheduledMediaUrl: string | undefined = undefined;
                if (postType === 'image' && mediaFile) {
                    // Upload now, save the storage path
                    const fileExtension = mediaFile.name.split('.').pop();
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExtension}`;
                    const storageRef = ref(storage, `posts-media/${fileName}`);
                    await uploadBytes(storageRef, mediaFile);
                    scheduledMediaUrl = storageRef.fullPath;
                } else if (postType === 'video') {
                    scheduledMediaUrl = videoUrl;
                }
                
                const postDataForScheduling: ScheduledPostData = {
                    ...basePostData,
                    mediaUrl: scheduledMediaUrl,
                };

                const scheduledDateTime = new Date(`${scheduleDate}T${scheduleTime}`);
                const scheduledTimestamp = Timestamp.fromDate(scheduledDateTime);
                
                const payload = {
                    postData: postDataForScheduling,
                    assignedPromoters: promotersToAssign,
                    scheduledAt: scheduledTimestamp,
                    organizationId: selectedOrgId,
                    createdByEmail: adminData.email,
                    status: 'pending' as const,
                };

                await schedulePost(payload);
                alert('Publicação agendada com sucesso!');
                navigate('/admin/scheduled-posts');

            } else {
                const postDataForImmediate = {
                    ...basePostData,
                    mediaUrl: postType === 'video' ? videoUrl : undefined, // createPost handles image upload itself
                    organizationId: selectedOrgId,
                    createdByEmail: adminData.email
                };

                await createPost(postDataForImmediate, postType === 'image' ? mediaFile : null, promotersToAssign);
                alert('Publicação criada com sucesso! As notificações para as divulgadoras estão sendo enviadas em segundo plano.');
                navigate('/admin/posts');
            }

        } catch (err: any) {
            console.error("Failed to submit form