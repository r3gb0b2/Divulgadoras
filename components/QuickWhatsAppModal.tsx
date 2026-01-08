
import React, { useState } from 'react';
import { Promoter, RecoveryTemplate } from '../types';
import { WhatsAppIcon, XIcon, RefreshIcon, CheckCircleIcon, SparklesIcon } from './Icons';
import { functions } from '../firebase/config';
import { httpsCallable } from 'firebase/functions';

interface QuickWhatsAppModalProps {
    isOpen: boolean;
    onClose: () => void;
    promoter: Promoter | null;
    templates: RecoveryTemplate[];
}

const QuickWhatsAppModal: React.FC<QuickWhatsAppModalProps> = ({ isOpen, onClose, promoter, templates }) => {
    const [message, setMessage] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [success, setSuccess] = useState(false);

    if (!isOpen || !promoter) return null;

    const handleSend = async () => {
        if (!message.trim()) return;
        setIsSending(true);
        try {
            const sendDirect = httpsCallable(functions, 'sendDirectWhatsApp');
            await sendDirect({
                promoterId: promoter.id,
                message: message.trim(),
                whatsapp: promoter.whatsapp
            });
            setSuccess(true);
            setTimeout(() => {
                setSuccess(false);
                onClose();
            }, 2000);
        } catch (e: any) {
            alert("Erro ao enviar: " + e.message);
        } finally {
            setIsSending(false);
        }
    };

    const applyTemplate = (t: RecoveryTemplate) => {
        const text = t.text
            .replace(/{{nome}}/g, promoter.name.split(' ')[0])
            .replace(/{{evento}}/g, promoter.campaignName || 'evento');
        setMessage(text);
    };

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-secondary w-full max-w-lg p-8 rounded-[2.5rem] border border-white/10 shadow-2xl animate-slideUp" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-500/20 rounded-xl text-green-500">
                            <WhatsAppIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-white uppercase tracking-tight">Direct Message</h2>
                            <p className="text-[9px] text-gray-500 font-bold uppercase">{promoter.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white"><XIcon className="w-6 h-6"/></button>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1 mb-2 block">Selecione um Modelo</label>
                        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                            {templates.map(t => (
                                <button key={t.id} onClick={() => applyTemplate(t)} className="px-4 py-2 bg-gray-800 border border-white/5 rounded-xl text-[9px] font-black text-gray-400 whitespace-nowrap hover:bg-primary/20 hover:text-primary transition-all">
                                    {t.title.toUpperCase()}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase ml-1">Mensagem Personalizada</label>
                        <textarea 
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            rows={6}
                            placeholder="Olá! Como podemos ajudar hoje?..."
                            className="w-full bg-dark border border-gray-700 rounded-2xl p-4 text-white text-sm outline-none focus:border-primary transition-all shadow-inner"
                        />
                    </div>

                    <button 
                        onClick={handleSend}
                        disabled={isSending || !message.trim()}
                        className="w-full py-5 bg-green-600 text-white font-black rounded-3xl shadow-xl shadow-green-900/20 hover:bg-green-500 transition-all uppercase text-xs tracking-widest disabled:opacity-50 flex items-center justify-center gap-3"
                    >
                        {isSending ? <RefreshIcon className="w-5 h-5 animate-spin" /> : success ? <CheckCircleIcon className="w-5 h-5" /> : <WhatsAppIcon className="w-5 h-5" />}
                        {isSending ? 'ENVIANDO...' : success ? 'MENSAGEM ENVIADA!' : 'ENVIAR VIA WHATSAPP'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickWhatsAppModal;
