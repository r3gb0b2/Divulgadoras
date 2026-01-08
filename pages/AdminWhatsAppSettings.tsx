
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { firestore } from '../firebase/config';
import { ArrowLeftIcon, WhatsAppIcon, RefreshIcon, CheckCircleIcon, KeyIcon, LinkIcon, DocumentDuplicateIcon, AlertTriangleIcon } from '../components/Icons';

const AdminWhatsAppSettings: React.FC = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [config, setConfig] = useState({
        apiUrl: '',
        apiToken: '',
        instanceId: '',
        isActive: false
    });
    const [success, setSuccess] = useState(false);

    // URL fixa do seu webhook no Firebase
    const webhookUrl = "https://southamerica-east1-stingressos-e0a5f.cloudfunctions.net/sureWebhook";

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const doc = await firestore.collection('systemConfig').doc('whatsapp').get();
                if (doc.exists) {
                    setConfig(doc.data() as any);
                }
            } catch (e) {
                console.error("Erro ao carregar config:", e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchConfig();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        try {
            await firestore.collection('systemConfig').doc('whatsapp').set({
                ...config,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (e) {
            alert("Erro ao salvar configurações.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleCopyWebhook = () => {
        navigator.clipboard.writeText(webhookUrl);
        alert("URL do Webhook copiada!");
    };

    if (isLoading) return <div className="flex justify-center py-20"><RefreshIcon className="w-10 h-10 animate-spin text-primary" /></div>;

    return (
        <div className="max-w-4xl mx-auto pb-20">
            <div className="flex justify-between items-center mb-8 px-4 md:px-0">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-green-500/20 rounded-2xl text-green-500">
                        <WhatsAppIcon className="w-8 h-8" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white uppercase tracking-tighter">API WhatsApp</h1>
                        <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">Integração Sure / Babysuri</p>
                    </div>
                </div>
                <button onClick={() => navigate(-1)} className="p-3 bg-gray-800 text-gray-400 rounded-2xl hover:text-white transition-colors">
                    <ArrowLeftIcon className="w-5 h-5"/>
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* WEBHOOK BOX */}
                    <div className="bg-primary/10 border border-primary/20 p-6 rounded-[2.5rem] space-y-4">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                             📡 Configuração do Webhook
                        </h3>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            Copie a URL abaixo e cole no campo <strong>Webhook</strong> do seu painel Sure. Isso permitirá que o sistema receba mensagens automaticamente.
                        </p>
                        <div className="flex gap-2">
                            <input 
                                readOnly 
                                value={webhookUrl}
                                className="flex-grow bg-dark border border-white/10 p-4 rounded-2xl text-[10px] text-primary font-mono outline-none" 
                            />
                            <button onClick={handleCopyWebhook} className="p-4 bg-primary text-white rounded-2xl hover:bg-primary-dark transition-all">
                                <DocumentDuplicateIcon className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="flex items-start gap-3 bg-dark/50 p-4 rounded-2xl border border-white/5">
                            <AlertTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0" />
                            <p className="text-[10px] text-gray-400 leading-tight">
                                <strong>Dica de Verificação:</strong> Ao clicar em verificar na Sure, o sistema enviará um teste GET. Nossa rota já está programada para responder com o ID do seu bot automaticamente.
                            </p>
                        </div>
                    </div>

                    {/* API CONFIG FORM */}
                    <div className="bg-secondary p-8 rounded-[2.5rem] border border-white/5 shadow-2xl space-y-8">
                        <form onSubmit={handleSave} className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 flex items-center gap-2">
                                    <LinkIcon className="w-3 h-3" /> URL do Endpoint (Azure)
                                </label>
                                <input 
                                    type="url" 
                                    placeholder="https://cbm-wap-babysuri-cb129855986.azurewebsites.net"
                                    value={config.apiUrl}
                                    onChange={e => setConfig({...config, apiUrl: e.target.value})}
                                    className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1 flex items-center gap-2">
                                        <KeyIcon className="w-3 h-3" /> Token de Acesso
                                    </label>
                                    <input 
                                        type="password" 
                                        placeholder="Seu Bearer Token"
                                        value={config.apiToken}
                                        onChange={e => setConfig({...config, apiToken: e.target.value})}
                                        className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-primary transition-all"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-gray-500 uppercase ml-1">ID da Instância / Bot</label>
                                    <input 
                                        type="text" 
                                        placeholder="Ex: 123456"
                                        value={config.instanceId}
                                        onChange={e => setConfig({...config, instanceId: e.target.value})}
                                        className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white font-mono text-sm outline-none focus:ring-2 focus:ring-primary transition-all"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-white/5">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <input 
                                        type="checkbox" 
                                        checked={config.isActive} 
                                        onChange={e => setConfig({...config, isActive: e.target.checked})}
                                        className="w-6 h-6 rounded-lg bg-dark border-gray-700 text-primary focus:ring-0" 
                                    />
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-white uppercase tracking-tight group-hover:text-primary transition-colors">Ativar Automações WhatsApp</span>
                                        <span className="text-[9px] text-gray-500 font-bold uppercase">Quando ativado, o sistema usará esta API para disparos.</span>
                                    </div>
                                </label>
                            </div>

                            <button 
                                type="submit" 
                                disabled={isSaving}
                                className="w-full py-5 bg-primary text-white font-black rounded-3xl shadow-xl shadow-primary/20 hover:bg-primary-dark transition-all uppercase text-xs tracking-widest disabled:opacity-50 flex items-center justify-center gap-3"
                            >
                                {isSaving ? <RefreshIcon className="w-4 h-4 animate-spin" /> : <CheckCircleIcon className="w-4 h-4" />}
                                {isSaving ? 'SALVANDO...' : 'SALVAR CONFIGURAÇÕES'}
                            </button>
                        </form>
                    </div>
                </div>

                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-dark/40 p-6 rounded-[2rem] border border-white/5 shadow-xl">
                        <h3 className="text-xs font-black text-primary uppercase tracking-widest mb-4">Apoio Técnico</h3>
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-800/50 rounded-2xl border border-white/5">
                                <p className="text-[10px] text-gray-400 leading-relaxed">
                                    Para o Webhook funcionar, a sua conta na Sure deve estar com o status <strong>Conectado</strong>.
                                </p>
                            </div>
                            <div className="p-4 bg-gray-800/50 rounded-2xl border border-white/5">
                                <p className="text-[9px] font-black text-white uppercase mb-1">Verificação:</p>
                                <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                    Nossa função identifica o ID que a Sure envia e responde na hora, garantindo que o botão de "Verificar" fique verde instantaneamente.
                                </p>
                            </div>
                        </div>
                    </div>

                    {success && (
                        <div className="bg-green-600 text-white p-4 rounded-2xl font-black text-[10px] uppercase text-center shadow-lg shadow-green-900/40 animate-fadeIn">
                            Configurações salvas com sucesso!
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AdminWhatsAppSettings;
