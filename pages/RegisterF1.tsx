
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addPromoter } from '../services/promoterService';
import { UserIcon, MailIcon, PhoneIcon, InstagramIcon, CameraIcon, CheckCircleIcon, ArrowLeftIcon } from '../components/Icons';

const RegisterF1: React.FC = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        whatsapp: '',
        instagram: '',
        dateOfBirth: '',
    });
    const [photos, setPhotos] = useState<File[]>([]);
    const [previews, setPreviews] = useState<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            // FIX: Explicitly cast the resulting array from Array.from as File[] to ensure compatibility with URL.createObjectURL which expects a Blob.
            const files = Array.from(e.target.files) as File[];
            setPhotos(files);
            setPreviews(files.map(f => URL.createObjectURL(f)));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            if (photos.length === 0) throw new Error("Por favor, envie ao menos uma foto.");

            await addPromoter({
                ...formData,
                photos,
                state: 'CE', // Valor padrão ou detectado
                organizationId: 'f1-official', // ID do seu banco para F1
                campaignName: 'Divulgadora F1',
                tiktok: ''
            });
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || "Erro ao enviar cadastro.");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="max-w-md mx-auto text-center py-20 animate-fadeIn">
                <div className="bg-secondary p-10 rounded-3xl shadow-2xl border border-green-500/30">
                    <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
                    <h1 className="text-3xl font-black text-white mb-4">Cadastro Enviado!</h1>
                    <p className="text-gray-400 mb-8">Nossa equipe analisará seu perfil F1. Você receberá um e-mail assim que for aprovada.</p>
                    <button onClick={() => navigate('/status')} className="w-full py-3 bg-primary text-white font-bold rounded-full hover:bg-primary-dark transition-all">Ver meu Status</button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl mx-auto py-8 px-4">
            <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">
                <ArrowLeftIcon className="w-5 h-5" /> <span>Voltar</span>
            </button>

            <div className="bg-secondary shadow-2xl rounded-3xl overflow-hidden border border-gray-800">
                <div className="bg-primary/20 p-8 text-center border-b border-gray-800">
                    <h1 className="text-4xl font-black text-white uppercase tracking-tighter">Seja Divulgadora <span className="text-primary">F1</span></h1>
                    <p className="text-gray-400 mt-2 font-medium">Preencha seus dados para análise de perfil</p>
                </div>

                <form onSubmit={handleSubmit} className="p-8 space-y-6">
                    {error && <div className="bg-red-900/40 border border-red-800 text-red-200 p-4 rounded-xl text-sm">{error}</div>}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="relative">
                            <UserIcon className="absolute left-4 top-4 text-gray-500 w-5 h-5" />
                            <input name="name" placeholder="Nome Completo" onChange={handleChange} required className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" />
                        </div>
                        <div className="relative">
                            <MailIcon className="absolute left-4 top-4 text-gray-500 w-5 h-5" />
                            <input type="email" name="email" placeholder="Seu E-mail" onChange={handleChange} required className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" />
                        </div>
                        <div className="relative">
                            <PhoneIcon className="absolute left-4 top-4 text-gray-500 w-5 h-5" />
                            <input name="whatsapp" placeholder="WhatsApp com DDD" onChange={handleChange} required className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" />
                        </div>
                        <div className="relative">
                            <InstagramIcon className="absolute left-4 top-4 text-gray-500 w-5 h-5" />
                            <input name="instagram" placeholder="@seuinstagram" onChange={handleChange} required className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-2xl text-white focus:ring-2 focus:ring-primary outline-none" />
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-bold text-gray-400 uppercase tracking-widest">Fotos (Corpo e Rosto)</label>
                        <div className="p-10 border-2 border-dashed border-gray-700 rounded-3xl bg-gray-800/30 hover:border-primary/50 transition-all text-center">
                            <label className="cursor-pointer">
                                <CameraIcon className="w-12 h-12 text-primary mx-auto mb-2" />
                                <span className="text-white font-bold block">Selecionar Fotos</span>
                                <input type="file" multiple onChange={handleFileChange} className="hidden" accept="image/*" />
                            </label>
                        </div>
                        <div className="flex gap-2 overflow-x-auto py-2">
                            {previews.map((src, i) => (
                                <img key={i} src={src} className="w-24 h-24 object-cover rounded-xl border border-gray-700" alt="Preview" />
                            ))}
                        </div>
                    </div>

                    <button type="submit" disabled={isSubmitting} className="w-full py-5 bg-primary text-white font-black text-xl rounded-2xl hover:bg-primary-dark transition-all transform hover:scale-[1.02] disabled:opacity-50">
                        {isSubmitting ? 'ENVIANDO...' : 'FINALIZAR CADASTRO F1'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default RegisterF1;
