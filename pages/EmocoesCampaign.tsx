
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { findPromotersByEmail, submitEmocoesProof } from '../services/promoterService';
import { Promoter } from '../types';
import { 
  ArrowLeftIcon, TicketIcon, WhatsAppIcon, 
  CameraIcon, MailIcon, CheckCircleIcon, SparklesIcon,
  DocumentDuplicateIcon, AlertTriangleIcon, UserIcon,
  UsersIcon
} from '../components/Icons';

type CampaignStep = 'benefits' | 'identify' | 'payment' | 'success';

const EmocoesCampaign: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<CampaignStep>('benefits');
    const [email, setEmail] = useState('');
    const [promoter, setPromoter] = useState<Promoter | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const PIX_KEY = "pix@equipecerta.com.br"; 

    const handleCheckEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedEmail = email.trim().toLowerCase();
        if (!trimmedEmail) return;

        setIsLoading(true);
        setError(null);
        try {
            const profiles = await findPromotersByEmail(trimmedEmail);
            if (profiles.length > 0) {
                setPromoter(profiles[0]);
                setStep('payment');
            } else {
                setError("E-mail não encontrado. Você precisa realizar seu cadastro inicial em uma de nossas produtoras parceiras antes de aderir ao Clube de Benefícios.");
            }
        } catch (err) {
            setError("Erro ao verificar dados.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setProofFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleSubmitProof = async () => {
        if (!promoter || !proofFile) return;
        setIsLoading(true);
        setError(null);
        try {
            await submitEmocoesProof(promoter.id, proofFile);
            setStep('success');
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCopyPix = () => {
        navigator.clipboard.writeText(PIX_KEY);
        alert("Chave PIX copiada!");
    };

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
                <ArrowLeftIcon className="w-4 h-4" /> Voltar
            </button>

            <div className="bg-secondary/40 backdrop-blur-2xl rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl">
                {/* Cabeçalho */}
                <div className="bg-gradient-to-br from-indigo-900/40 to-purple-900/20 p-10 text-center border-b border-white/5">
                    <div className="w-16 h-16 bg-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary border border-primary/20">
                        <SparklesIcon className="w-10 h-10" />
                    </div>
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter leading-none mb-2">Membro <span className="text-primary">Oficial</span></h1>
                    <p className="text-gray-400 font-bold uppercase text-[10px] tracking-[0.3em]">Clube de Benefícios & Vantagens</p>
                </div>

                <div className="p-8 md:p-12">
                    {error && <div className="mb-6 p-4 bg-red-900/20 border border-red-500/50 text-red-300 rounded-2xl text-xs font-bold text-center animate-shake">{error}</div>}

                    {step === 'benefits' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="space-y-4">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Vantagens de ser Membro</h2>
                                <div className="grid gap-4">
                                    <div className="bg-dark/40 p-5 rounded-2xl border border-white/5 flex gap-4">
                                        <TicketIcon className="w-8 h-8 text-green-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-white font-black text-sm uppercase">Cortesias Selecionadas</p>
                                            <p className="text-gray-400 text-xs mt-1">Tenha acesso a ingressos free para eventos parceiros selecionados ao longo do ano.</p>
                                        </div>
                                    </div>
                                    <div className="bg-dark/40 p-5 rounded-2xl border border-white/5 flex gap-4">
                                        <SparklesIcon className="w-8 h-8 text-yellow-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-white font-black text-sm uppercase">Descontos em Ingressos</p>
                                            <p className="text-gray-400 text-xs mt-1">Receba códigos promocionais exclusivos para compra de ingressos nos maiores shows.</p>
                                        </div>
                                    </div>
                                    <div className="bg-dark/40 p-5 rounded-2xl border border-white/5 flex gap-4">
                                        <UsersIcon className="w-8 h-8 text-blue-500 flex-shrink-0" />
                                        <div>
                                            <p className="text-white font-black text-sm uppercase">Sorteios de Camarim</p>
                                            <p className="text-gray-400 text-xs mt-1">Como membro oficial, você participa automaticamente de sorteios para conhecer artistas.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-white/5">
                                <p className="text-center text-gray-500 text-[10px] font-black uppercase mb-6 tracking-widest">Taxa de Adesão Única: R$ 50,00</p>
                                <button onClick={() => setStep('identify')} className="w-full py-5 bg-primary text-white font-black text-lg rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] transition-all uppercase tracking-widest">Fazer Parte do Clube!</button>
                            </div>
                        </div>
                    )}

                    {step === 'identify' && (
                        <div className="space-y-6 animate-fadeIn">
                            <div className="text-center space-y-2">
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">Identificação</h2>
                                <p className="text-gray-400 text-sm">Use o e-mail que você cadastrou no sistema.</p>
                            </div>
                            <form onSubmit={handleCheckEmail} className="space-y-4">
                                <div className="relative">
                                    <MailIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                                    <input 
                                        type="email" required value={email} onChange={e => setEmail(e.target.value)}
                                        className="w-full pl-14 pr-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold"
                                        placeholder="Seu e-mail cadastrado"
                                    />
                                </div>
                                <button type="submit" disabled={isLoading} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl disabled:opacity-50">
                                    {isLoading ? 'VERIFICANDO...' : 'PROSSEGUIR'}
                                </button>
                                <p onClick={() => setStep('benefits')} className="text-center text-[10px] text-gray-600 font-black uppercase tracking-widest cursor-pointer hover:text-white">Voltar para benefícios</p>
                            </form>
                        </div>
                    )}

                    {step === 'payment' && (
                        <div className="space-y-8 animate-fadeIn">
                            <div className="bg-primary/10 p-6 rounded-3xl border border-primary/20 text-center">
                                <p className="text-primary text-xs font-black uppercase tracking-widest mb-2">Olá, {promoter?.name.split(' ')[0]}!</p>
                                <h2 className="text-white text-lg font-bold leading-tight">Para ativar seus benefícios, realize o pagamento da taxa de adesão via PIX.</h2>
                            </div>

                            <div className="bg-dark/60 p-6 rounded-3xl border border-white/5 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Taxa de Adesão</span>
                                    <span className="text-2xl font-black text-white">R$ 50,00</span>
                                </div>
                                <div className="p-4 bg-dark rounded-2xl border border-white/5 flex items-center justify-between">
                                    <div className="overflow-hidden mr-4">
                                        <p className="text-[10px] text-gray-500 font-black uppercase">Chave PIX (E-mail)</p>
                                        <p className="text-white font-mono text-sm truncate">{PIX_KEY}</p>
                                    </div>
                                    <button onClick={handleCopyPix} className="p-3 bg-gray-800 text-primary rounded-xl hover:bg-gray-700">
                                        <DocumentDuplicateIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Anexar Comprovante do Pagamento</label>
                                <div className="flex items-center gap-4">
                                    <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-white/10 rounded-2xl bg-dark/40 py-6 cursor-pointer hover:border-primary transition-all">
                                        {previewUrl ? (
                                            <img src={previewUrl} className="w-20 h-20 object-cover rounded-lg" alt="Preview" />
                                        ) : (
                                            <>
                                                <CameraIcon className="w-8 h-8 text-gray-600 mb-2" />
                                                <span className="text-[9px] font-black text-gray-600 uppercase">Selecionar Imagem</span>
                                            </>
                                        )}
                                        <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
                                    </label>
                                </div>
                                <button 
                                    onClick={handleSubmitProof} 
                                    disabled={isLoading || !proofFile} 
                                    className="w-full py-5 bg-green-600 text-white font-black text-lg rounded-2xl shadow-xl shadow-green-900/20 disabled:opacity-30"
                                >
                                    {isLoading ? 'ENVIANDO...' : 'ATIVAR MEU ACESSO'}
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'success' && (
                        <div className="text-center space-y-6 animate-fadeIn py-6">
                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                                <CheckCircleIcon className="w-12 h-12 text-green-500" />
                            </div>
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Recebido!</h2>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Seu comprovante foi enviado para análise. Assim que confirmado, seus vouchers e sorteios aparecerão na aba <strong>"Meus Prêmios"</strong> dentro do seu portal.
                            </p>
                            <div className="bg-blue-900/20 border border-blue-500/30 p-6 rounded-3xl">
                                <p className="text-blue-300 font-bold uppercase text-[10px] tracking-widest mb-3">⚠️ Aviso Importante</p>
                                <p className="text-gray-300 text-xs leading-relaxed">
                                    Mantenha nosso <strong>Aplicativo Oficial</strong> instalado para receber novidades em tempo real sobre as próximas cortesias e resultados de sorteios.
                                </p>
                            </div>
                            <button onClick={() => navigate('/posts')} className="w-full py-5 bg-primary text-white font-black rounded-2xl shadow-xl">IR PARA MEU PORTAL</button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default EmocoesCampaign;
