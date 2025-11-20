/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, useState, useEffect, type ReactNode } from 'react'

export type AuthUser = {
  userId: string
  email: string
  name: string
  photoUrl?: string
  role: 'owner' | 'manager' | 'analyst' | 'viewer'
}

interface AuthContextType {
  user: AuthUser | null
  loading: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
}

const fakeUser: AuthUser = {
  userId: 'testUser',
  email: 'test@example.com',
  name: 'Test User',
  role: 'owner',
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulate auth check delay
    const timer = setTimeout(() => {
      setUser(fakeUser)
      setLoading(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [])

  const signIn = async () => {
    setLoading(true)
    await new Promise(resolve => setTimeout(resolve, 800))
    setUser(fakeUser)
    setLoading(false)
  }

  const signOut = async () => {
    setLoading(true)
    await new Promise(resolve => setTimeout(resolve, 500))
    setUser(null)
    setLoading(false)
  }

  const value = useMemo(() => ({
    user,
    loading,
    signIn,
    signOut
  }), [user, loading])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}


