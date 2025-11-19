import React from 'react';

const createIcon = (path: React.ReactNode): React.FC<React.SVGProps<SVGSVGElement>> => (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        {path}
    </svg>
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


export const FaceIdIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.82m5.84-2.56a15.953 15.953 0 01-5.84 0M15.59 14.37a15.953 15.953 0 00-5.84 0m5.84 0a15.953 15.953 0 01-2.92 0m2.92 0a15.953 15.953 0 00-2.92 0M3 10.5a11.96 11.96 0 011.664-5.993 11.96 11.96 0 0110.672 0 11.96 11.96 0 011.664 5.993M19.34 10.5a11.96 11.96 0 01-1.664 5.993 11.96 11.96 0 01-10.672 0 11.96 11.96 0 01-1.664-5.993m13.992-5.993a11.96 11.96 0 00-10.672 0" />
    </svg>
);


export const InstagramIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
);

export const TikTokIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-2.43.03-4.83-.95-6.43-2.88-1.59-1.92-2.31-4.35-1.97-6.51.34-2.16 1.86-4.21 3.72-5.12 1.51-.76 3.23-1.09 4.87-1.13.11-1.57.02-3.14.02-4.72z"></path></svg>
);

export const UserIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
);

export const MailIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v10.5a3 3 0 0 1-3-3H5.25a3 3 0 0 1-3-3V5.25Zm3.44 1.328a.75.75 0 0 0-1.06 1.06l7.5 7.5a.75.75 0 0 0 1.06 0l7.5-7.5a.75.75 0 0 0-1.06-1.06L12 12.94 5.69 6.578Z" clipRule="evenodd" />
);

export const EnvelopeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M3 8.25A2.25 2.25 0 0 1 5.25 6h13.5A2.25 2.25 0 0 1 21 8.25v7.5A2.25 2.25 0 0 1 18.75 18H5.25A2.25 2.25 0 0 1 3 15.75v-7.5ZM5.25 7.5a.75.75 0 0 0-.75.75v7.5c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-7.5a.75.75 0 0 0-.75-.75H5.25Z" />
);

export const PhoneIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M1.5 4.5a3 3 0 0 1 3-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 0 1-.694 1.955l-1.293.97c-.135.101-.164.292-.072.431 1.002 1.493 2.135 2.625 3.628 3.628.14.092.33.062.431-.072l.97-1.293a1.875 1.875 0 0 1 1.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 0 1-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5Z" clipRule="evenodd" />
);

export const CalendarIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 0 1 7.5 3v1.5h9V3A.75.75 0 0 1 18 3v1.5h.75a3 3 0 0 1 3 3v11.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V7.5a3 3 0 0 1 3-3H6V3a.75.75 0 0 1 .75-.75Zm13.5 9a1.5 1.5 0 0 0-1.5-1.5H5.25a1.5 1.5 0 0 0-1.5 1.5v7.5a1.5 1.5 0 0 0 1.5 1.5h13.5a1.5 1.5 0 0 0 1.5-1.5v-7.5Z" clipRule="evenodd" />
);

export const CameraIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h1.5a.75.75 0 0 1 .75.75v.5h7.5v-.5a.75.75 0 0 1 .75-.75h1.5A2.25 2.25 0 0 1 18 6v10.5A2.25 2.25 0 0 1 15.75 18.75H3.75A2.25 2.25 0 0 1 1.5 16.5V6Zm12 4.5a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Zm-1.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" clipRule="evenodd" />
);

export const WhatsAppIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M12.04 2C6.58 2 2.13 6.45 2.13 12c0 1.74.45 3.48 1.34 5l-1.42 5.16 5.28-1.38c1.45.81 3.09 1.23 4.71 1.23h.01c5.46 0 9.91-4.45 9.91-9.91 0-5.46-4.45-9.9-9.91-9.9zM17.29 14.46c-.19.53-.98 1-1.34 1.05-.32.05-.75.06-1.16-.09-.51-.17-1.15-.36-2.11-1.15-1.4-.95-2.29-2.2-2.42-2.54-.12-.34-.01-.52.12-.67.11-.12.24-.2.33-.3.1-.1.14-.17.21-.29.07-.12.06-.24 0-.36-.06-.12-1.06-2.56-1.45-3.4-.39-.84-.79-1.02-.79-1.02s-.28-.01-.43.05c-.15.06-.34.15-.49.36-.15.21-.57.8-.57 1.95s.58 3.03 1.22 3.73c.64.7 1.93 2.11 4.67 3.16 2.05.77 2.74.65 3.23.62.75-.04 1.39-.63 1.58-1.16.2-.53.2-1.12.14-1.24-.06-.12-.24-.2-.52-.41z" />
);

export const UsersIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
);

export const MapPinIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
);

export const CogIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.05 2 13.53 2h-4.05c-.52 0-.93.18-1.02.47l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.08-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49 1c.52.4 1.08.73 1.69.98l.38 2.65c.09.29.5.47 1.02.47h4.05c.52 0 .93-.18 1.02.47l.38-2.65c.61-.25 1.17-.59 1.69.98l2.49 1c.23.08.49 0 .61.22l2-3.46c.12-.22.07.49-.12.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
);

export const LockClosedIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 0 0-5.25 5.25v3a3 3 0 0 0-3 3v6.75a3 3 0 0 0 3 3h10.5a3 3 0 0 0 3-3v-6.75a3 3 0 0 0-3-3v-3A5.25 5.25 0 0 0 12 1.5Zm-3.75 8.25v-3a3.75 3.75 0 1 1 7.5 0v3h-7.5Z" clipRule="evenodd" />
);

export const KeyIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M20.62 8.99l-2.52-2.52c-1.88-1.88-4.95-1.88-6.83 0l-6.25 6.25c-.42.42-.66 1-.66 1.6V18h3.88c.6 0 1.18-.24 1.6-.66l6.25-6.25c1.88-1.88 1.88-4.95 0-6.83zM9 16H7v-2h2v2zm4-4H9.5v-1H13v1zm0-2H11v-1h2v1zm-2-3c.83 0 1.5-.67 1.5-1.5S11.83 4 11 4s-1.5.67-1.5 1.5S10.17 7 11 7z" />
);

export const CreditCardIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M20 4H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z" />
);

export const ArrowLeftIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
    </svg>
);

export const MegaphoneIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M10.873 3.31a.75.75 0 0 0-1.162-.647l-7.5 4.25a.75.75 0 0 0 0 1.294l7.5 4.25a.75.75 0 0 0 1.162-.647V3.31ZM12 6a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75-.75h-4.5a.75.75 0 0 1-.75-.75V6Z" clipRule="evenodd" />
);

export const MercadoPagoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg width="24" height="17" viewBox="0 0 24 17" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M21.2186 16.3333L18.4211 4.77708L23.4736 2.375L21.2186 16.3333Z" fill="white"></path>
        <path d="M19.1413 0L10.0388 16.625H16.1438L19.1413 0Z" fill="white"></path>
        <path d="M12.9868 2.60417L10.5186 11.5L7.96259 2.47917L4.76134 16.625H0L8.68009 0L12.9868 2.60417Z" fill="white"></path>
    </svg>
);

export const PagSeguroIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 42" fill="none" {...props}>
        <path d="M165.71 21.83c0-4.32 2.1-7.25 5.5-9.15 2.1-1.2 3.7-2.3 3.7-3.96 0-1.8-1.3-2.9-3.5-2.9-2.3 0-3.8 1.1-4.2 3.2h-5.2c.4-4.8 4.4-7.4 9.4-7.4 5.9 0 9.8 3 9.8 7.1 0 4.1-2.6 6.5-5.6 8.3-2 .9-3.4 1.9-3.4 3.6v.2h9.1v4.4h-15.8v-1.33zm-17.2-16.13h6.1l7.8 29.8h-5.8l-1.4-6.1h-8.2l-1.4 6.1h-5.8l8.7-29.8zm-.9 19.3h6.8l-3.4-14.9-3.4 14.9zm-16.7-19.3h14.7v4.4h-8.9v7.8h8.5v4.4h-8.5v8.8h9v4.4h-14.8v-29.8zm-22.3 29.8h-5.4V5.7h13.6c5.3 0 8.8 3.1 8.8 7.9 0 3.7-2 6.5-5.2 7.5l6 14.4h-6.4l-5.6-13.3h-5.8v13.3zm0-17.7h8.1c3.1 0 4.8-1.8 4.8-4.2s-1.8-4.1-4.8-4.1h-8.1v8.3zm-16.8 17.7h-5.4V5.7h5.4v29.8zm-11.4 0h-5.4V5.7h13.6c5.3 0 8.8 3.1 8.8 7.9 0 3.7-2 6.5-5.2 7.5l6 14.4h-6.4l-5.6-13.3h-5.8v13.3zm0-17.7h8.1c3.1 0 4.8-1.8 4.8-4.2s-1.8-4.1-4.8-4.1h-8.1v8.3zm-22.1-3.1c3.8 0 6.3-2.6 6.3-6.1s-2.5-6-6.3-6-6.3 2.5-6.3 6 2.5 6.1 6.3 6.1zm0-16.6c6.8 0 11.5 4.6 11.5 10.9s-4.7 11-11.5 11-11.5-4.7-11.5-11S55.2 5.7 62 5.7zm-20.9 29.8V21.9c0-5.3-3-8.6-8.6-8.6-4.9 0-8.2 3-8.2 7.5v14.7h-5.4V14.1c0-6.7 4.5-11.2 13.6-11.2 9.2 0 14 4.5 14 12.5v20.1h-5.4z" fill="#333"></path>
        <path d="M12.9 22.8H0V20h12.9v2.8z" fill="#F47B20"></path>
        <path d="M12.9 20h2.8V5.7H0V3h15.7v17z" fill="#F47B20"></path>
    </svg>
);


export const BuildingOfficeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M4 2a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1-1h-3v5a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-5H5a1 1 0 0 1-1-1V2zm4 2v1h2V4H8zm0 3v1h2V7H8zm2 3H8v1h2v-1zm2-3h2V7h-2v1zm0 3h2v-1h-2v1zm-2-6h2V4h-2v1z" clipRule="evenodd" />
);

export const ClipboardDocumentListIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path clipRule="evenodd" d="M15.75 2.25a3 3 0 0 0-3-3h-3.5a3 3 0 0 0-3 3V3H5.25a3 3 0 0 0-3 3v13.5a3 3 0 0 0 3 3h9.5a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3h-1V2.25Zm-2.5 1.5V6H8.25V3.75a1.5 1.5 0 0 1 1.5-1.5h.5a1.5 1.5 0 0 1 1.5 1.5Z" />
);

export const LogoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg
        viewBox="0 0 250 40"
        xmlns="http://www.w3.org/2000/svg"
        {...props}
    >
        <text x="0" y="30" fontSize="30" fontWeight="bold" fill="currentColor">Equipe Certa</text>
    </svg>
);

export const MenuIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
);

export const XIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
);

export const LogoutIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
    </svg>
);

export const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
);

export const CheckCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
);

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zM16.5 15a.75.75 0 01.712.513l.394 1.183c.15.447.5.799.948.948l1.183.395a.75.75 0 010 1.422l-1.183.395c-.447.15-.799.5-.948.948l-.395 1.183a.75.75 0 01-1.422 0l-.395-1.183a1.5 1.5 0 00-.948-.948l-1.183-.395a.75.75 0 010-1.422l1.183-.395c.447-.15.799-.5.948-.948l.395-1.183A.75.75 0 0116.5 15z" clipRule="evenodd" />
);

export const ChartBarIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M3 13.75C3 13.336 3.336 13 3.75 13h2.5c.414 0 .75.336.75.75v6.5c0 .414-.336.75-.75.75h-2.5a.75.75 0 01-.75-.75v-6.5zm6.75-6c0-.414.336-.75.75-.75h2.5c.414 0 .75.336.75.75v12.5c0 .414-.336.75-.75.75h-2.5a.75.75 0 01-.75-.75V7.75zm6.75 4.5c0-.414.336-.75.75-.75h2.5c.414 0 .75.336.75.75v8c0 .414-.336.75-.75.75h-2.5a.75.75 0 01-.75-.75v-8z" clipRule="evenodd" />
);

export const ClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
);

export const TicketIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.292-.072.431 1.002 1.493 2.135 2.625 3.628 3.628.14.092.33.062.431-.072l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
);

export const HeartIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
);

export const SearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
);

export const ExternalLinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M15.75 2.25H21a.75.75 0 01.75.75v5.25a.75.75 0 01-1.5 0V4.81L8.03 17.03a.75.75 0 01-1.06-1.06L19.19 3.75h-3.44a.75.75 0 010-1.5zm-10.5 4.5a1.5 1.5 0 00-1.5 1.5v10.5a1.5 1.5 0 001.5 1.5h10.5a1.5 1.5 0 001.5-1.5V10.5a.75.75 0 011.5 0v8.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V8.25a3 3 0 013-3h8.25a.75.75 0 010 1.5H5.25z" clipRule="evenodd" />
);

export const LinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 005.304 5.304l1.5-1.5a.75.75 0 011.06 1.06l-1.5 1.5a5.25 5.25 0 11-7.424-7.424l4.5-4.5a5.25 5.25 0 017.424 7.424l-1.5 1.5a.75.75 0 11-1.06-1.06l1.5-1.5a3.75 3.75 0 000-5.304zM12.598 8.402a.75.75 0 010 1.06l-1.5 1.5a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-5.304-5.304l-1.5 1.5a.75.75 0 01-1.06-1.06l1.5-1.5a5.25 5.25 0 117.424 7.424l-4.5 4.5a5.25 5.25 0 01-7.424-7.424l1.5-1.5a.75.75 0 011.06 0z" clipRule="evenodd" />
);

export const PencilIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M21.731 2.269a2.625 2.625 0 113.712 3.712l-.98.98-3.712-3.712.98-.98zM19.707 4.707l-1.414 1.414-3.712-3.712 1.414-1.414a4.125 4.125 0 015.835 5.835l-1.414 1.414-3.712-3.712 1.414-1.414zM4.5 19.5a.75.75 0 01-.75-.75v-2.625l12-12 3.712 3.712-12 12H4.5z" clipRule="evenodd" />
);

export const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clipRule="evenodd" />
);

export const UserPlusIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M6 10a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zM18 6h-2v3h-3v2h3v3h2v-3h3V9h-3V6z" />
);

export const QrCodeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M3 3a1.5 1.5 0 011.5-1.5h4A1.5 1.5 0 0110 3v4a1.5 1.5 0 01-1.5 1.5h-4A1.5 1.5 0 013 7V3zm1.5 0h4v4h-4V3zm0 12a1.5 1.5 0 011.5-1.5h4a1.5 1.5 0 011.5 1.5v4a1.5 1.5 0 01-1.5 1.5h-4a1.5 1.5 0 01-1.5-1.5v-4zm1.5 0h4v4h-4v-4zm10.5-9.5a1.5 1.5 0 00-1.5-1.5h-4a1.5 1.5 0 00-1.5 1.5v4a1.5 1.5 0 001.5 1.5h4a1.5 1.5 0 001.5-1.5V3zm-1.5 0h-4v4h4V3zm0 14a1.5 1.5 0 00-1.5-1.5h-4a1.5 1.5 0 00-1.5 1.5v4a1.5 1.5 0 001.5 1.5h4a1.5 1.5 0 001.5-1.5v-4zm-1.5 0h-4v4h4v-4z" clipRule="evenodd" />
);

export const BoldIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M3.75 3a.75.75 0 01.75-.75h6.188a5.812 5.812 0 010 11.625H4.5a.75.75 0 01-.75-.75V3zm1.5 1.5v8.625h5.438a4.312 4.312 0 000-8.625H5.25zM3.75 13.125a.75.75 0 01.75-.75h7.5a5.812 5.812 0 010 11.625H4.5a.75.75 0 01-.75-.75v-10.125zm1.5 1.5v7.125h6.75a4.312 4.312 0 000-8.625H5.25v1.5z" clipRule="evenodd" />
);

export const ItalicIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M5.25 3.75a.75.75 0 01.75-.75h9a.75.75 0 010 1.5h-3.3l-3.45 15h3.375a.75.75 0 010 1.5h-9a.75.75 0 010-1.5h3.3l3.45-15H6a.75.75 0 01-.75-.75z" clipRule="evenodd" />
);

export const UnderlineIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 2.25a.75.75 0 01.75.75v11.25a.75.75 0 01-1.5 0V3a.75.75 0 01.75-.75zM3 20.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
);

export const ListBulletIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.625 6.75a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875 0a.75.75 0 01.75-.75h12.75a.75.75 0 010 1.5H8.25a.75.75 0 01-.75-.75zM2.625 12a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zM7.5 12a.75.75 0 01.75-.75h12.75a.75.75 0 010 1.5H8.25a.75.75 0 01-.75-.75zm-4.875 5.25a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0zm4.875 0a.75.75 0 01.75-.75h12.75a.75.75 0 010 1.5H8.25a.75.75 0 01-.75-.75z" clipRule="evenodd" />
);

export const ListNumberedIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.25 6a.75.75 0 01.75-.75h18a.75.75 0 010 1.5H3a.75.75 0 01-.75-.75zm0 6a.75.75 0 01.75-.75h18a.75.75 0 010 1.5H3a.75.75 0 01-.75-.75zm0 6a.75.75 0 01.75-.75h18a.75.75 0 010 1.5H3a.75.75 0 01-.75-.75z" clipRule="evenodd" />
);

export const CodeBracketIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M14.447 3.027a.75.75 0 01.527.92l-4.5 16.5a.75.75 0 01-1.448-.394l4.5-16.5a.75.75 0 01.921-.526zM16.72 6.22a.75.75 0 011.06 0l5.25 5.25a.75.75 0 010 1.06l-5.25 5.25a.75.75 0 11-1.06-1.06L21.44 12l-4.72-4.72a.75.75 0 010-1.06zm-9.44 0a.75.75 0 010 1.06L2.56 12l4.72 4.72a.75.75 0 11-1.06 1.06L.97 12.53a.75.75 0 010-1.06l5.25-5.25a.75.75 0 011.06 0z" clipRule="evenodd" />
);

export const EyeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
);

export const FaceSmileIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-2.625 6c-.54 0-.828.419-.936.634a.75.75 0 001.342.674c.05-.099.125-.203.29-.203a.693.693 0 01.29.062.75.75 0 00.656-1.347A2.252 2.252 0 009.375 8.25zm5.25 0c-.54 0-.828.419-.936.634a.75.75 0 001.342.674c.05-.099.125-.203.29-.203a.693.693 0 01.29.062.75.75 0 00.656-1.347A2.252 2.252 0 0014.625 8.25zM12 16.5c2.275 0 4.19-1.49 4.863-3.53a.75.75 0 00-1.426-.47 3.61 3.61 0 01-6.874 0 .75.75 0 00-1.426.47C7.81 15.01 9.725 16.5 12 16.5z" clipRule="evenodd" />
);

export const RefreshIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M4.755 10.059a7.5 7.5 0 0112.548-3.364l1.903 1.903h-3.183a.75.75 0 100 1.5h4.992a.75.75 0 00.75-.75V4.356a.75.75 0 00-1.5 0v3.18l-1.9-1.9A9 9 0 003.306 9.67a.75.75 0 101.45.388zm15.408 3.352a.75.75 0 00-.919.53 7.5 7.5 0 01-12.548 3.364l-1.902-1.903h3.183a.75.75 0 000-1.5H2.984a.75.75 0 00-.75.75v4.992a.75.75 0 001.5 0v-3.18l1.9 1.9a9 9 0 0015.059-4.035.75.75 0 00-.53-.918z" clipRule="evenodd" />
);

export const UserMinusIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M6 10a4 4 0 100-8 4 4 0 000 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4zM19 7h-4v2h4V7z" />
);
