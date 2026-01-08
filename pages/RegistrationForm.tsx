
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { addPromoter, getLatestPromoterProfileByEmail } from '../services/promoterService';
import { 
  UserIcon, MailIcon, PhoneIcon, CalendarIcon, CameraIcon,
  ArrowLeftIcon, CheckCircleIcon, WhatsAppIcon, MapPinIcon, RefreshIcon
} from '../components/Icons';
import { stateMap } from '../constants/states';

const RegistrationForm: React.FC = () => {
  const { organizationId, state, campaignName: campaignNameFromUrl } = useParams<{ organizationId: string; state: string; campaignName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const editId = queryParams.get('edit_id');
  
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    whatsapp: '',
    instagram: '',
    taxId: '',
    dateOfBirth: '',
    zipCode: '',
    city: '',
    street: '',
    number: '',
    campaignName: campaignNameFromUrl ? decodeURIComponent(campaignNameFromUrl) : '',
  });
  
  const [facePhoto, setFacePhoto] = useState<File | null>(null);
  const [bodyPhotos, setBodyPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<{face: string | null, body: string[]}>({face: null, body: []});
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAutoFilling, setIsAutoFilling] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatCPF = (v: string) => v.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4").substring(0, 14);
  const formatPhone = (v: string) => {
    const n = v.replace(/\D/g, '');
    return n.length <= 10 ? n.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3") : n.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
  };

  const handleEmailBlur = async () => {
    const email = formData.email.trim().toLowerCase();
    if (!email || !email.includes('@') || editId) return;
    setIsAutoFilling(true);
    try {
        const latest = await getLatestPromoterProfileByEmail(email);
        if (latest) {
            setFormData(prev => ({
                ...prev,
                name: latest.name,
                whatsapp: formatPhone(latest.whatsapp),
                instagram: latest.instagram,
                taxId: formatCPF(latest.taxId || ''),
                dateOfBirth: latest.dateOfBirth,
                zipCode: latest.address?.zipCode || '',
                city: latest.address?.city || '',
                street: latest.address?.street || '',
            }));
            if (latest.facePhotoUrl) setPreviews(p => ({ ...p, face: latest.facePhotoUrl }));
        }
    } catch (e) { console.warn("Auto-fill error"); } finally { setIsAutoFilling(false); }
  };

  const handleFaceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          setFacePhoto(file);
          // FIX: Cast file to Blob to satisfy createObjectURL
          setPreviews(p => ({ ...p, face: URL.createObjectURL(file as Blob) }));
      }
  };

  const handleBodyFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const filesList = Array.from(e.target.files as FileList).slice(0, 3);
          setBodyPhotos(filesList);
          // FIX: Cast files to Blob to satisfy createObjectURL
          setPreviews(p => ({ ...p, body: filesList.map(f => URL.createObjectURL(f as Blob)) }));
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facePhoto && !previews.face) { setError("A foto de rosto é obrigatória."); return; }
    if (bodyPhotos.length === 0 && previews.body.length === 0) { setError("Envie ao menos uma foto de corpo/look."); return; }
    
    setIsSubmitting(true);
    setError(null);
    try {
      await addPromoter({
        ...formData,
        whatsapp: formData.whatsapp.replace(/\D/g, ''),
        taxId: formData.taxId.replace(/\D/g, ''),
        facePhoto,
        bodyPhotos,
        state: state || 'CE',
        organizationId: organizationId!,
        address: {
            zipCode: formData.zipCode,
            street: formData.street,
            number: formData.number,
            city: formData.city,
            state: state || 'CE'
        }
      } as any);
      setIsSuccess(true);
    } catch (err: any) {
      setError(err.message || "Erro ao salvar cadastro.");
      setIsSubmitting(false);
    }
  };

  const handleContactAdmin = () => {
      const msg = `Olá! Acabei de realizar meu cadastro para a equipe de divulgação do evento ${formData.campaignName}. Meu e-mail é ${formData.email}.`;
      window.open(`https://wa.me/5585982280780?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (isSuccess) return (
      <div className="max-w-2xl mx-auto py-20 px-4 text-center">
        <div className="bg-secondary/60 backdrop-blur-xl p-12 rounded-[3rem] border border-green-500/30 shadow-2xl animate-fadeIn">
          <CheckCircleIcon className="w-20 h-20 text-green-500 mx-auto mb-6" />
          <h1 className="text-4xl font-black text-white uppercase mb-4 tracking-tighter">CADASTRO REALIZADO!</h1>
          <p className="text-gray-400 text-lg mb-10">Seu perfil entrou em nossa fila de análise prioritária. Aguarde o retorno em até 24h.</p>
          <div className="space-y-4">
              <button onClick={handleContactAdmin} className="w-full py-5 bg-green-600 text-white font-black rounded-2xl flex items-center justify-center gap-3 hover:bg-green-500 transition-all shadow-lg shadow-green-900/20">
                  <WhatsAppIcon className="w-6 h-6" /> AVISAR COORDENADOR
              </button>
              <button onClick={() => navigate('/status')} className="w-full py-5 bg-gray-800 text-white font-bold rounded-2xl hover:bg-gray-700 transition-all">CONSULTAR MEU STATUS</button>
          </div>
        </div>
      </div>
  );

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 pb-24">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-white mb-8 font-black text-[10px] uppercase tracking-widest transition-all">
        <ArrowLeftIcon className="w-4 h-4" /> Voltar
      </button>

      <div className="bg-secondary/40 backdrop-blur-2xl shadow-3xl rounded-[3rem] overflow-hidden border border-white/5">
        <div className="bg-gradient-to-br from-primary/40 to-transparent p-12 text-center border-b border-white/5">
          <h1 className="text-5xl font-black text-white uppercase tracking-tighter leading-none">Ficha de <span className="text-primary">Inscrição</span></h1>
          <p className="text-gray-400 mt-4 font-bold uppercase text-[10px] tracking-[0.4em]">{stateMap[state || ''] || state} • {formData.campaignName}</p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 md:p-14 space-y-12">
          {error && <div className="bg-red-900/40 border border-red-500/50 text-red-200 p-5 rounded-2xl text-sm font-bold text-center animate-shake">{error}</div>}

          {/* DADOS PESSOAIS */}
          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3"><UserIcon className="w-6 h-6 text-primary" /> Identificação Profissional</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4 flex justify-between">
                    E-mail
                    {isAutoFilling && <span className="text-primary animate-pulse font-black">Sincronizando...</span>}
                </label>
                <div className="relative">
                  <MailIcon className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" />
                  <input type="email" required value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} onBlur={handleEmailBlur} className="w-full pl-14 pr-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold transition-all" placeholder="exemplo@gmail.com"/>
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4">Nome Completo (Conforme Identidade)</label>
                <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="Nome e Sobrenome"/>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4">WhatsApp</label>
                <input type="tel" required value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: formatPhone(e.target.value)})} className="w-full px-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="(00) 00000-0000"/>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4">Instagram</label>
                <input type="text" required value={formData.instagram} onChange={e => setFormData({...formData, instagram: e.target.value})} className="w-full px-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="@seu_perfil"/>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4">CPF (Para Lista)</label>
                <input type="tel" required value={formData.taxId} onChange={e => setFormData({...formData, taxId: formatCPF(e.target.value)})} className="w-full px-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" placeholder="000.000.000-00"/>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase ml-4">Data de Nascimento</label>
                <input type="date" required value={formData.dateOfBirth} onChange={e => setFormData({...formData, dateOfBirth: e.target.value})} className="w-full px-6 py-5 bg-dark border border-white/10 rounded-3xl text-white outline-none focus:ring-2 focus:ring-primary font-bold" style={{ colorScheme: 'dark' }}/>
              </div>
            </div>
          </div>

          {/* FOTOS CATEGORIZADAS */}
          <div className="space-y-8">
            <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-3"><CameraIcon className="w-6 h-6 text-primary" /> Mídia de Apresentação</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* ROSTO */}
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Foto de Rosto (Principal)</p>
                    <label className="relative aspect-square rounded-3xl bg-dark border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-all overflow-hidden group">
                        {previews.face ? (
                            <img src={previews.face} className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" alt="Rosto" />
                        ) : (
                            <div className="text-center p-4">
                                <UserIcon className="w-10 h-10 text-gray-700 mx-auto mb-2" />
                                <span className="text-[10px] font-black text-gray-600 uppercase">Anexar Close</span>
                            </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" onChange={handleFaceFile} />
                    </label>
                </div>

                {/* CORPO / LOOK */}
                <div className="space-y-4">
                    <p className="text-[10px] font-black text-gray-500 uppercase ml-1 tracking-widest">Fotos de Look / Corpo (Até 3)</p>
                    <div className="grid grid-cols-2 gap-3 h-full">
                        {previews.body.map((src, i) => (
                            <img key={i} src={src} className="aspect-square rounded-2xl object-cover border border-white/5 shadow-xl" alt=""/>
                        ))}
                        {previews.body.length < 3 && (
                            <label className="aspect-square rounded-2xl bg-dark border-2 border-dashed border-white/10 flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-all group">
                                <CameraIcon className="w-6 h-6 text-gray-700 group-hover:text-primary mb-1" />
                                <span className="text-[8px] font-black text-gray-600 uppercase">Adicionar</span>
                                <input type="file" multiple accept="image/*" className="hidden" onChange={handleBodyFiles} />
                            </label>
                        )}
                    </div>
                </div>
            </div>
          </div>

          <div className="pt-8 border-t border-white/5 space-y-8">
             <div className="bg-primary/5 p-6 rounded-3xl border border-primary/10">
                <p className="text-xs text-gray-400 font-medium leading-relaxed italic">
                    Ao enviar esta ficha, você autoriza a <strong>Equipe Certa</strong> a utilizar seus dados para fins de credenciamento e validação de presença em nossos eventos. Seus dados são protegidos por criptografia de ponta a ponta.
                </p>
             </div>

             <button type="submit" disabled={isSubmitting} className="w-full py-6 bg-primary text-white font-black text-2xl rounded-[2rem] shadow-2xl shadow-primary/40 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 flex items-center justify-center gap-4">
                {isSubmitting ? (
                    <>
                        <RefreshIcon className="w-8 h-8 animate-spin" />
                        <span>ENVIANDO MÍDIAS...</span>
                    </>
                ) : 'FINALIZAR INSCRIÇÃO'}
              </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegistrationForm;
