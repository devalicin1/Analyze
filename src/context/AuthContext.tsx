/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'

export type AuthUser = {
  userId: string
  email: string
  name: string
  photoUrl?: string
  role: 'owner' | 'manager' | 'analyst' | 'viewer'
}

const fakeUser: AuthUser = {
  userId: 'testUser',
  email: 'test@example.com',
  name: 'Test User',
  role: 'owner',
}

const AuthContext = createContext<AuthUser>(fakeUser)

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useMemo(() => fakeUser, [])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}


