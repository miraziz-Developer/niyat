import { createContext, type ReactNode, useContext } from 'react'
import type { NetworkClient } from '../../application/ports/network-client'

const NetworkContext = createContext<NetworkClient | null>(null)

/** Provides the server API in server mode; `null` means the local-first demo. */
export function NetworkProvider({ client, children }: { client: NetworkClient | null; children: ReactNode }) {
  return <NetworkContext value={client}>{children}</NetworkContext>
}

export function useNetwork() {
  return useContext(NetworkContext)
}
