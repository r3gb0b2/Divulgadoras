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
        <defs>
            <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: '#e83a93', stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: '#c82a7a', stopOpacity: 1 }} />
            </linearGradient>
        </defs>
        {/* Abstract team/network icon */}
        <g transform="translate(0, 2)">
            <circle cx="15" cy="20" r="8" fill="url(#logoGradient)" />
            <circle cx="30" cy="12" r="6" fill="url(#logoGradient)" opacity="0.8" />
            <circle cx="30" cy="28" r="6" fill="url(#logoGradient)" opacity="0.8" />
            <line x1="15" y1="20" x2="28" y2="13" stroke="url(#logoGradient)" strokeWidth="2.5" />
            <line x1="15" y1="20" x2="28" y2="27" stroke="url(#logoGradient)" strokeWidth="2.5" />
        </g>
        
        {/* Text */}
        <text
            x="50"
            y="30"
            fontFamily="system-ui, sans-serif"
            fontSize="30"
            fontWeight="bold"
            fill="currentColor"
        >
            Equipe Certa
        </text>
    </svg>
);

export const SparklesIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
  <path fillRule="evenodd" clipRule="evenodd" d="M10.822 1.566a1.94 1.94 0 0 1 2.356 0l1.178 1.178a1.94 1.94 0 0 0 1.372.569h1.66c1.21 0 1.766.963 1.258 2.05l-.646 1.393a1.94 1.94 0 0 0 .57 2.29l1.178 1.178c.963 1.088.406 2.55-.802 2.55h-1.66a1.94 1.94 0 0 0-1.372.569l-1.178 1.178a1.94 1.94 0 0 1-2.356 0l-1.178-1.178a1.94 1.94 0 0 0-1.372-.569h-1.66c-1.21 0-1.766-.963-1.258-2.05l.646-1.393a1.94 1.94 0 0 0-.57-2.29l-1.178-1.178c-.963-1.088-.406-2.55.802-2.55h1.66c.504 0 .98-.198 1.372-.569l1.178-1.178zM12 8.25a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3a.75.75 0 0 1 .75-.75zM8.25 12a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 0 1.5h-3a.75.75 0 0 1-.75-.75z" />
);

export const LinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
    </svg>
);

export const EyeIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
);

export const DownloadIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
    </svg>
);

export const SearchIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
    </svg>
);

export const CheckCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
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

export const ChartBarIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25A1.125 1.125 0 0 1 9.75 19.875V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
    </svg>
);

export const PencilIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 19.5a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
    </svg>
);

export const ClockIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
);

export const TicketIcon: React.FC<React.SVGProps<SVGSVGElement>> = createIcon(
    <path fillRule="evenodd" d="M1.5 6.75A2.25 2.25 0 013.75 4.5h16.5a2.25 2.25 0 012.25 2.25v10.5A2.25 2.25 0 0120.25 19.5H3.75A2.25 2.25 0 011.5 17.25V6.75Zm19.5 0A.75.75 0 0019.5 6H4.5a.75.75 0 00-.75.75v10.5c0 .414.336.75.75.75h15a.75.75 0 00.75-.75V6.75ZM8.25 12a.75.75 0 01.75-.75h6a.75.75 0 010 1.5h-6a.75.75 0 01-.75-.75Zm.75 2.25a.75.75 0 000 1.5h.008a.75.75 0 000-1.5H9Zm2.25.75a.75.75 0 01.75-.75h.008a.75.75 0 010 1.5h-.008a.75.75 0 01-.75-.75Zm3-2.25a.75.75 0 000 1.5h.008a.75.75 0 000-1.5H15Z" clipRule="evenodd" />
);

export const QrCodeIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.375h.008v.008H6v-.008zM6 15.375h.008v.008H6v-.008zM15 6.375h.008v.008H15v-.008zM15 15.375h.008v.008H15v-.008z" />
    </svg>
);

export const DuplicateIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m9.75 0h-3.375c-.621 0-1.125.504-1.125 1.125v9.25c0 .621.504 1.125 1.125 1.125h3.375c.621 0 1.125-.504 1.125-1.125v-9.25a1.125 1.125 0 00-1.125-1.125z" />
    </svg>
);

export const TrashIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.124-2.033-2.124H8.033c-1.12 0-2.033.944-2.033 2.124v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
);

export const UserPlusIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
    </svg>
);

export const ExternalLinkIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-6m-7-3h6v6m0-6l-7 7" />
    </svg>
);

export const LogoutIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
    </svg>
);

export const BoldIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"></path>
    </svg>
);

export const ItalicIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="19" y1="4" x2="10" y2="4"></line>
      <line x1="14" y1="20" x2="5" y2="20"></line>
      <line x1="15" y1="4" x2="9" y2="20"></line>
    </svg>
);

export const UnderlineIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"></path>
      <line x1="4" y1="21" x2="20" y2="21"></line>
    </svg>
);

export const ListBulletIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="8" y1="6" x2="21" y2="6"></line>
      <line x1="8" y1="12" x2="21" y2="12"></line>
      <line x1="8" y1="18" x2="21" y2="18"></line>
      <line x1="3" y1="6" x2="3.01" y2="6"></line>
      <line x1="3" y1="12" x2="3.01" y2="12"></line>
      <line x1="3" y1="18" x2="3.01" y2="18"></line>
    </svg>
);

export const ListNumberedIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="9" y1="6" x2="21" y2="6"></line>
      <line x1="9" y1="12" x2="21" y2="12"></line>
      <line x1="9" y1="18" x2="21" y2="18"></line>
      <path d="M21 6H9"></path><path d="M21 12H9"></path><path d="M21 18H9"></path><path d="M4.9 6H6.1"></path><path d="M6.1 12H4.9"></path><path d="M6.1 18H4.9"></path><path d="M5.5 10.5V13.5"></path><path d="M5.5 4.5V7.5"></path><path d="M5.5 16.5V19.5"></path>
    </svg>
);

export const CodeBracketIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
    </svg>
);

export const FaceSmileIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4.072 4.072 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);