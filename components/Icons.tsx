
import React from 'react';

const createIcon = (path: React.ReactNode): React.FC<React.SVGProps<SVGSVGElement>> => (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        {path}
    </svg>
);

const createStrokeIcon = (path: React.ReactNode): React.FC<React.SVGProps<SVGSVGElement>> => (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        {path}
    </svg>
);

export const LogoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg viewBox="0 0 900 200" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id="logoPurple" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#8B3DFF', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#6A1B9A', stopOpacity: 1 }} />
        </linearGradient>
        <linearGradient id="logoGold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: '#FFD700', stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: '#FFA500', stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      
      {/* Símbolo do Checkmark */}
      <circle cx="100" cy="100" r="85" fill="url(#logoPurple)" />
      <path d="M 55 100 L 90 135 L 145 80" 
            stroke="url(#logoGold)" 
            strokeWidth="28" 
            fill="none" 
            strokeLinecap="round" 
            strokeLinejoin="round" />
      
      {/* Texto Logo */}
      <text x="220" y="135" 
            fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" 
            fontSize="130" 
            fontWeight="900" 
            fill="white"
            letterSpacing="-5">
        Equipe Certa
      </text>
    </svg>
);

export const MenuIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
);

export const XIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
);

export const LogoutIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
);

export const GripDotsIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" {...props}>
      <circle cx="8" cy="2" r="1.5" />
      <circle cx="8" cy="8" r="1.5" />
      <circle cx="8" cy="14" r="1.5" />
      <circle cx="2" cy="2" r="1.5" />
      <circle cx="2" cy="8" r="1.5" />
      <circle cx="2" cy="14" r="1.5" />
    </svg>
);

export const FaceIdIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a15.953 15.953 0 01-5.84 0M15.59 14.37a15.953 15.953 0 00-5.84 0m5.84 0a15.953 15.953 0 01-2.92 0m2.92 0a15.953 15.953 0 00-2.92 0M3 10.5a11.96 11.96 0 011.664-5.993 11.96 11.96 0 0110.672 0 11.96 11.96 0 011.664 5.993M19.34 10.5a11.96 11.96 0 01-1.664 5.993 11.96 11.96 0 01-10.672 0 11.96 11.96 0 01-1.664-5.993m13.992-5.993a11.96 11.96 0 00-10.672 0" />
);

export const InstagramIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
);

export const TikTokIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-2.43.03-4.83-.95-6.43-2.88-1.59-1.92-2.31-4.35-1.97-6.51.34-2.16 1.86-4.21 3.72-5.12 1.51-.76 3.23-1.09 4.87-1.13.11-1.57.02-3.14.02-4.72z"></path></svg>
);

export const WhatsAppIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/></svg>
);

export const UserIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
);

export const UsersIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
);

export const CogIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 5.389c-.42.18-.846.4-1.266.655l-1.552-.942a1.875 1.875 0 00-2.282.818l-.909 1.575c-.45.778-.12 1.775.707 2.14l1.396.617c-.016.216-.024.433-.024.652 0 .22.008.437.024.653l-1.396.618c-.827.365-1.157 1.362-.707 2.14l.909 1.575c.45.778 1.42 1.055 2.282.818l1.552-.942c.42.254.846.474 1.266.655l.178 1.572c.15.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.572c.42-.18.846-.4 1.266-.655l1.552.942a1.875 1.875 0 002.282-.818l.909-1.575c.45-.778.12-1.775-.707-2.14l-1.396-.617c.016-.216.024-.433.024-.653 0-.22-.008-.437-.024-.652l1.396-.618c.827-.365 1.157-1.362.707-2.14l-.909-1.575a1.875 1.875 0 00-2.282-.818l-1.552.942a11.28 11.28 0 00-1.266-.655l-.178-1.572c-.15-.904-.933-1.567-1.85-1.567h-1.844zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
);

export const MailIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v10.5a3 3 0 0 1-3-3H5.25a3 3 0 0 1-3-3V5.25Zm3.44 1.328a.75.75 0 0 0-1.06 1.06l7.5 7.5a.75.75 0 0 0 1.06 0l7.5-7.5a.75.75 0 0 0-1.06-1.06L12 12.94 5.69 6.578Z" clipRule="evenodd" />
);

export const EnvelopeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
);

export const PhoneIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 5.25V4.5z" clipRule="evenodd" />
);

export const LockClosedIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" />
);

export const CalendarIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
);

export const CameraIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M4.5 3.75a3 3 0 00-3 3v10.5a3 3 0 003 3h15a3 3 0 003-3V6.75a3 3 0 00-3-3h-1.05a3 3 0 01-2.657-1.572L15.238 1.5H8.762l-.553.678a3 3 0 01-2.657 1.572H4.5z" />
);

export const ArrowLeftIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
);

export const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
);

export const CheckCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
);

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM15.3 15.3a.75.75 0 01.72.545l.313 1.096a1.5 1.5 0 001.03 1.03l1.096.313a.75.75 0 010 1.442l-1.096.313a1.5 1.5 0 00-1.03 1.03l-.313 1.096a.75.75 0 01-1.442 0l-.313-1.096a1.5 1.5 0 00-1.03-1.03l-1.096-.313a.75.75 0 010-1.442l1.096-.313a1.5 1.5 0 001.03-1.03l.313-1.096a.75.75 0 01.72-.545z" clipRule="evenodd" />
);

export const ChartBarIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.25 13.5a.75.75 0 00-.75.75v2.25a.75.75 0 00.75.75h2.25a.75.75 0 00.75-.75v-2.25a.75.75 0 00-.75-.75h-2.25zm4.5-4.5a.75.75 0 00-.75.75v6.75a.75.75 0 00.75.75h2.25a.75.75 0 00.75-.75v-6.75a.75.75 0 00-.75-.75h-2.25zm4.5-6a.75.75 0 00-.75.75v12.75a.75.75 0 00.75.75h2.25a.75.75 0 00.75-.75V3.75a.75.75 0 00-.75-.75h-2.25z" clipRule="evenodd" />
);

export const ClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
);

export const RefreshIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
);

export const TicketIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 5.25V4.5z" clipRule="evenodd" />
);

export const HeartIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
);

export const SearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
);

export const ExternalLinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
);

export const LinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 1 1 7.424 7.424l-1.757 1.757a.75.75 0 1 1-1.06-1.06l1.757-1.757a3.75 3.75 0 0 0 0-5.304zm-7.389 4.267a.75.75 0 0 1 1-.353 5.25 5.25 0 0 1 1.449 8.45l-4.5 4.5a5.25 5.25 0 1 1-7.424-7.424l1.757-1.757a.75.75 0 1 1 1.06 1.06l-1.757 1.757a3.75 3.75 0 1 0 5.304 5.304l4.5-4.5a3.75 3.75 0 0 0-1.035-6.037.75.75 0 0 1-.354-1z" clipRule="evenodd" />
);

export const PencilIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
);

export const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 0 1 3.878.512.75.75 0 1 1-.49 1.45 47.475 47.475 0 0 0-7.618-1.12h-.03c-2.6 0-5.132.39-7.618 1.12a.75.75 0 1 1-.49-1.45 48.816 48.816 0 0 1 3.878-.512V4.478c0-1.121.08-2.228.23-3.32a.75.75 0 0 1 .75-.672h6.22c.39 0 .722.29.75.672.15 1.092.23 2.2.23 3.32zM4.75 9.042c.09-.617.18-1.22.27-1.82a49.923 49.923 0 0 1 13.96 0c.09.6.18 1.203.27 1.82.63 4.27 1.129 9.138 1.377 12.652a.75.75 0 0 1-.75.75h10.5a.75.75 0 0 1 .75-.75z" clipRule="evenodd" />
);

export const BuildingOfficeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M4.5 2.25a.75.75 0 0 1 .75.75v2.25h13.5V3a.75.75 0 0 1 .75-.75h2.25a.75.75 0 0 1 .75.75v18a.75.75 0 0 1-.75.75h-2.25a.75.75 0 0 1-.75-.75V18H5.25v2.25a.75.75 0 0 1-.75.75H2.25a.75.75 0 0 1-.75-.75V3a.75.75 0 0 1 .75-.75h2.25zM6 6.75v1.5h12v-1.5H6zm0 4.5v1.5h12v-1.5H6zm0 4.5v1.5h12v-1.5H6z" clipRule="evenodd" />
);

export const ClipboardDocumentListIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M9 2.25a.75.75 0 0 1 .75.75v1.5h4.5v-1.5a.75.75 0 0 1 .75-.75h.75a3 3 0 0 1 3 3v12.75a3 3 0 0 1-3 3H7.5a3 3 0 0 1-3-3V5.25a3 3 0 0 1 3-3h.75zm3 3a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-.008a.75.75 0 0 1 .75-.75h1.5zM9.75 9.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5zM9.75 12.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5zM9.75 15.75a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5z" clipRule="evenodd" />
);

export const MegaphoneIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M16.881 4.345A23.112 23.112 0 018.25 6H7.5a5.25 5.25 0 0 0-.88 10.427 21.593 21.593 0 0 0 1.378 3.94c.464 1.004 1.674 1.32 2.582.796l.657-.379c.884-.51 1.12-1.644.693-2.651a22.59 22.59 0 0 1-1.052-2.558c.333.018.67.028 1.007.028 2.25 0 4.412-.49 6.362-1.368l.459-.198a1.5 1.5 0 0 0 .901-1.386V6.95a1.5 1.5 0 0 0-.901-1.386l-.459-.198c-.191-.087-.386-.171-.581-.253A19.63 19.63 0 0 1 16.88 4.345z" />
);

export const CreditCardIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M4.5 3.75a3 3 0 0 0-3 3v10.5a3 3 0 0 0 3 3h15a3 3 0 0 0 3-3V6.75a3 3 0 0 0-3-3h-15zM21 8.25v.75H3v-.75h18zm0 3v6.75a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V11.25h18z" />
);

export const MapPinIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.75.75 0 0 0 .724 0l.028-.015.071-.041a16.975 16.975 0 0 0 1.144-.742 19.58 19.58 0 0 0 2.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 0 0-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 0 0 2.682 2.282 16.975 16.975 0 0 0 1.145.742zM12 13.5a3 3 0 100-6 3 3 0 0 0 0 6z" clipRule="evenodd" />
);

export const KeyIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M15.75 1.5a6.75 6.75 0 0 0-6.651 7.906c-1.067.322-2.02 1.018-2.741 1.996l-1.09.918a.75.75 0 0 0-.268.564v2.641a.75.75 0 0 0 .75.75h2.642a.75.75 0 0 0 .564-.268l.918-1.09a5.99 5.99 0 0 0 1.996-2.741A6.75 6.75 0 1 0 15.75 1.5zm0 10.5a3.75 3.75 0 1 1 0-7.5 3.75 3.75 0 0 1 0 7.5z" clipRule="evenodd" />
);

export const DocumentDuplicateIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M19.5 21a1.5 1.5 0 0 0 1.5-1.5V7.5a1.5 1.5 0 0 0-1.5-1.5h-1.5v-3a1.5 1.5 0 0 0-1.5-1.5h-9a1.5 1.5 0 0 0-1.5 1.5v12a1.5 1.5 0 0 0 1.5 1.5h1.5v3a1.5 1.5 0 0 0 1.5 1.5h9zM9 3h6v12H9V3zm4.5 15v3h9V7.5h-3v9a1.5 1.5 0 0 1-1.5 1.5h-4.5z" clipRule="evenodd" />
);

export const UserPlusIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M5.25 6.375a4.125 4.125 0 1 1 8.25 0 4.125 4.125 0 0 1-8.25 0zM2.25 19.125a7.125 7.125 0 0 1 14.25 0v.003l-.001.119a.75.75 0 0 1-.363.63 13.067 13.067 0 0 1-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 0 1-.364-.63l-.001-.122zM18.75 7.5a.75.75 0 0 0-1.5 0v2.25H15a.75.75 0 0 0 0 1.5h2.25v2.25a.75.75 0 0 0 1.5 0v-2.25H21a.75.75 0 0 0 0-1.5h-2.25V7.5z" />
);

export const QrCodeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M3 3.75a.75.75 0 0 1 1.75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5zM4.5 4.5v3h3v-3h-3zM3 15.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5zM4.5 16.5v3h3v-3h-3zM15 3.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-.75.75h-4.5a.75.75 0 0 1-.75-.75v-4.5zM16.5 4.5v3h3v-3h-3zM15 15.75a.75.75 0 0 1 .75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5zM18.75 15a.75.75 0 0 0-.75.75v1.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 0-.75-.75h-1.5zM15 18.75a.75.75 0 0 1 .75-.75h1.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1-.75-.75v-1.5zM18.75 18a.75.75 0 0 0-.75.75v1.5c0 .414.336.75.75.75h1.5a.75.75 0 0 0 .75-.75v-1.5a.75.75 0 0 0-.75-.75h-1.5z" clipRule="evenodd" />
);

export const BoldIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M6 4.5a.75.75 0 01.75-.75h6.5c2.485 0 4.5 1.98 4.5 4.42 0 1.433-.707 2.705-1.78 3.5 1.355.73 2.28 2.137 2.28 3.75 0 2.44-2.015 4.42-4.5 4.42h-7a.75.75 0 01-.75-.75V4.5zM7.5 18.34h6.25c1.657 0 3-1.31 3-2.92s-1.343-2.92-3-2.92h-6.25v5.84zm0-7.34h5.75c1.657 0 3-1.31 3-2.92s-1.343-2.92-3-2.92h-5.75v5.84z" clipRule="evenodd" />
);

export const ItalicIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12.97 3.75a.75.75 0 01.75.75v.008a.75.75 0 01-.664.745l-3.25.361 2.62 13.136.96-.107a.75.75 0 11.166 1.49l-2.47.275a.75.75 0 01-.75-.75v-.008a.75.75 0 01.664-.745l3.25-.361-2.62-13.136-.96.107a.75.75 0 11-.166-1.49l2.47-.275a.75.75 0 01.75.75z" clipRule="evenodd" />
);

export const UnderlineIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M6 3.75a.75.75 0 01.75.75v7.5a5.25 5.25 0 0 0 10.5 0v-7.5a.75.75 0 011.5 0v7.5a6.75 6.75 0 0 1-13.5 0v-7.5a.75.75 0 01.75-.75zM3.75 19.5a.75.75 0 000 1.5h16.5a.75.75 0 000-1.5H3.75z" clipRule="evenodd" />
);

export const ListBulletIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.625 6.75a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0zm4.875 0A.75.75 0 0 1 8.25 6h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75zM2.625 12a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0zM7.5 12a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 7.5 12zm-4.875 5.25a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0zm4.875 0a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75z" clipRule="evenodd" />
);

export const ListNumberedIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.625 6.75a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H3.375a.75.75 0 0 1-.75-.75V6.75zM7.5 6a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12A.75.75 0 0 1 7.5 6zm-4.875 5.25a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H3.375a.75.75 0 0 1-.75-.75v-.008zm4.875-.75a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 0 1.5h-12a.75.75 0 0 1-.75-.75z" clipRule="evenodd" />
);

export const CodeBracketIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M14.447 3.027a.75.75 0 0 1 .527.92l-4.5 16.5a.75.75 0 0 1-1.448-.394l4.5-16.5a.75.75 0 0 1 .921-.526zM16.72 6.22a.75.75 0 0 1 1.06 0l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06L21.44 12l-4.72-4.72a.75.75 0 0 1 0-1.06zm-9.44 0a.75.75 0 0 1 0 1.06L2.56 12l4.72 4.72a.75.75 0 1 1-1.06 1.06L.97 12.53a.75.75 0 0 1 0-1.06l5.25-5.25a.75.75 0 0 1 1.06 0z" clipRule="evenodd" />
);

export const EyeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
);

export const FaceSmileIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75-4.365 9.75-9.75 9.75S17.385 2.25 12 2.25zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866zm-9 6a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V15z" clipRule="evenodd" />
);

export const AlertTriangleIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-7.22 24.46c-.352 1.193.538 2.39 1.79 2.39h19.67c1.253 0 2.142-1.197 1.79-2.39l-7.22-24.46zm-2.81 0c.413-1.4 2.397-1.4 2.81 0l7.22 24.46c.352 1.193-.538 2.39-1.79 2.39H3.165c-1.253 0-2.142-1.197-1.79-2.39l7.22-24.46zM12 17.25a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 .75.75v.008a.75.75 0 0 1-.75.75H12.75a.75.75 0 0 1-.75-.75v-.008zm.75-2.25a.75.75 0 0 0-1.5 0v-6a.75.75 0 0 0 1.5 0v6z" clipRule="evenodd" />
);

export const UndoIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M9.53 2.47a.75.75 0 0 1 0 1.06L4.81 8.25H15a6.75 6.75 0 0 1 0 13.5h-3a.75.75 0 0 1 0-1.5h3a5.25 5.25 0 1 0 0-10.5H4.81l4.72 4.72a.75.75 0 1 1-1.06 1.06l-6-6a.75.75 0 0 1 0-1.06l6-6a.75.75 0 0 1 1.06 0z" clipRule="evenodd" />
);

export const UserMinusIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M10.348 15.472a6.001 6.001 0 0 0-8.098-.67 3 3 0 0 0-.25 4.448l.25.25H21v-2.25a9 9 0 0 0-10.652-1.778zM16.5 4.5a3 3 0 11-6 0 3 3 0 0 1 6 0z" />
);

export const FilterIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M3 4.5a.75.75 0 0 1 .75-.75h16.5a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-.22.53l-5.53 5.53v6.69a.75.75 0 0 1-1.28.53l-3-3a.75.75 0 0 1-.22-.53V12.28L4.22 6.75a.75.75 0 0 1-.22-.53V4.5z" clipRule="evenodd" />
);

export const PlusIcon: React.FC<React.SVGProps<SVGSVGElement>> = createStrokeIcon(
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
);

export const ShieldCheckIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 0 0-1.032 0 11.209 11.209 0 0 1-7.877 3.08.75.75 0 0 0-.722.515A12.74 12.74 0 0 0 2.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 0 0 .374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.636-.759-3.807a.75.75 0 0 0-.722-.515 11.209 11.209 0 0 1-7.877-3.08zM12 10.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-3.75 5.25a.75.75 0 0 1 .75-.75h6a.75.75 0 0 1 .75.75v.75a.75.75 0 0 1-.75.75h-6a.75.75 0 0 1-.75-.75v-.75z" clipRule="evenodd" />
);

export const ServerIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M18.75 18a.75.75 0 0 0 .75-1.5H4.5a.75.75 0 0 0-.75 1.5h15zM21 16.5a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5zM18.75 12a.75.75 0 0 0 .75-1.5H4.5a.75.75 0 0 0-.75 1.5h15zM21 10.5a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 10.5v2.25A2.25 2.25 0 0 0 5.25 15h13.5A2.25 2.25 0 0 0 21 12.75V10.5zM18.75 6a.75.75 0 0 0 .75-1.5H4.5a.75.75 0 0 0-.75 1.5h15zM21 4.5a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 4.5v2.25A2.25 2.25 0 0 0 5.25 9h13.5A2.25 2.25 0 0 0 21 6.75V4.5z" />
);
