
import React, { useEffect, useRef } from 'react';
import { LogoIcon, SparklesIcon, CalendarIcon, CheckCircleIcon, ClockIcon, MapPinIcon } from './Icons';
import { VipMembership } from '../types';

interface VipTicketProps {
    membership: VipMembership;
    onClose?: () => void;
    isExporting?: boolean;
}

const VipTicket: React.FC<VipTicketProps> = ({ membership, onClose, isExporting = false }) => {
    const qrRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (qrRef.current && membership.benefitCode) {
            qrRef.current.innerHTML = '';
            new (window as any).QRCode(qrRef.current, {
                text: membership.benefitCode,
                width: 200,
                height: 200,
                colorDark: "#ffffff",
                colorLight: "rgba(0,0,0,0)",
                correctLevel: (window as any).QRCode.CorrectLevel.H
            });
        }
    }, [membership.benefitCode]);

    // Container com dimensões travadas para garantir 1 página única no PDF
    const ticketStyle = isExporting 
        ? { width: '400px', height: '700px', margin: '0', display: 'flex', flexDirection: 'column' as const } 
        : { width: '100%', maxWidth: '380px' };

    const content = (
        <div 
            id={`ticket-content-${membership.id}`} 
            className="relative bg-[#000000] border border-white/10 rounded-[3rem] overflow-hidden shadow-2xl flex flex-col"
            style={ticketStyle}
        >
            {/* CABEÇALHO COM LOGO (HERO) */}
            <div className="bg-gradient-to-br from-primary/80 via-primary-dark to-black p-10 text-center relative border-b border-white/5">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
                <div className="relative z-10 flex flex-col items-center">
                    
                    {/* Logo Principal com tamanho fixo para estabilidade no PDF */}
                    <LogoIcon width="220" height="44" className="text-white brightness-150 mb-6" />

                    <h1 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-2">
                        {membership.vipEventName}
                    </h1>
                    <p className="text-primary-light text-[10px] font-black uppercase tracking-[0.3em] opacity-80">Acesso Exclusivo Credenciado</p>
                </div>
            </div>

            {/* DIVISOR ESTILIZADO (TICKET TEAR) */}
            <div className="relative h-6 bg-black">
                <div className="absolute left-[-20px] top-[-12px] w-12 h-12 bg-black rounded-full border border-white/10 z-20"></div>
                <div className="absolute right-[-20px] top-[-12px] w-12 h-12 bg-black rounded-full border border-white/10 z-20"></div>
                <div className="border-t-2 border-dashed border-white/10 w-full absolute top-[12px] opacity-20"></div>
            </div>

            {/* ÁREA DO QR CODE E DADOS */}
            <div className="p-8 pt-4 flex-grow flex flex-col justify-between text-center bg-black">
                
                <div className="space-y-1">
                    <p className="text-[9px] font-black text-gray-500 uppercase tracking-[0.4em]">Proprietário(a)</p>
                    <h2 className="text-2xl font-black text-white uppercase truncate px-2">{membership.promoterName}</h2>
                </div>

                <div className="flex justify-center my-4">
                    <div className="p-5 bg-white/5 rounded-[2.5rem] border border-white/10 shadow-2xl relative">
                        <div className="absolute -inset-1 bg-gradient-to-r from-primary/30 to-accent/30 rounded-[2.5rem] blur opacity-20"></div>
                        <div ref={qrRef} className="bg-transparent relative z-10"></div>
                        <div className="mt-4 pt-3 border-t border-white/5 relative z-10">
                            <p className="text-xs font-mono font-black text-primary tracking-[0.4em]">{membership.benefitCode}</p>
                        </div>
                    </div>
                </div>

                {/* INFO DA FESTA (HORARIO E LOCAL) */}
                <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5 bg-white/[0.02] rounded-2xl mb-4">
                    <div className="text-center border-r border-white/5 px-2">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Início</p>
                        <div className="flex items-center justify-center gap-1.5 text-gray-300">
                            <ClockIcon className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className="text-[10px] font-black uppercase truncate">{membership.eventTime || '22h00'}</span>
                        </div>
                    </div>
                    <div className="text-center px-2">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Onde</p>
                        <div className="flex items-center justify-center gap-1.5 text-gray-300">
                            <MapPinIcon className="w-3 h-3 text-primary flex-shrink-0" />
                            <span className="text-[10px] font-black uppercase truncate">{membership.eventLocation || 'Marina Park'}</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div className="text-left">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Emissão</p>
                        <p className="text-[10px] font-bold text-gray-400 uppercase">{new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="text-right">
                        <p className="text-[8px] font-black text-gray-600 uppercase mb-1 tracking-widest">Segurança</p>
                        <p className="text-[10px] font-black text-green-400 uppercase tracking-tighter">VÁLIDO ✅</p>
                    </div>
                </div>

                <div className="mt-4">
                    <p className="text-[8px] text-gray-700 uppercase font-black leading-relaxed tracking-[0.2em]">
                        EQUIPE CERTA • CREDENCIAL INDIVIDUAL
                    </p>
                </div>
            </div>
        </div>
    );

    if (isExporting) return content;

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[200] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div className="w-full max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
                
                <div className="flex justify-end items-center mb-6">
                    {onClose && (
                        <button onClick={onClose} className="text-gray-500 font-black uppercase text-[10px] tracking-widest hover:text-white transition-colors border border-white/10 px-4 py-2 rounded-full">Fechar [X]</button>
                    )}
                </div>

                {content}

                <div className="mt-8 flex flex-col items-center gap-4">
                    <p className="text-gray-500 text-[10px] font-black uppercase tracking-[0.2em] animate-pulse text-center leading-relaxed">
                        Apresente esta tela na entrada<br/>ou use o arquivo PDF.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default VipTicket;
