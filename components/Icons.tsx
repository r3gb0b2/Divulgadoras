import React from 'react';

const createIcon = (path: React.ReactNode): React.FC<React.SVGProps<SVGSVGElement>> => (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        {path}
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
    <path fillRule="evenodd" d="M2.25 5.25a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v10.5a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V5.25Zm3.44 1.328a.75.75 0 0 0-1.06 1.06l7.5 7.5a.75.75 0 0 0 1.06 0l7.5-7.5a.75.75 0 0 0-1.06-1.06L12 12.94 5.69 6.578Z" clipRule="evenodd" />
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
    <path d="M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.05 2 13.53 2h-4.05c-.52 0-.93.18-1.02.47l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.08-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.09.29.5.47 1.02.47h4.05c.52 0 .93-.18 1.02.47l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.08.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" />
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

export const MercadoPagoIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg width="24" height="17" viewBox="0 0 24 17" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <path d="M21.2186 16.3333L18.4211 4.77708L23.4736 2.375L21.2186 16.3333Z" fill="white"></path>
        <path d="M19.1413 0L10.0388 16.625H16.1438L19.1413 0Z" fill="white"></path>
        <path d="M12.9868 2.60417L10.5186 11.5L7.96259 2.47917L4.76134 16.625H0L8.68009 0L12.9868 2.60417Z" fill="white"></path>
    </svg>
);
