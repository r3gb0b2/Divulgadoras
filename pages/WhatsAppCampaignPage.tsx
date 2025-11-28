import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { getApprovedPromoters } from '../services/promoterService';
import { sendWhatsAppCampaign } from '../services/messageService';
import { Organization, Campaign, Promoter } from '../types';
import { ArrowLeftIcon, SparklesIcon, WhatsAppIcon } from '../components/Icons';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

const WhatsAppCampaignPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    // Data State
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    // Filter State
    const [targetOrgId, setTargetOrgId] = useState('');
    const [targetCampaignName, setTargetCampaignName] = useState('all');
    const [targetState, setTargetState] = useState('all');
    const [targetStatus, setTargetStatus] = useState('approved');
    const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());
    const [selectionMode, setSelectionMode] = useState<'all' | 'manual'>('all');

    // Message State
    const [message, setMessage] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    // Sending State
    const [isSending, setIsSending] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    // Redirect non-superadmin
    useEffect(() => {
        if (adminData && !isSuperAdmin) {
            navigate('/admin');
        }
    }, [adminData, isSuperAdmin, navigate]);

    // 1. Fetch Initial Data (Orgs & Campaigns)
    useEffect(() => {
        const loadInitialData = async () => {
            if (!isSuperAdmin) return;
            setIsLoadingData(true);
            try {
                const orgs = await getOrganizations();
                setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name)));
                
                // If a specific org is selected in dropdown or passed as target, load campaigns
                if (targetOrgId) {
                    const camps = await getAllCampaigns(targetOrgId);
                    setCampaigns(camps.sort((a,b) => a.name.localeCompare(b.name)));
                }
            } catch (err: any) {
                setError("Erro ao carregar dados iniciais.");
            } finally {
                setIsLoadingData(false);
            }
        };
        loadInitialData();
    }, [isSuperAdmin, targetOrgId]);

    // 2. Fetch Promoters when filters change
    const fetchPromoters = useCallback(async () => {
        const orgId = isSuperAdmin ? targetOrgId : selectedOrgId;
        if (!orgId) return;

        setIsLoadingData(true);
        try {
            // Using dynamic import or direct call to getAllPromoters from service
            const { getAllPromoters } = await import('../services/promoterService');
            
            const fetched = await getAllPromoters({
                organizationId: orgId,
                filterOrgId: orgId,
                filterState: targetState,
                selectedCampaign: targetCampaignName,
                status: targetStatus as any,
            });
            
            setPromoters(fetched);
            if (selectionMode === 'all') {
                setSelectedPromoterIds(new Set(fetched.map(p => p.id)));
            } else {
                setSelectedPromoterIds(new Set());
            }

        } catch (err: any) {
            console.error(err);
            setError("Erro ao buscar divulgadoras.");
        } finally {
            setIsLoadingData(false);
        }
    }, [isSuperAdmin, targetOrgId, selectedOrgId, targetState, targetCampaignName, targetStatus, selectionMode]);

    useEffect(() => {
        if (targetOrgId) fetchPromoters();
    }, [fetchPromoters, targetOrgId]);

    // 3. Handlers
    const handleInsertVariable = (variable: string) => {
        setMessage(prev => prev + ` ${variable} `);
    };

    const handleGenerateAi = async () => {
        if (!aiPrompt.trim()) return;
        setIsGeneratingAi(true);
        try {
            const askGemini = httpsCallable(functions, 'askGemini');
            const prompt = `Crie uma mensagem curta e engajadora para WhatsApp para divulgadoras de eventos. Contexto: ${aiPrompt}. Use emojis. Mantenha tom profissional mas amigável. Não use markdown.`;
            const result = await askGemini({ prompt });
            const data = result.data as { text: string };
            setMessage(data.text);
        } catch (err) {
            alert("Erro ao gerar com IA.");
        } finally {
            setIsGeneratingAi(false);
        }
    };

    const handleSend = async () => {
        const orgId = targetOrgId;
        if (!orgId) { setError("Organização inválida."); return; }
        if (!message.trim()) { setError("Digite uma mensagem."); return; }
        
        const finalIds = selectionMode === 'manual' 
            ? Array.from(selectedPromoterIds)
            : promoters.map(p => p.id);

        if (finalIds.length === 0) {
            setError("Nenhuma divulgadora selecionada.");
            return;
        }

        if (!window.confirm(`Confirma o envio para ${finalIds.length} pessoas?`)) return;

        setIsSending(true);
        setResult(null);
        setError(null);

        try {
            const res = await sendWhatsAppCampaign(message, {
                promoterIds: finalIds,
            }, orgId);
            
            setResult({ success: res.success, message: res.message });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    const togglePromoterSelection = (id: string) => {
        const newSet = new Set(selectedPromoterIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setSelectedPromoterIds(newSet);
    };

    const toggleSelectAllManual = () => {
        if (selectedPromoterIds.size === promoters.length) {
            setSelectedPromoterIds(new Set());
        } else {
            setSelectedPromoterIds(new Set(promoters.map(p => p.id)));
        }
    };

    // Preview Logic
    const previewPromoter = promoters.find(p => selectedPromoterIds.has(p.id)) || promoters[0];
    const previewMessage = previewPromoter ? message
        .replace(/{{name}}/g, previewPromoter.name.split(' ')[0])
        .replace(/{{fullName}}/g, previewPromoter.name)
        .replace(/{{email}}/g, previewPromoter.email)
        .replace(/{{campaignName}}/g, previewPromoter.campaignName || 'Eventos')
        .replace(/{{portalLink}}/g, 'https://divulgadoras.vercel.app/...') : message;


    if (!isSuperAdmin) return null;

    return (
        <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <WhatsAppIcon className="w-8 h-8 text-green-500" />
                    Campanha WhatsApp (Super Admin)
                </h1>
                <button onClick={() => navigate('/admin/settings')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Filters & Audience */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-semibold text-white mb-4">1. Selecionar Audiência</h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Organização (Obrigatório)</label>
                                <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                    <option value="">Selecione...</option>
                                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Evento / Gênero</label>
                                <select value={targetCampaignName} onChange={e => setTargetCampaignName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white" disabled={!targetOrgId}>
                                    <option value="all">Todos os Eventos</option>
                                    {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Status</label>
                                    <select value={targetStatus} onChange={e => setTargetStatus(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                        <option value="approved">Aprovadas</option>
                                        <option value="pending">Pendentes</option>
                                        <option value="rejected">Rejeitadas</option>
                                        <option value="all">Todas</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Modo de Seleção</label>
                                    <select value={selectionMode} onChange={e => setSelectionMode(e.target.value as any)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                        <option value="all">Todos da Lista</option>
                                        <option value="manual">Manual</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 border-t border-gray-700 pt-4">
                            <div className="flex justify-between items-center mb-2">
                                <span className="text-sm font-semibold text-gray-300">
                                    {promoters.length} encontradas
                                </span>
                                {selectionMode === 'manual' && (
                                    <button onClick={toggleSelectAllManual} className="text-xs text-primary hover:underline">
                                        {selectedPromoterIds.size === promoters.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                                    </button>
                                )}
                            </div>
                            
                            <div className="h-64 overflow-y-auto border border-gray-600 rounded bg-gray-800 p-2 space-y-1">
                                {isLoadingData ? (
                                    <p className="text-center text-gray-500 py-4">Carregando...</p>
                                ) : promoters.length === 0 ? (
                                    <p className="text-center text-gray-500 py-4">Ninguém encontrado.</p>
                                ) : (
                                    promoters.map(p => (
                                        <label key={p.id} className="flex items-center space-x-2 p-2 hover:bg-gray-700 rounded cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={selectionMode === 'all' || selectedPromoterIds.has(p.id)} 
                                                onChange={() => selectionMode === 'manual' && togglePromoterSelection(p.id)}
                                                disabled={selectionMode === 'all'}
                                                className="rounded border-gray-500 bg-gray-900 text-primary"
                                            />
                                            <div className="flex-grow overflow-hidden">
                                                <p className="text-sm font-medium truncate">{p.name}</p>
                                                <p className="text-xs text-gray-400 truncate">{p.campaignName || 'Geral'} • {p.whatsapp}</p>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                            <p className="text-xs text-gray-500 mt-2 text-right">
                                {selectionMode === 'all' ? promoters.length : selectedPromoterIds.size} selecionadas para envio.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Center & Right Column: Editor & Preview */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-secondary p-4 rounded-lg shadow-lg">
                        <h2 className="text-xl font-semibold text-white mb-4">2. Criar Mensagem</h2>
                        
                        <div className="mb-4">
                            <label className="block text-sm text-gray-400 mb-2">Variáveis (clique para inserir)</label>
                            <div className="flex flex-wrap gap-2">
                                {['{{name}}', '{{fullName}}', '{{email}}', '{{campaignName}}', '{{portalLink}}'].map(v => (
                                    <button key={v} onClick={() => handleInsertVariable(v)} className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs font-mono text-blue-300">
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Digite sua mensagem aqui... Use emojis e variáveis."
                            className="w-full h-40 bg-gray-800 border border-gray-600 rounded-md p-3 text-white focus:ring-2 focus:ring-primary focus:outline-none mb-4"
                        />

                        {/* AI Assistant */}
                        <div className="bg-dark/50 p-3 rounded-lg border border-gray-700 mb-4">
                            <div className="flex gap-2">
                                <input 
                                    type="text" 
                                    value={aiPrompt}
                                    onChange={e => setAiPrompt(e.target.value)}
                                    placeholder="Ex: Cobrar envio de prints atrasados com educação..."
                                    className="flex-grow bg-gray-700 border border-gray-600 rounded px-3 text-sm text-white"
                                />
                                <button 
                                    onClick={handleGenerateAi} 
                                    disabled={isGeneratingAi}
                                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 text-sm font-semibold"
                                >
                                    <SparklesIcon className="w-4 h-4" />
                                    {isGeneratingAi ? 'Gerando...' : 'Gerar com IA'}
                                </button>
                            </div>
                        </div>

                        {/* Preview Box */}
                        <div className="bg-green-900/20 border border-green-800 rounded-lg p-4">
                            <h3 className="text-sm font-bold text-green-400 mb-2">Pré-visualização (Exemplo):</h3>
                            <div className="bg-gray-100 text-black p-3 rounded-lg shadow-sm max-w-md whitespace-pre-wrap text-sm relative">
                                {previewMessage || <span className="text-gray-400 italic">Digite algo para ver o preview...</span>}
                                <div className="absolute top-0 right-0 -mt-1 -mr-1 w-0 h-0 border-t-[10px] border-t-white border-l-[10px] border-l-transparent transform rotate-90"></div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="mt-6 flex justify-end items-center gap-4">
                            {result && <span className="text-green-400 font-semibold">{result.message}</span>}
                            {error && <span className="text-red-400 font-semibold">{error}</span>}
                            
                            <button 
                                onClick={handleSend}
                                disabled={isSending || (selectionMode === 'manual' && selectedPromoterIds.size === 0) || (selectionMode === 'all' && promoters.length === 0)}
                                className="px-6 py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                <WhatsAppIcon className="w-5 h-5" />
                                {isSending ? 'Enviando...' : 'Enviar Campanha'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhatsAppCampaignPage;