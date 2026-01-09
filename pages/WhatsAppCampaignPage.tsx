
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { sendWhatsAppCampaign } from '../services/messageService';
import { Organization, Campaign, Promoter } from '../types';
import { ArrowLeftIcon, SparklesIcon, WhatsAppIcon, InstagramIcon, FilterIcon, MegaphoneIcon, RefreshIcon, AlertTriangleIcon } from '../components/Icons';
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
            const prompt = `Crie uma mensagem curta para ${platform === 'whatsapp' ? 'WhatsApp' : 'Instagram Direct'} para divulgadoras. Contexto: ${aiPrompt}. Use emojis. Sem markdown.`;
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

        if (!window.confirm(`Confirma o envio via ${platform.toUpperCase()} para ${finalIds.length} pessoas?`)) return;

        setIsSending(true);
        setResult(null);
        setError(null);

        try {
            const res = await sendWhatsAppCampaign(message, {
                promoterIds: finalIds,
            }, orgId, platform);
            
            setResult({ success: res.success, message: res.message });
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
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <SparklesIcon className="w-8 h-8 text-primary" />
                    Campanha Multi-Canal (Super Admin)
                </h1>
                <button onClick={() => navigate('/admin/settings')} className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-md hover:bg-gray-700 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" />
                    <span>Voltar</span>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left Column: Filters & Audience */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-[2rem] border border-white/5 shadow-xl">
                        <h2 className="text-sm font-black text-primary uppercase tracking-widest mb-6 flex items-center gap-2">
                             <FilterIcon className="w-4 h-4"/> 1. Selecionar Canal e Público
                        </h2>
                        
                        <div className="space-y-6">
                            {/* SELETOR DE PLATAFORMA */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Canal de Envio</label>
                                <div className="flex bg-dark p-1 rounded-2xl border border-white/5 shadow-inner">
                                    <button 
                                        onClick={() => setPlatform('whatsapp')} 
                                        className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${platform === 'whatsapp' ? 'bg-green-600 text-white shadow-lg shadow-green-900/20' : 'text-gray-500'}`}
                                    >
                                        <WhatsAppIcon className="w-4 h-4" /> WhatsApp
                                    </button>
                                    <button 
                                        onClick={() => setPlatform('instagram')} 
                                        className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all flex items-center justify-center gap-2 ${platform === 'instagram' ? 'bg-pink-600 text-white shadow-lg shadow-pink-900/20' : 'text-gray-500'}`}
                                    >
                                        <InstagramIcon className="w-4 h-4" /> Instagram
                                    </button>
                                </div>
                            </div>

                            {platform === 'instagram' && (
                                <div className="p-4 bg-amber-900/20 border border-amber-500/30 rounded-2xl animate-fadeIn">
                                    <div className="flex gap-3 items-start">
                                        <AlertTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                                        <div className="text-left">
                                            <p className="text-amber-200 text-[10px] font-black uppercase tracking-tight">Política da Meta</p>
                                            <p className="text-amber-100 text-[9px] leading-tight mt-1">
                                                O Direct só funcionará se a divulgadora tiver interagido com seu perfil nas últimas 24 horas. Caso contrário, a API retornará falha.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Organização</label>
                                    <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary shadow-lg">
                                        <option value="">Selecione...</option>
                                        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Evento / Gênero</label>
                                    <select value={targetCampaignName} onChange={e => setTargetCampaignName(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-sm text-white outline-none focus:ring-1 focus:ring-primary shadow-lg" disabled={!targetOrgId}>
                                        <option value="all">Todos os Eventos</option>
                                        {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    </select>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Modo Seleção</label>
                                        <select value={selectionMode} onChange={e => setSelectionMode(e.target.value as any)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-[10px] font-black text-white uppercase outline-none focus:ring-1 focus:ring-primary shadow-lg">
                                            <option value="all">TODOS</option>
                                            <option value="manual">MANUAL</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Perfil</label>
                                        <select value={targetStatus} onChange={e => setTargetStatus(e.target.value)} className="w-full bg-dark border border-gray-700 rounded-xl p-3 text-[10px] font-black text-white uppercase outline-none focus:ring-1 focus:ring-primary shadow-lg">
                                            <option value="approved">APROVADAS</option>
                                            <option value="pending">PENDENTES</option>
                                            <option value="all">TODAS</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-6 border-t border-white/5 pt-6">
                            <div className="flex justify-between items-center mb-3">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                    {promoters.length} encontradas
                                </span>
                            </div>
                            
                            <div className="h-64 overflow-y-auto bg-dark/50 rounded-2xl border border-white/5 p-2 space-y-1 custom-scrollbar shadow-inner">
                                {isLoadingData ? (
                                    <p className="text-center text-gray-600 py-10 animate-pulse text-[10px] font-black">SINCROIZANDO...</p>
                                ) : promoters.length === 0 ? (
                                    <p className="text-center text-gray-600 py-10 text-[10px] font-black uppercase">Ninguém encontrado</p>
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
                                                className="w-4 h-4 rounded border-gray-600 bg-black text-primary"
                                            />
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-white truncate">{p.name}</p>
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

                {/* Center & Right Column: Editor & Preview */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-secondary p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-6">
                        <h2 className="text-sm font-black text-primary uppercase tracking-widest mb-2 flex items-center gap-2">
                             <MegaphoneIcon className="w-5 h-5"/> 2. Criar Mensagem de Campanha
                        </h2>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-2 block">Variáveis mágicas (clique p/ inserir)</label>
                                <div className="flex flex-wrap gap-2">
                                    {['{{name}}', '{{fullName}}', '{{email}}', '{{campaignName}}', '{{portalLink}}'].map(v => (
                                        <button key={v} onClick={() => handleInsertVariable(v)} className="px-3 py-1.5 bg-dark border border-white/5 hover:border-primary rounded-xl text-[9px] font-black font-mono text-primary transition-all">
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <textarea
                                value={message}
                                onChange={e => setMessage(e.target.value)}
                                placeholder={`Digite a mensagem para o ${platform === 'whatsapp' ? 'WhatsApp' : 'Direct'} aqui...`}
                                className="w-full h-48 bg-dark border border-gray-700 rounded-3xl p-6 text-white font-medium outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner"
                            />

                            {/* AI Assistant */}
                            <div className="bg-primary/5 p-4 rounded-3xl border border-primary/10">
                                <div className="flex gap-3">
                                    <input 
                                        type="text" 
                                        value={aiPrompt}
                                        onChange={e => setAiPrompt(e.target.value)}
                                        placeholder="Ex: Criar texto convidando para o camarote..."
                                        className="flex-grow bg-dark border border-gray-700 rounded-2xl px-5 text-sm text-white outline-none focus:ring-1 focus:ring-primary shadow-lg"
                                    />
                                    <button 
                                        onClick={handleGenerateAi} 
                                        disabled={isGeneratingAi}
                                        className="flex items-center gap-2 px-6 py-3 bg-primary text-white rounded-2xl hover:bg-primary-dark disabled:opacity-50 text-[10px] font-black uppercase tracking-widest shadow-xl shadow-primary/20 transition-all"
                                    >
                                        {isGeneratingAi ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <SparklesIcon className="w-4 h-4" />}
                                        IA
                                    </button>
                                </div>
                            </div>

                            {/* Preview Box - Estilo dinâmico conforme plataforma */}
                            <div className={`p-6 rounded-[2.5rem] border ${platform === 'whatsapp' ? 'bg-green-900/10 border-green-800/30' : 'bg-pink-900/10 border-pink-800/30'}`}>
                                <h3 className={`text-[10px] font-black uppercase tracking-widest mb-4 flex items-center gap-2 ${platform === 'whatsapp' ? 'text-green-500' : 'text-pink-500'}`}>
                                    {platform === 'whatsapp' ? <WhatsAppIcon className="w-4 h-4" /> : <InstagramIcon className="w-4 h-4" />}
                                    Simulação de Visualização
                                </h3>
                                
                                <div className={`p-5 rounded-3xl shadow-xl max-w-sm whitespace-pre-wrap text-sm relative ${platform === 'whatsapp' ? 'bg-[#DCF8C6] text-black rounded-tr-none ml-auto' : 'bg-gradient-to-tr from-indigo-500 via-purple-500 to-pink-500 text-white rounded-bl-none'}`}>
                                    {previewMessage || <span className="opacity-40 italic">Escreva sua mensagem...</span>}
                                    <div className={`absolute top-0 w-0 h-0 border-t-[10px] border-t-transparent border-b-[10px] border-b-transparent ${platform === 'whatsapp' ? 'right-[-10px] border-l-[10px] border-l-[#DCF8C6]' : 'left-[-10px] border-r-[10px] border-r-indigo-500'}`}></div>
                                </div>
                            </div>

                            {/* Status and Action */}
                            <div className="pt-6 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6">
                                <div className="text-center md:text-left">
                                    {result && <p className={`font-black text-[10px] uppercase animate-fadeIn ${result.success ? 'text-green-400' : 'text-amber-400'}`}>{result.message}</p>}
                                    {error && <p className="text-red-400 font-black text-[10px] uppercase animate-fadeIn">{error}</p>}
                                    {!result && !error && <p className="text-gray-500 font-black text-[10px] uppercase tracking-widest">Aguardando disparo...</p>}
                                </div>
                                
                                <button 
                                    onClick={handleSend}
                                    disabled={isSending || (selectionMode === 'manual' && selectedPromoterIds.size === 0) || (selectionMode === 'all' && promoters.length === 0)}
                                    className={`px-12 py-5 text-white font-black rounded-3xl shadow-2xl transition-all uppercase text-xs tracking-[0.2em] flex items-center gap-3 disabled:opacity-30 transform active:scale-95 ${platform === 'whatsapp' ? 'bg-green-600 hover:bg-green-500 shadow-green-900/30' : 'bg-pink-600 hover:bg-pink-500 shadow-pink-900/30'}`}
                                >
                                    {platform === 'whatsapp' ? <WhatsAppIcon className="w-5 h-5" /> : <InstagramIcon className="w-5 h-5" />}
                                    {isSending ? 'DISPARANDO...' : `ENVIAR PARA ${selectionMode === 'all' ? promoters.length : selectedPromoterIds.size}`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WhatsAppCampaignPage;
