'use client'

import { useState } from 'react'
import type { Agency } from './types'
import { AgencyCreateCard } from './AgencyCreateCard'
import { AgenciesTable } from './AgenciesTable'

interface ClientWrapperProps {
  initialData: Agency[]
  initialCount: number
}

export function ClientWrapper({ initialData, initialCount }: ClientWrapperProps) {
  const [agencies, setAgencies] = useState<Agency[]>(initialData)
  const [count, setCount] = useState(initialCount)

  const handleAgencyCreated = (newAgency: Agency) => {
    setAgencies((prev) => [newAgency, ...prev])
    setCount((prev) => prev + 1)
  }

  return (
    <div className="grid gap-6">
      <AgencyCreateCard onAgencyCreated={handleAgencyCreated} />
      <AgenciesTable initialData={agencies} initialCount={count} />
    </div>
  )
}