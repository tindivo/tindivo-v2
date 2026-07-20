import { describe, expect, it } from 'vitest'

describe('Outbox Processor en @tindivo/api', () => {
  it('genera un event_id determinista único para la cancelación por rechazo final', () => {
    const orderId = 'd3b07384-d113-460f-96a2-6323491f8682'
    const cancelledAtTimestamp = 1784541600
    const eventId = `proof-rejected-final-${orderId}-${cancelledAtTimestamp}`

    expect(eventId).toBe('proof-rejected-final-d3b07384-d113-460f-96a2-6323491f8682-1784541600')
  })

  it('genera un event_id determinista único para la apelación de cliente', () => {
    const reportId = 'e4c18495-e224-571g-07b3-7434502g9793'
    const eventId = `appeal-created-${reportId}`

    expect(eventId).toBe('appeal-created-e4c18495-e224-571g-07b3-7434502g9793')
  })
})
