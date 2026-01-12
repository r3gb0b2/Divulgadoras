
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { sendWhatsAppCampaign } from '../services/messageService';
import { Organization, Campaign, Promoter } from '../types';
// Add missing SearchIcon and PencilIcon imports
import { ArrowLeftIcon, SparklesIcon, WhatsAppIcon, InstagramIcon, FilterIcon, MegaphoneIcon, RefreshIcon, AlertTriangleIcon, SearchIcon, PencilIcon } from '../components/Icons';
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
    const [platform, setPlatform] = useState<'whatsapp' | 'instagram'>('whatsapp');

    // Message State
    const [message, setMessage] = useState('');
    const [aiPrompt, setAiPrompt] = useState('');
    const [isGeneratingAi, setIsGeneratingAi] = useState(false);

    // Sending State
    const [isSending, setIsSending] = useState(false);
    const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isSuperAdmin = adminData?.role === 'superadmin';

    useEffect(() => {
        if (adminData && !isSuperAdmin) {
            navigate('/admin');
        }
    }, [adminData, isSuperAdmin, navigate]);

    useEffect(() => {
        const loadInitialData = async () => {
            if (!isSuperAdmin) return;
            setIsLoadingData(true);
            try {
                const orgs = await getOrganizations();
                setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name)));
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

    const fetchPromoters = useCallback(async () => {
        const orgId = isSuperAdmin ? targetOrgId : selectedOrgId;
        if (!orgId) return;

        setIsLoadingData(true);
        try {
            const { getAllPromoters } = await import('../services/promoterService');
            const fetched = await getAllPromoters({
                organizationId: orgId,
                filterOrgId: orgId,
                filterState: targetState,
                selectedCampaign: targetCampaignName,
                status: targetStatus as any,
            });
            
            // Filtra quem tem a informação necessária da plataforma
            const valid = fetched.filter(p => platform === 'instagram' ? !!p.instagram : !!p.whatsapp);
            
            setPromoters(valid);
            if (selectionMode === 'all') {
                setSelectedPromoterIds(new Set(valid.map(p => p.id)));
            } else {
                setSelectedPromoterIds(new Set());
            }

        } catch (err: any) {
            console.error(err);
            setError("Erro ao buscar divulgadoras.");
        } finally {
            setIsLoadingData(false);
        }
    }, [isSuperAdmin, targetOrgId, selectedOrgId, targetState, targetCampaignName, targetStatus, selectionMode, platform]);

    useEffect(() => {
        if (targetOrgId) fetchPromoters();
    }, [fetchPromoters, targetOrgId]);

    const handleInsertVariable = (variable: string) => {
        setMessage(prev => prev + ` ${variable} `);
    };

    const handleGenerateAi = async () => {
        if (!aiPrompt.trim()) return;
        setIsGeneratingAi(true);
        try {
            const askGemini = httpsCallable(functions, 'askGemini');
            const prompt = `Crie uma mensagem curta para ${platform === 'whatsapp' ? 'WhatsApp' : 'Instagram Direct'} para divulgadoras da equipe de eventos. Contexto: ${aiPrompt}. Use emojis. Seja profissional mas amigável. A resposta deve ser apenas o texto da mensagem.`;
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
        const orgId = isSuperAdmin ? targetOrgId : selectedOrgId;
        if (!orgId) { setError("Organização inválida."); return; }
        if (!message.trim()) { setError("Digite uma mensagem."); return; }
        
        const finalIds = selectionMode === 'manual' 
            ? Array.from(selectedPromoterIds)
            : promoters.map(p => p.id);

        if (finalIds.length === 0) {
            setError("Nenhuma divulgadora selecionada.");
            return;
        }

        if (!window.confirm(`Confirma o envio via ${platform.toUpperCase()} para ${finalIds.length} pessoas?`)) return;

        setIsSending(true);
        setResult(null);
        setError(null);

        try {
            const res = await sendWhatsAppCampaign(message, {
                promoterIds: finalIds,
            }, orgId, platform);
            
            setResult({ success: res.success, message: `Disparo concluído: ${res.count} enviados com sucesso.` });
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    const previewPromoter = promoters.find(p => selectedPromoterIds.has(p.id)) || promoters[0];
    const previewMessage = previewPromoter ? message
        .replace(/{{name}}/g, previewPromoter.name.split(' ')[0])
        .replace(/{{fullName}}/g, previewPromoter.name)
        .replace(/{{email}}/g, previewPromoter.email)
        .replace(/{{campaignName}}/g, previewPromoter.campaignName || 'Eventos')
        .replace(/{{portalLink}}/g, 'https://divulgadoras.vercel.app/...') : message;

    if (!isSuperAdmin) return null;

    return (
        <div className="max-w-6xl mx-auto pb-20">
            <div className="flex justify-between items-center mb-6 px-4 md:px-0">
                <h1 className="text-3xl font-black text-white uppercase tracking-tighter flex items-center gap-3">
                    <MegaphoneIcon className="w-8 h-8 text-primary" />
                    Campanha Multi-Canal
                </h1>
                <button onClick={() => navigate('/admin/super')} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-5 h-5" />
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Filters & Audience */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-[2rem] border border-white/5 shadow-xl">
                        <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                             <FilterIcon className="w-4 h-4"/> 1. Canal e Audiência
                        </h2>
                        
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Plataforma de Envio</label>
                                <div className="flex bg-dark p-1 rounded-2xl border border-white/5 shadow-inner">
                                    <button 
                                        onClick={() => setPlatform('whatsapp')} 
                                        className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${platform === 'whatsapp' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        <WhatsAppIcon className="w-4 h-4" /> WhatsApp
                                    </button>
                                    <button 
                                        onClick={() => setPlatform('instagram')} 
                                        className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${platform === 'instagram' ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/20' : 'text-gray-500 hover:text-gray-300'}`}
                                    >
                                        <InstagramIcon className="w-4 h-4" /> Instagram
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Produtora</label>
                                    <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary shadow-lg">
                                        <option value="">Selecione a organização...</option>
                                        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Modo</label>
                                        <select value={selectionMode} onChange={e => setSelectionMode(e.target.value as any)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-[9px] font-black text-white uppercase outline-none">
                                            <option value="all">TODOS</option>
                                            <option value="manual">MANUAL</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Status</label>
                                        <select value={targetStatus} onChange={e => setTargetStatus(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-[9px] font-black text-white uppercase outline-none">
                                            <option value="approved">APROVADAS</option>
                                            <option value="pending">PENDENTES</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 border-t border-white/5 pt-6">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                    {promoters.length} Divulgadoras Encontradas
                                </span>
                            </div>
                            
                            <div className="h-64 overflow-y-auto bg-dark/50 rounded-2xl border border-white/5 p-2 space-y-1 custom-scrollbar shadow-inner">
                                {isLoadingData ? (
                                    <p className="text-center text-gray-600 py-10 animate-pulse text-[9px] font-black">BUSCANDO BASE...</p>
                                ) : promoters.length === 0 ? (
                                    <p className="text-center text-gray-600 py-10 text-[9px] font-black uppercase">Ninguém encontrado</p>
                                ) : (
                                    promoters.map(p => (
                                        <label key={p.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 cursor-pointer group transition-all">
                                            <input 
                                                type="checkbox" 
                                                checked={selectionMode === 'all' || selectedPromoterIds.has(p.id)} 
                                                onChange={() => selectionMode === 'manual' && setSelectedPromoterIds(prev => {
                                                    const n = new Set(prev);
                                                    if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                                    return n;
                                                })}
                                                disabled={selectionMode === 'all'}
                                                className="w-4 h-4 rounded border-gray-600 bg-black text-primary focus:ring-0"
                                            />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-white truncate uppercase">{p.name}</p>
                                                <p className={`text-[9px] font-mono truncate ${platform === 'instagram' ? 'text-pink-400' : 'text-green-500'}`}>
                                                    {platform === 'instagram' ? `@${p.instagram}` : p.whatsapp}
                                                </p>
                                            </div>
                                        </label>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Center Column: Message Editor */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-secondary p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-[10px] font-black text-primary uppercase tracking-[0.2em] flex items-center gap-2">
                                <PencilIcon className="w-4 h-4"/> 2. Composição da Mensagem
                            </h2>
                            <div className="flex gap-2">
                                {['{{name}}', '{{campaignName}}', '{{portalLink}}'].map(v => (
                                    <button key={v} onClick={() => handleInsertVariable(v)} className="px-2 py-1 bg-dark border border-white/5 hover:border-primary rounded-lg text-[8px] font-black font-mono text-primary transition-all">
                                        {v}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder={`Escreva o que deseja enviar via ${platform === 'whatsapp' ? 'WhatsApp' : 'Direct'}...`}
                            className="w-full h-48 bg-dark border border-gray-700 rounded-3xl p-6 text-white font-medium outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner"
                        />

                        {/* AI Assistant */}
                        <div className="bg-primary/5 p-5 rounded-[2rem] border border-primary/10">
                            <div className="flex gap-3">
                                <div className="relative flex-grow">
                                    <SparklesIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-primary" />
                                    <input 
                                        type="text" 
                                        value={aiPrompt}
                                        onChange={e => setAiPrompt(e.target.value)}
                                        placeholder="Ex: Avisar que saiu o flyer oficial do evento..."
                                        className="w-full bg-dark border border-gray-700 rounded-2xl pl-11 pr-5 py-3 text-xs text-white outline-none focus:ring-1 focus:ring-primary shadow-lg"
                                    />
                                </div>
                                <button 
                                    onClick={handleGenerateAi} 
                                    disabled={isGeneratingAi || !aiPrompt.trim()}
                                    className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl hover:bg-primary-dark disabled:opacity-50 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all"
                                >
                                    {isGeneratingAi ? <RefreshIcon className="w-4 h-4 animate-spin" /> : 'GERAR IA'}
                                </button>
                            </div>
                        </div>

                        {/* Result Area */}
                        <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="text-center md:text-left">
                                {result && <p className="text-green-400 font-black text-[10px] uppercase animate-fadeIn">{result.message}</p>}
                                {error && <p className="text-red-400 font-black text-[10px] uppercase animate-fadeIn">{error}</p>}
                                {!result && !error && <p className="text-gray-500 font-black text-[9px] uppercase tracking-widest">Aguardando comando de envio...</p>}
                            </div>
                            
                            <button 
                                onClick={handleSend}
                                disabled={isSending || promoters.length === 0 || !message.trim()}
                                className={`px-12 py-5 text-white font-black rounded-3xl shadow-2xl transition-all uppercase text-xs tracking-[0.2em] flex items-center gap-3 transform active:scale-95 disabled:opacity-30 ${platform === 'whatsapp' ? 'bg-green-600 hover:bg-green-500' : 'bg-pink-600 hover:bg-pink-500'}`}
                            >
                                {isSending ? 'DISPARANDO...' : `DISPARAR PARA ${selectionMode === 'all' ? promoters.length : selectedPromoterIds.size}`}
                                {platform === 'whatsapp' ? <WhatsAppIcon className="w-5 h-5" /> : <InstagramIcon className="w-5 h-5" />}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhatsAppCampaignPage;
