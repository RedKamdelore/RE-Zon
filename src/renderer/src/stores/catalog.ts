import { useMemo } from 'react'
import { buildCatalog } from '@shared/catalog'
import { useLibraryStore } from './libraryStore'
import { useAccountsStore } from './accountsStore'
export function useCatalog() {
  const {tracks,hiddenIds}=useLibraryStore()
  const {accounts,libraries}=useAccountsStore()
  return useMemo(()=>buildCatalog(tracks,accounts,libraries,hiddenIds),[tracks,accounts,libraries,hiddenIds])
}
