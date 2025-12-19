
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { findPromotersByEmail } from '../services/promoterService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Campaign, Promoter } from '../types';
import { ArrowLeftIcon, SparklesIcon, FaceIdIcon, SearchIcon, XIcon, CheckCircleIcon, AlertTriangleIcon } from '../components/Icons';
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
            // Filtra apenas quem tem token
            const withToken = fetched.filter(p => !!p.fcmToken);
            setPromoters(withToken);
            setSelectedPromoterIds(new Set(withToken.map(p => p.id)));
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
            setError("Preencha todos os campos e selecione ao menos uma divulgadora com app instalado.");
            return;
        }

        if (!window.confirm(`Enviar notificação para ${selectedPromoterIds.size} dispositivos?`)) return;

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
                <div className="lg:col-span-1 bg-secondary p-6 rounded-lg shadow-lg border border-indigo-500/30">
                    <h2 className="text-xl font-semibold mb-4 flex items-center gap-2"><SearchIcon className="w-5 h-5 text-indigo-400" /> Diagnóstico Individual</h2>
                    <p className="text-xs text-gray-400 mb-4">Se uma divulgadora não aparece na lista ao lado, digite o e-mail dela abaixo para entender o porquê.</p>
                    <div className="flex gap-2 mb-6">
                        <input 
                            type="email" 
                            placeholder="E-mail da divulgadora..." 
                            value={diagEmail}
                            onChange={e => setDiagEmail(e.target.value)}
                            className="flex-grow bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm text-white"
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
                                    <span className="text-gray-400">Status Cadastro:</span>
                                    <span className={diagResult.status === 'approved' ? 'text-green-400 font-bold' : 'text-red-400'}>{diagResult.status}</span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-gray-400">Token FCM (Push):</span>
                                    {diagResult.fcmToken ? (
                                        <span className="text-green-400 flex items-center gap-1 font-bold"><CheckCircleIcon className="w-3 h-3" /> VINCULADO</span>
                                    ) : (
                                        <span className="text-red-400 flex items-center gap-1 font-bold"><XIcon className="w-3 h-3" /> NÃO ENCONTRADO</span>
                                    )}
                                </div>
                                {(diagResult as any).lastTokenUpdate && (
                                    <div className="text-[10px] text-gray-500 text-right">
                                        Vínculo em: {new Date((diagResult as any).lastTokenUpdate.seconds * 1000).toLocaleString('pt-BR')}
                                    </div>
                                )}
                            </div>
                            
                            {!diagResult.fcmToken && (
                                <div className="p-2 bg-yellow-900/20 border border-yellow-800 rounded text-[10px] text-yellow-300">
                                    <p><strong>Causa provável:</strong> A divulgadora ainda não abriu o App oficial ou não permitiu notificações quando perguntada pelo celular.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Envio em Massa */}
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-secondary p-6 rounded-lg shadow-lg space-y-4">
                        <h2 className="text-xl font-semibold border-b border-gray-700 pb-2">1. Destinatários</h2>
                        {isSuperAdmin ? (
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Organização</label>
                                <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                    <option value="">Selecione...</option>
                                    {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                                </select>
                            </div>
                        ) : (
                            <p className="text-sm text-primary font-bold">Enviando para sua equipe</p>
                        )}

                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className="block text-sm text-gray-400 mb-1">Filtrar por Evento</label>
                                <select value={targetCampaignName} onChange={e => setTargetCampaignName(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                    <option value="all">Todos os Eventos</option>
                                    {campaigns.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="h-64 overflow-y-auto border border-gray-600 rounded bg-gray-800 p-2">
                            {isLoadingData ? <p className="text-center py-4 text-xs">Carregando dispositivos...</p> : promoters.length === 0 ? <p className="text-center py-4 text-gray-500 text-xs">Nenhum celular vinculado nesta lista.</p> : (
                                promoters.map(p => (
                                    <label key={p.id} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded cursor-pointer">
                                        <input type="checkbox" checked={selectedPromoterIds.has(p.id)} onChange={() => {
                                            const n = new Set(selectedPromoterIds);
                                            if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                            setSelectedPromoterIds(n);
                                        }} className="rounded text-primary" />
                                        <span className="text-xs truncate">{p.name}</span>
                                    </label>
                                ))
                            )}
                        </div>
                        <p className="text-[10px] text-gray-500 text-center uppercase tracking-widest">{selectedPromoterIds.size} selecionadas</p>
                    </div>

                    <div className="bg-secondary p-6 rounded-lg shadow-lg space-y-4">
                        <h2 className="text-xl font-semibold border-b border-gray-700 pb-2">2. Mensagem</h2>
                        <input type="text" placeholder="Título (ex: Nova Tarefa!)" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white font-bold" />
                        <textarea placeholder="Mensagem da notificação..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-24 bg-gray-700 border border-gray-600 rounded p-2 text-white" />
                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Tela de Destino</label>
                            <select value={targetUrl} onChange={e => setTargetUrl(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                                <option value="/#/posts">Minhas Postagens</option>
                                <option value="/#/status">Verificar Status</option>
                                <option value="/#/connect">Conexão (Seguidores)</option>
                            </select>
                        </div>
                        
                        {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
                        {result && <p className="text-green-400 text-xs font-bold">{result}</p>}

                        <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-primary/20">
                            {isSending ? 'Enviando...' : 'Disparar Agora'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
