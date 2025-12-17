
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../contexts/AdminAuthContext';
import { getOrganizations } from '../services/organizationService';
import { getAllCampaigns } from '../services/settingsService';
import { sendPushCampaign } from '../services/messageService';
import { Organization, Campaign, Promoter } from '../types';
import { ArrowLeftIcon, SparklesIcon, FaceIdIcon } from '../components/Icons';
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

    useEffect(() => {
        if (adminData?.role !== 'superadmin') navigate('/admin');
    }, [adminData, navigate]);

    useEffect(() => {
        getOrganizations().then(orgs => setOrganizations(orgs.sort((a,b) => a.name.localeCompare(b.name))));
    }, []);

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
        <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <FaceIdIcon className="w-8 h-8 text-primary" />
                    Notificação Push Nativa
                </h1>
                <button onClick={() => navigate('/admin')} className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-500 text-sm">
                    <ArrowLeftIcon className="w-4 h-4" /> Voltar
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-secondary p-6 rounded-lg shadow-lg space-y-4">
                    <h2 className="text-xl font-semibold border-b border-gray-700 pb-2">1. Destinatários</h2>
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Organização</label>
                        <select value={targetOrgId} onChange={e => setTargetOrgId(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                            <option value="">Selecione...</option>
                            {organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                    </div>
                    <div className="p-3 bg-blue-900/20 border border-blue-800 rounded text-xs text-blue-300">
                        Apenas divulgadoras que abriram o aplicativo recentemente e autorizaram notificações aparecem aqui.
                    </div>
                    <div className="h-64 overflow-y-auto border border-gray-600 rounded bg-gray-800 p-2">
                        {isLoadingData ? <p className="text-center py-4">Carregando...</p> : promoters.length === 0 ? <p className="text-center py-4 text-gray-500">Nenhum dispositivo encontrado.</p> : (
                            promoters.map(p => (
                                <label key={p.id} className="flex items-center gap-2 p-2 hover:bg-gray-700 rounded cursor-pointer">
                                    <input type="checkbox" checked={selectedPromoterIds.has(p.id)} onChange={() => {
                                        const n = new Set(selectedPromoterIds);
                                        if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                                        setSelectedPromoterIds(n);
                                    }} className="rounded text-primary" />
                                    <span className="text-sm truncate">{p.name}</span>
                                </label>
                            ))
                        )}
                    </div>
                </div>

                <div className="bg-secondary p-6 rounded-lg shadow-lg space-y-4">
                    <h2 className="text-xl font-semibold border-b border-gray-700 pb-2">2. Mensagem</h2>
                    <input type="text" placeholder="Título (ex: Nova Tarefa!)" value={title} onChange={e => setTitle(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white font-bold" />
                    <textarea placeholder="Mensagem da notificação..." value={body} onChange={e => setBody(e.target.value)} className="w-full h-24 bg-gray-700 border border-gray-600 rounded p-2 text-white" />
                    <div>
                        <label className="block text-sm text-gray-400 mb-1">Tela de Destino (Rota)</label>
                        <select value={targetUrl} onChange={e => setTargetUrl(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-white">
                            <option value="/#/posts">Minhas Postagens</option>
                            <option value="/#/status">Verificar Status</option>
                            <option value="/#/connect">Conexão (Seguidores)</option>
                        </select>
                    </div>
                    
                    {error && <p className="text-red-400 text-sm font-bold">{error}</p>}
                    {result && <p className="text-green-400 text-sm font-bold">{result}</p>}

                    <button onClick={handleSend} disabled={isSending || selectedPromoterIds.size === 0} className="w-full py-3 bg-primary text-white font-bold rounded-lg hover:bg-primary-dark disabled:opacity-50 flex items-center justify-center gap-2">
                        {isSending ? 'Enviando...' : 'Disparar Notificações'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminPushCampaignPage;
