
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
    <path d="M3 8.25A2.25 2.25 0 0 1 5.25 6h13.5A2.25 2.25 0 0 1 21 8.25v7.5A2.25 2.25 0 0 1 18.75 18H5.25A2.25 2.25 0 0 1 3 15.75v