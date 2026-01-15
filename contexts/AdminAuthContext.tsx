
import React, { createContext, useState, useEffect, useContext, ReactNode } from 'react';
import firebase from 'firebase/compat/app';
import { auth } from '../firebase/config';
import { getAdminUserData, setAdminUserData } from '../services/adminService';
import { getOrganizations } from '../services/organizationService';
import { AdminUserData, Organization } from '../types';

interface AdminAuthContextType {
    user: firebase.User | null;
    adminData: AdminUserData | null;
    loading: boolean;
    organizationsForAdmin: Organization[];
    selectedOrgId: string | null;
    setSelectedOrgId: (orgId: string) => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export const AdminAuthProvider: React.FC<{children: ReactNode}> = ({ children }) => {
    const [user, setUser] = useState<firebase.User | null>(null);
    const [adminData, setAdminData] = useState<AdminUserData | null>(null);
    const [loading, setLoading] = useState(true);
    const [organizationsForAdmin, setOrganizationsForAdmin] = useState<Organization[]>([]);
    const [selectedOrgId, setSelectedOrgIdState] = useState<string | null>(() => {
        return sessionStorage.getItem('selectedOrgId');
    });

    const setSelectedOrgId = (orgId: string) => {
        sessionStorage.setItem('selectedOrgId', orgId);
        setSelectedOrgIdState(orgId);
    };

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => {
            setLoading(true);

            if (firebaseUser) {
                try {
                    let data = await getAdminUserData(firebaseUser.uid);

                    if (!data && firebaseUser.email === 'rafael@agenciavitrine.com') {
                        const superAdminPayload: Omit<AdminUserData, 'uid'> = {
                            email: firebaseUser.email,
                            role: 'superadmin',
                            assignedStates: [],
                        };
                        await setAdminUserData(firebaseUser.uid, superAdminPayload);
                        data = { uid: firebaseUser.uid, ...superAdminPayload };
                    }
                    
                    if (!data) {
                        await auth.signOut();
                        return;
                    }
                    
                    setUser(firebaseUser);
                    setAdminData(data);

                    const allOrgs = await getOrganizations();
                    
                    let adminVisibleOrgs: Organization[] = [];
                    if (data.role === 'superadmin') {
                        adminVisibleOrgs = allOrgs;
                    } else if (data.organizationIds?.length) {
                        const accessibleOrgIds = new Set(data.organizationIds);
                        adminVisibleOrgs = allOrgs.filter(org => accessibleOrgIds.has(org.id));
                    }

                    adminVisibleOrgs.sort((a, b) => a.name.localeCompare(b.name));
                    setOrganizationsForAdmin(adminVisibleOrgs);

                    let newSelectedOrgId: string | null = null;
                    if (adminVisibleOrgs.length > 0) {
                        const storedId = sessionStorage.getItem('selectedOrgId');
                        const isValidStoredId = storedId && adminVisibleOrgs.some(org => org.id === storedId);

                        if (isValidStoredId) {
                            newSelectedOrgId = storedId;
                        } else if (data.role !== 'superadmin' || storedId) {
                            // Para admins normais, sempre pega a primeira se a salva for inválida.
                            // Para superadmins, só pega a primeira se ele já tivesse algo salvo que expirou/mudou.
                            newSelectedOrgId = adminVisibleOrgs[0].id;
                        }
                    }
                    
                    if (newSelectedOrgId) {
                        setSelectedOrgIdState(newSelectedOrgId);
                        sessionStorage.setItem('selectedOrgId', newSelectedOrgId);
                    }
                } catch (error) {
                    console.error("Error during auth state processing:", error);
                    await auth.signOut();
                }
            } else {
                setUser(null);
                setAdminData(null);
                setOrganizationsForAdmin([]);
                setSelectedOrgIdState(null);
                sessionStorage.clear();
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <AdminAuthContext.Provider value={{ user, adminData, loading, organizationsForAdmin, selectedOrgId, setSelectedOrgId }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = (): AdminAuthContextType => {
    const context = useContext(AdminAuthContext);
    if (context === undefined) {
        throw new Error('useAdminAuth must be used within an AdminAuthProvider');
    }
    return context;
};
