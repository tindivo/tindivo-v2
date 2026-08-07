'use client'

import { useEffect, useState } from 'react'
import { api } from '@/lib/api'
import type { IntakeStatus } from '../types'

export function useIntakeStatus() {
  const [intakeStatus, setIntakeStatus] = useState<IntakeStatus | null>(null)

  useEffect(() => {
    let unmounted = false
    api
      .get<IntakeStatus>('/public/schedule')
      .then((data) => {
        if (!unmounted && data) setIntakeStatus(data)
      })
      .catch(() => {})
    return () => {
      unmounted = true
    }
  }, [])

  return intakeStatus
}
