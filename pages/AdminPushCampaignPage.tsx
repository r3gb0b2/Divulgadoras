
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { findPromotersByEmail } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Campaign, Promoter } from '../types';
import { ArrowLeftIcon, SparklesIcon, FaceIdIcon, SearchIcon, XIcon, CheckCircleIcon, AlertTriangleIcon, RefreshIcon } from '../components/Icons';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

const AdminPushCampaignPage: React.FC = () => {
    const navigate = useNavigate();
    const { adminData, selectedOrgId } = useAdminAuth();
    
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [promoters, setPromoters] = useState<Promoter[]>([]);
    const [isLoadingData, setIsLoadingData] = useState(true);

    const [targetOrgId, setTargetOrgId] = useState('');
    const [targetCampaignName, setTargetCampaignName] = useState('all');
    const [targetState, setTargetState] = useState('all');
    const [selectedPromoterIds, setSelectedPromoterIds] = useState<Set<string>>(new Set());

    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [targetUrl, setTargetUrl] = useState('/#/posts');

    const [isSending, setIsSending] = useState(false);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Diagnostic state
    const [diagEmail, setDiagEmail] = useState('');
    const [diagResult, setDiagResult] = useState<Promoter | null>(null);
    const [isDiagnosing, setIsDiagnosing] = useState(false);

    const isSuperAdmin = adminData?.role === 'superadmin';

    useEffect(() => {
        if (isSuperAdmin) {
            getOrganizations().then(orgs => setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name))));
        } else if (selectedOrgId) {
            setTargetOrgId(selectedOrgId);
        }
    }, [isSuperAdmin, selectedOrgId]);

    useEffect(() => {
        if (targetOrgId) {
            getAllCampaigns(targetOrgId).then(camps => setCampaigns(camps.sort((a,b) => a.name.localeCompare(b.name))));
        }
    }, [targetOrgId]);

    const fetchPromoters = useCallback(async () => {
        if (!targetOrgId) return;
        setIsLoadingData(true);
        try {
            const { getAllPromoters } = await import('../services/promoterService');
            const fetched = await getAllPromoters({
                organizationId: targetOrgId,
                filterOrgId: targetOrgId,
                filterState: targetState,
                selectedCampaign: targetCampaignName,
                status: 'approved',
            });
            
            setPromoters(fetched);
            // Pré-seleciona apenas quem tem token
            const withTokenIds = fetched.filter(p => !!p.fcmToken).map(p => p.id);
            setSelectedPromoterIds(new Set(withTokenIds));
        } catch (err) {
            setError("Erro ao buscar divulgadoras.");
        } finally {
            setIsLoadingData(false);
        }
    }, [targetOrgId, targetState, targetCampaignName]);

    useEffect(() => {
        fetchPromoters();
    }, [fetchPromoters]);

    const handleRunDiagnostics = async () => {
        if (!diagEmail.trim()) return;
        setIsDiagnosing(true);
        setDiagResult(null);
        try {
            const results = await findPromotersByEmail(diagEmail);
            if (results.length > 0) setDiagResult(results[0]);
            else alert("Nenhum cadastro encontrado com este e-mail.");
        } catch (e) {
            alert("Erro na busca.");
        } finally {
            setIsDiagnosing(false);
        }
    };

    const handleSend = async () => {
        if (!title || !body || selectedPromoterIds.size === 0) {
            setError("Preencha todos os campos e selecione divulgadoras com celular vinculado.");
            return;
        }

        const countWithTokens = Array.from(selectedPromoterIds).filter(id => {
            const p = promoters.find(item => item.id === id);
            return !!p?.fcmToken;
        }).length;

        if (countWithTokens === 0) {
            setError("Nenhuma das divulgadoras selecionadas possui um celular vinculado para receber push.");
            return;
        }

        if (!window.confirm(`Enviar notificação para ${countWithTokens} dispositivos vinculados?`)) return;

        setIsSending(true);
        setResult(null);
        setError(null);

        try {
            const res = await sendPushCampaign({
                title,
                body,
                url: targetUrl,
                promoterIds: Array.from(selectedPromoterIds),
                organizationId: targetOrgId
            });
            setResult(res.message);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <FaceIdIcon className="w-8 h-8 text-primary" />
                    Notificações Push Nativa
                </h1>
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Diagnóstico Individual */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-secondary p-6 rounded-lg shadow-lg border border-indigo-500/30">
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><SearchIcon className="w-5 h-5 text-indigo-400" /> Diagnóstico Remoto</h2>
                        <p className="text-xs text-gray-400 mb-4">Insira o e-mail para ver o que o celular da divulgadora reportou ao sistema.</p>
                        <div className="flex gap-2 mb-6">
                            <input 
                                type="email" 
                                placeholder="E-mail da divulgadora..." 
                                value={diagEmail}
                                onChange={e => setDiagEmail(e.target.value)}
                                className="flex-grow bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            />
                            <button onClick={handleRunDiagnostics} disabled={isDiagnosing} className="p-2 bg-indigo-600 rounded text-white hover:bg-indigo-700 disabled:opacity-50">
                                {isDiagnosing ? '...' : <SearchIcon className="w-5 h-5" />}
                            </button>
                        </div>

                        {diagResult && (
                            <div className="bg-dark/50 p-4 rounded border border-gray-700 space-y-3 animate-fadeIn">
                                <p className="text-sm font-bold text-white truncate">{diagResult.name}</p>
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between text-xs">
                                        <span className="text-gray-400">Token FCM (Link):</span>
                                        {diagResult.fcmToken ? (
                                            <span className="text-green-400 flex items-center gap-1 font-bold"><CheckCircleIcon className="w-3 h-3" /> ATIVO</span>
                                        ) : (
                                            <span className="text-red-400 flex items-center gap-1 font-bold"><XIcon className="w-3 h-3" /> AUSENTE</span>
                                        )}
                                    </div>
                                    {diagResult.pushDiagnostics && (
                                        <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
                                            <p className="text-[10px] text-gray-500 uppercase font-bold">Relatório do Dispositivo</p>
                                            <div className="grid grid-cols-2 gap-2 text-[10px]">
                                                <div className="bg-gray-800 p-1 rounded">Plataforma: <span className="text-white">{diagResult.pushDiagnostics.platform}</span></div>
                                                <div className="bg-gray-800 p-1 rounded">Plugin: <span className="text-white">{diagResult.pushDiagnostics.pluginStatus}</span></div>
                                            </div>
                                            {diagResult.pushDiagnostics.lastError && (
                                                <div className="bg-red-900/20 p-2 rounded border border-red-900/50">
                                                    <p className="text-[9px] text-red-300 font-mono break-all">{diagResult.pushDiagnostics.lastError}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Envio em Massa */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-secondary p-6 rounded-lg shadow-lg flex flex-col h-full">
                        <h2 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-4">1. Destinatários</h2>
                        <div className="space-y-4 mb-4">
                            {isSuperAdmin && (
                                <div>
                                    <label className="block text-sm text-gray-400 mb-1">Organização</label>
                                    <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                        <option value="">Selecione...</option>
                                        {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Evento</label>
                                <select value={targetCampaignName} onChange={e => setTargetCampaignName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                    <option value="all">Todos os Eventos</option>
                                    {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="flex-grow overflow-y-auto border border-gray-600 rounded bg-gray-800 p-2 min-h-[300px]">
                            {isLoadingData ? <p className="text-center py-4 text-xs">Carregando dispositivos...</p> : promoters.length === 0 ? <p className="text-center py-4 text-gray-500 text-xs">Ninguém encontrado.</p> : (
                                promoters.map(p => (
                                    <label key={p.id} className="flex items-center gap-3 p-2 hover:bg-gray-700 rounded cursor-pointer border-b border-gray-700/50 last:border-0">
                                        <input type="checkbox" checked={selectedPromoterIds.has(p.id)} onChange={() => {
                                            const n = new Set(selectedPromoterIds);
                                            if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                            setSelectedPromoterIds(n);
                                        }} className="rounded text-primary focus:ring-0" />
                                        <div className="flex-grow min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold text-white truncate">{p.name}</span>
                                                {p.fcmToken ? <CheckCircleIcon className="w-3 h-3 text-green-400 flex-shrink-0" /> : <XIcon className="w-3 h-3 text-red-500 flex-shrink-0" />}
                                            </div>
                                            <p className="text-[10px] text-gray-500 truncate">{p.instagram}</p>
                                        </div>
                                    </label>
                                ))
                            )}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                             <span className="text-[10px] text-gray-500 uppercase tracking-widest">{selectedPromoterIds.size} selecionadas</span>
                             <button onClick={() => fetchPromoters()} className="text-primary hover:text-white"><RefreshIcon className="w-4 h-4"/></button>
                        </div>
                    </div>

                    <div className="bg-secondary p-6 rounded-lg shadow-lg space-y-4">
                        <h2 className="text-xl font-semibold border-b border-gray-700 pb-2">2. Mensagem</h2>
                        <input type="text" placeholder="Título da Notificação" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white font-bold focus:ring-1 focus:ring-primary outline-none" />
                        <textarea placeholder="Corpo da mensagem (curto)..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-32 bg-gray-800 border border-gray-600 rounded p-2 text-white text-sm focus:ring-1 focus:ring-primary outline-none" />
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Destino ao Abrir</label>
                            <select value={targetUrl} onChange={e => setTargetUrl(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white text-sm">
                                <option value="/#/posts">Minhas Tarefas (Portal)</option>
                                <option value="/#/status">Status do Cadastro</option>
                                <option value="/#/connect">Conexão Seguidores</option>
                            </select>
                        </div>
                        
                        {error && <div className="bg-red-900/20 border border-red-800 text-red-400 p-2 rounded text-[10px] font-bold">{error}</div>}
                        {result && <div className="bg-green-900/20 border border-green-800 text-green-400 p-2 rounded text-[10px] font-bold">{result}</div>}

                        <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-4 bg-primary text-white font-black uppercase tracking-widest rounded-xl hover:bg-primary-dark shadow-xl shadow-primary/20 disabled:opacity-50 disabled:grayscale transition-all flex items-center justify-center gap-2">
                            {isSending ? 'Enviando...' : 'Disparar Push'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
