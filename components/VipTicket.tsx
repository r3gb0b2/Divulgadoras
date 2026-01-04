
import React, { useEffect, useRef } from 'react';
import { LogoIcon, SparklesIcon, CalendarIcon, CheckCircleIcon, DownloadIcon } from './Icons';
import { VipMembership } from '../types';

interface VipTicketProps {
    membership: VipMembership;
    onClose: () => void;
}

const VipTicket: React.FC<VipTicketProps> = ({ membership, onClose }) => {
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (qrRef.current && membership.benefitCode) {
            qrRef.current.innerHTML = '';
            new (window as any).QRCode(qrRef.current, {
                text: membership.benefitCode,
                width: 180,
                height: 180,
                colorDark: "#ffffff",
                colorLight: "rgba(0,0,0,0)",
                correctLevel: (window as any).QRCode.CorrectLevel.H
            });
        }
    }, [membership.benefitCode]);

    const handleDownloadTicket = () => {
        alert("Para salvar o ingresso completo, tire um print da tela. Esta é a forma mais segura de garantir a formatação no seu celular.");
    };

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="w-full max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
                
                {/* BOTÃO FECHAR */}
                <div className="flex justify-between items-center mb-6">
                    <LogoIcon className="h-8 text-white brightness-200" />
                    <button onClick={onClose} className="text-gray-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors border border-white/10 px-3 py-1 rounded-full">Fechar [X]</button>
                </div>

                {/* CORPO DO INGRESSO */}
                <div className="relative bg-[#121212] border border-white/10 rounded-[3rem] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                    
                    {/* PARTE SUPERIOR (LOGO E CABEÇALHO) */}
                    <div className="bg-gradient-to-br from-primary via-primary-dark to-[#121212] p-10 text-center relative border-b border-white/5">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-20"></div>
                        <div className="relative z-10">
                            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full border border-white/10 mb-6">
                                <SparklesIcon className="w-3 h-3 text-accent animate-pulse" />
                                <span className="text-[9px] font-black text-white uppercase tracking-[0.2em]">Credential VIP Official</span>
                            </div>
                            <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">
                                {membership.vipEventName}
                            </h1>
                            <p className="text-primary-light text-[10px] font-bold uppercase tracking-widest opacity-80">Acesso Exclusivo Equipe Certa</p>
                        </div>
                    </div>

                    {/* RECORTE LATERAL (CÍRCULOS) */}
                    <div className="absolute left-[-20px] top-[48%] w-10 h-10 bg-black rounded-full border-r border-white/10 z-20 shadow-inner"></div>
                    <div className="absolute right-[-20px] top-[48%] w-10 h-10 bg-black rounded-full border-l border-white/10 z-20 shadow-inner"></div>
                    
                    {/* LINHA PONTILHADA */}
                    <div className="border-t-2 border-dashed border-white/10 w-full absolute top-[51%] opacity-30"></div>

                    {/* PARTE INFERIOR (DADOS E QR) */}
                    <div className="p-10 pt-16 space-y-10 text-center">
                        
                        <div className="space-y-1">
                            <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em]">Titular da Credencial</p>
                            <h2 className="text-2xl font-black text-white uppercase truncate px-2">{membership.promoterName}</h2>
                        </div>

                        <div className="flex justify-center">
                            <div className="p-5 bg-white/5 rounded-[2rem] border border-white/10 shadow-2xl relative group">
                                <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-accent/50 rounded-[2rem] blur opacity-20 group-hover:opacity-40 transition-opacity"></div>
                                <div ref={qrRef} className="bg-transparent relative z-10"></div>
                                <div className="mt-5 pt-4 border-t border-white/5 relative z-10">
                                    <p className="text-xs font-mono font-black text-primary tracking-[0.4em]">{membership.benefitCode}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-6 border-t border-white/5 pt-8">
                            <div className="text-left">
                                <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Emitido em</p>
                                <div className="flex items-center gap-2 text-gray-300">
                                    <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                                    <span className="text-xs font-bold uppercase">{new Date().toLocaleDateString('pt-BR')}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Validação</p>
                                <div className="flex items-center justify-end gap-2 text-green-400">
                                    <CheckCircleIcon className="w-3.5 h-3.5" />
                                    <span className="text-xs font-black uppercase tracking-tighter">Confirmada</span>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <p className="text-[9px] text-gray-600 uppercase font-black leading-relaxed tracking-wider">
                                Esta credencial é pessoal e intransferível.<br/>
                                Proibida a venda ou compartilhamento.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="mt-8 flex flex-col items-center gap-4">
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                        Tire um Print desta tela para entrar
                    </p>
                </div>
            </div>
        </div>
    );
};

export default VipTicket;
