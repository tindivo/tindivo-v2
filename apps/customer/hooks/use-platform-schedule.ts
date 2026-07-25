'use client'

import { useEffect, useState } from 'react'

export interface PlatformIntakeStatus {
  isOpen: boolean
  startTime: string
  cutoff: string
  endHHMM: string
  message: string
}

/**
 * Hook de horario de plataforma.
 * NOTA: El guard de plataforma en creación de pedidos fue eliminado. La plataforma
 * no restringe horarios globales; la fuente de verdad es el horario por negocio.
 */
export function usePlatformSchedule(): {
  loading: boolean
  intakeStatus: PlatformIntakeStatus | null
} {
  const [intakeStatus] = useState<PlatformIntakeStatus>({
    isOpen: true,
    startTime: '00:00',
    cutoff: '23:59',
    endHHMM: '23:59',
    message: '',
  })

  return { loading: false, intakeStatus }
}
