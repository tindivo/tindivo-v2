import type { DeviceRepository } from './ports'

/**
 * Da de baja la instalación del actor. No distingue «no existía» de «era de otro»: quien
 * llama no debe poder averiguar de quién es un `installId` (la API responde 204 en ambos).
 */
export async function unregisterDevice(
  deps: { devices: DeviceRepository },
  input: { actorUserId: string; installId: string },
): Promise<void> {
  await deps.devices.unregister(input.actorUserId, input.installId)
}
