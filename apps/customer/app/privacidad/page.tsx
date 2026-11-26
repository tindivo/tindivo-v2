import type { Metadata } from 'next'
import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  B,
  Bullets,
  DataTable,
  Section,
  Sub,
  type TableRow,
  type TocEntry,
} from './_components/policy-blocks'

// El sufijo "— Tindivo" lo pone la plantilla de `app/layout.tsx`.
export const metadata: Metadata = {
  title: 'Política de Privacidad',
  description:
    'Qué datos usa Tindivo, para qué, con quién los comparte, cuánto tiempo los guarda y cómo ejercer tus derechos según la Ley N.° 29733.',
  alternates: { canonical: '/privacidad' },
}

const PRIVACY_EMAIL = 'tindivodelivery@gmail.com'
const WHATSAPP_URL = 'https://wa.me/51906550166'

const TOC = {
  responsable: { id: 'responsable', title: '1. Quién es responsable de tus datos' },
  datos: { id: 'datos', title: '2. Qué datos usamos y para qué' },
  pagos: { id: 'pagos', title: '3. Pagos y foto del comprobante' },
  compartir: { id: 'compartir', title: '4. Con quién compartimos los datos' },
  fueraDelPeru: { id: 'fuera-del-peru', title: '5. Tratamiento fuera del Perú' },
  conservacion: { id: 'conservacion', title: '6. Cuánto tiempo conservamos los datos' },
  borrarCuenta: { id: 'borrar-cuenta', title: '7. Cómo borrar tu cuenta' },
  derechos: { id: 'derechos', title: '8. Tus derechos sobre tus datos' },
  permisos: { id: 'permisos', title: '9. Permisos del teléfono' },
  avisos: { id: 'avisos', title: '10. Avisos y publicidad' },
  menores: { id: 'menores', title: '11. Menores de edad' },
  seguridad: { id: 'seguridad', title: '12. Seguridad' },
  cambios: { id: 'cambios', title: '13. Cambios a esta política' },
} as const satisfies Record<string, TocEntry>

const row = (key: string, ...cells: ReactNode[]): TableRow => ({ key, cells })

const DATA_HEADERS = ['Dato', 'De dónde sale', 'Para qué lo usamos y cuándo es necesario'] as const
const ABROAD = 'Estados Unidos u otros países donde el proveedor tiene sus servidores.'

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-brand underline">
      {children}
    </a>
  )
}

export default function PrivacidadPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-[768px] break-words bg-surface px-5 pt-12 pb-16">
      <Link
        href="/entrar"
        className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted"
      >
        ← Volver
      </Link>
      <h1 className="mt-3 font-display text-[28px] font-bold tracking-tight">
        Política de Privacidad
      </h1>
      <p className="mt-1 text-[13px] text-ink-muted">Versión 2 · 14 de noviembre de 2026</p>

      <div className="mt-6 space-y-3 text-[14px] leading-[1.6] text-ink/75">
        <p>
          Esta política explica qué datos usamos en Tindivo, para qué los necesitamos y cómo puedes
          pedir que los corrijamos o eliminemos. Se aplica a nuestra app Android
          (com.tindivo.customer) y a nuestra web.
        </p>
        <p>
          Tindivo conecta a clientes con negocios locales y coordina entregas en San Jacinto,
          Áncash, Perú. También ofrece Tindivo Entregas, para llevar de un lugar a otro algo ya
          pagado, y permite consultar Tindivo Store.
        </p>
      </div>

      <nav aria-label="Contenido" className="mt-6 rounded-xl border border-border bg-card p-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Contenido
        </p>
        <ol className="mt-2 space-y-1.5 text-[14px] leading-[1.45]">
          {Object.values(TOC).map((entry) => (
            <li key={entry.id}>
              <a href={`#${entry.id}`} className="text-brand underline-offset-2 hover:underline">
                {entry.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-8 space-y-9">
        <Section entry={TOC.responsable}>
          <p>
            El responsable es <B>Jesús Castillo Vidal</B>, persona natural, quien opera con el
            nombre comercial Tindivo.
          </p>
          <Bullets>
            <li>DNI: 70771140.</li>
            <li>
              Domicilio: C.P. San Jacinto Mz. 51 Lt. 8, distrito de Nepeña, provincia del Santa,
              Áncash, Perú.
            </li>
            <li>
              Correo de privacidad:{' '}
              <TextLink href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</TextLink>.
            </li>
            <li>
              WhatsApp de soporte: <TextLink href={WHATSAPP_URL}>+51 906 550 166</TextLink>.
            </li>
          </Bullets>
          <p>
            Tratamos tus datos conforme a la Ley N.° 29733, Ley de Protección de Datos Personales, y
            su reglamento, aprobado por el Decreto Supremo N.° 016-2024-JUS.
          </p>
          <p>
            Tus datos forman parte del banco de datos personales{' '}
            <B>«Usuarios de la aplicación móvil»</B>, inscrito en el Registro Nacional de Protección
            de Datos Personales con el código <B>PN-2026-559</B> el 14 de noviembre de 2026.
          </p>
        </Section>

        <Section entry={TOC.datos}>
          <p>
            Hay datos necesarios para atender un pedido. Otros dependen de las funciones que elijas
            usar.
          </p>
          <p>
            <B>
              Para pedir necesitamos una cuenta, un teléfono verificado y los datos que permitan
              atender y entregar el pedido.
            </B>{' '}
            Para una entrega a domicilio, debes proporcionar una dirección y una referencia
            correctas. El permiso para obtener la ubicación del celular es opcional.
          </p>

          <Sub title="Tu cuenta y tu teléfono">
            <DataTable
              headers={DATA_HEADERS}
              rows={[
                row(
                  'nombre',
                  'Nombre',
                  'De Google o de los datos que proporcionas',
                  'Identificar tu cuenta y a la persona que hace el pedido.',
                ),
                row(
                  'correo',
                  'Correo electrónico',
                  'De tu cuenta de Google; también puede existir en cuentas antiguas de la web',
                  'Identificar tu cuenta y permitir el acceso. La app Android usa Google para iniciar sesión.',
                ),
                row(
                  'id-cuenta',
                  'Identificador de cuenta',
                  'Lo genera el sistema',
                  'Relacionar tu cuenta con tus pedidos, direcciones y solicitudes.',
                ),
                row(
                  'telefono',
                  'Número de teléfono',
                  'Lo escribes tú',
                  'Contactarte por el pedido y prevenir pedidos falsos o no recibidos. Debe verificarse para poder pedir.',
                ),
                row(
                  'verificacion',
                  'Resultado y fecha de verificación del teléfono',
                  'De la verificación por SMS',
                  'Comprobar que puedes recibir mensajes en ese número. Usamos Twilio Verify para esta verificación.',
                ),
                row(
                  'intentos',
                  'Intentos de verificación',
                  'De las solicitudes de códigos',
                  'Controlar los intentos de verificación y evitar el uso indebido del servicio.',
                ),
                row(
                  'asignacion',
                  'Historial de asignación del número',
                  'De las verificaciones y traslados entre cuentas',
                  'Saber qué cuenta tuvo verificado el número y conservar las restricciones que le correspondan.',
                ),
                row(
                  'avisos-seguridad',
                  'Avisos de seguridad y solicitudes de traslado',
                  'De los cambios de número entre cuentas',
                  'Informarte cuando un número deja de estar verificado en tu cuenta y gestionar su traslado.',
                ),
                row(
                  'terminos',
                  'Registro de aceptación de términos',
                  'De tu aceptación en el servicio',
                  'Registrar la aceptación de las condiciones de uso.',
                ),
              ]}
            />
            <p>
              El SMS verifica el número.{' '}
              <B>No sirve para entrar a otra cuenta ni permite ver sus pedidos.</B>
            </p>
            <p>
              Un número solo puede estar verificado en una cuenta a la vez. Si verificas un número
              que está en otra cuenta, puedes confirmar su traslado. La cuenta anterior pierde la
              verificación. Sus pedidos, datos, deudas y roles no se trasladan.
            </p>
            <p>
              Si alguna de las dos cuentas tiene un pedido o una Entrega en curso, el traslado debe
              esperar. Si recibiste un número reciclado que tiene una restricción anterior, puedes
              pedir su revisión por WhatsApp.
            </p>
          </Sub>

          <Sub title="Direcciones y ubicación">
            <DataTable
              headers={DATA_HEADERS}
              rows={[
                row(
                  'direccion',
                  'Dirección de entrega',
                  'La escribes tú',
                  'Llevar el pedido al lugar correcto. Es necesaria para entregar a domicilio.',
                ),
                row(
                  'referencia',
                  'Referencia para encontrar el lugar',
                  'La escribes tú',
                  'Ayudar al motorizado a ubicarte. Es necesaria según las condiciones del servicio.',
                ),
                row(
                  'punto-mapa',
                  'Punto de entrega en el mapa: latitud y longitud',
                  'Del punto que marcas o confirmas',
                  'Ubicar la entrega. Marcar un punto puede proporcionar una ubicación precisa aunque no autorices el GPS.',
                ),
                row(
                  'ubicacion-celular',
                  'Ubicación del celular: latitud y longitud',
                  'Del teléfono, cuando usas la función de ubicación y das permiso',
                  'Ayudarte a marcar dónde entregar. Puedes rechazar el permiso.',
                ),
                row(
                  'precision',
                  'Precisión de la ubicación y distancia calculada',
                  'Del teléfono y de cálculos del sistema',
                  'Evaluar la ubicación usada en el pedido.',
                ),
                row(
                  'enlace-mapa',
                  'Enlace de mapa asociado a la entrega',
                  'Del dato de ubicación del pedido',
                  'Facilitar la ubicación del destino.',
                ),
                row(
                  'llegada',
                  'Ubicación registrada al llegar al destino',
                  'Del registro operativo de llegada',
                  'Dejar constancia de la entrega. No significa que rastreemos continuamente tu celular.',
                ),
              ]}
            />
            <p>
              Puedes guardar direcciones para volver a usarlas. El directorio que utiliza la cajera
              también puede conservar nombre, teléfono, dirección y referencias para reconocer a
              clientes y atender pedidos.
            </p>
          </Sub>

          <Sub title="Pedidos y Tindivo Entregas">
            <DataTable
              headers={DATA_HEADERS}
              rows={[
                row(
                  'productos',
                  'Productos, cantidades y opciones elegidas',
                  'De tu pedido',
                  'Comunicar lo que debe preparar el negocio. Son necesarios para atenderlo.',
                ),
                row(
                  'importe',
                  'Importe, costo de entrega y forma de pago',
                  'Del pedido y de su atención',
                  'Mostrar el total, coordinar el pago directo y llevar el registro del servicio.',
                ),
                row(
                  'codigo',
                  'Código, estado, fechas e historial del pedido',
                  'Del sistema y de quienes lo atienden',
                  'Dar seguimiento, coordinar la entrega, atender reclamos y llevar la caja del negocio.',
                ),
                row(
                  'solicitante',
                  'Nombre y teléfono de quien solicita una Entrega',
                  'Los proporcionas tú',
                  'Coordinar el recojo y el traslado.',
                ),
                row(
                  'destinatario',
                  'Nombre y teléfono de quien recibe',
                  'Los proporcionas tú, cuando corresponde',
                  'Ubicar a la persona que recibirá el envío.',
                ),
                row(
                  'origen-destino',
                  'Lugar de origen y destino, coordenadas y referencias',
                  'Los proporcionas tú o proceden del directorio de negocios',
                  'Recoger y entregar el envío.',
                ),
                row(
                  'descripcion',
                  'Descripción de lo que se transporta y datos de manejo, como fragilidad',
                  'Los proporcionas tú o se registran durante la atención',
                  'Organizar el traslado y el cuidado del envío.',
                ),
                row(
                  'notas',
                  'Notas para el negocio o el motorizado',
                  'Las escribes tú',
                  'Comunicar indicaciones adicionales. Son opcionales, salvo la información indispensable para realizar el servicio.',
                ),
                row(
                  'incidencias',
                  'Notas de atención, motivos de cancelación y otras incidencias',
                  'Del negocio, motorizado o equipo de Tindivo',
                  'Resolver problemas y dejar constancia de lo ocurrido.',
                ),
                row(
                  'apelaciones',
                  'Datos de apelaciones, devoluciones y sus evidencias',
                  'De tu solicitud y de quienes la atienden',
                  'Revisar reclamos sobre comprobantes o devoluciones.',
                ),
                row(
                  'canal',
                  'Registro del canal de origen de una Entrega, cuando exista',
                  'Del acceso al servicio',
                  'Identificar de dónde llegó la solicitud.',
                ),
              ]}
            />
            <p>
              Si proporcionas datos de otra persona para una Entrega, informa a esa persona y
              asegúrate de contar con autorización cuando corresponda. Comparte solo lo necesario
              para recoger o entregar el envío.
            </p>
          </Sub>

          <Sub title="Comprobantes, reseñas y promociones">
            <DataTable
              headers={DATA_HEADERS}
              rows={[
                row(
                  'comprobante',
                  'Foto o captura del comprobante de pago',
                  'La eliges y la subes',
                  'Permitir que el negocio revise un pago adelantado. Se requiere cuando el pedido debe acreditarse con un comprobante.',
                ),
                row(
                  'info-comprobante',
                  'Información visible en el comprobante',
                  'De la imagen que subes',
                  'Revisar el pago. Según la imagen, puede incluir nombre, monto, fecha, número de operación u otros datos.',
                ),
                row(
                  'resena',
                  'Calificación numérica y comentario de una reseña',
                  'Los escribes tú',
                  'Recoger tu opinión sobre el servicio. Son opcionales.',
                ),
                row(
                  'descarte-resena',
                  'Registro de que descartaste dejar una reseña',
                  'De tu elección en la pantalla',
                  'Gestionar esa invitación.',
                ),
                row(
                  'promociones',
                  'Canjes de promociones',
                  'Del uso de una promoción',
                  'Aplicar y registrar el beneficio. Solo se generan si la usas.',
                ),
              ]}
            />
            <p>Evita incluir datos personales innecesarios en notas, reseñas o imágenes.</p>
          </Sub>

          <Sub title="Avisos y datos técnicos">
            <DataTable
              headers={['Dato', 'De dónde sale', 'Para qué lo usamos']}
              rows={[
                row(
                  'instalacion',
                  'Identificador de instalación',
                  'Lo genera la app',
                  'Distinguir la instalación que recibirá los avisos.',
                ),
                row(
                  'fcm',
                  'Token de Firebase Cloud Messaging en Android',
                  'Del servicio de avisos de Google',
                  'Dirigir los avisos a tu instalación. No es tu número de teléfono.',
                ),
                row(
                  'web-push',
                  'Datos de suscripción Web Push',
                  'Del navegador, si habilitas avisos',
                  'Enviar avisos en la web.',
                ),
                row(
                  'plataforma',
                  'Plataforma y versión de la app',
                  'De la app',
                  'Gestionar los avisos y la compatibilidad.',
                ),
                row(
                  'aparato',
                  'Versión del sistema, modelo del aparato, idioma y zona horaria, cuando se envían',
                  'Del aparato',
                  'Gestionar el funcionamiento de los avisos.',
                ),
                row(
                  'permiso-avisos',
                  'Estado del permiso de notificaciones',
                  'Del sistema del aparato',
                  'Saber si los avisos están habilitados.',
                ),
                row(
                  'registro-avisos',
                  'Fechas de registro, última actividad y resultados de envío',
                  'Del sistema',
                  'Mantener el registro de avisos y detectar fallas de entrega.',
                ),
                row(
                  'plataforma-pedido',
                  'Plataforma desde la que haces un pedido',
                  'Del uso del servicio',
                  'Comparar el funcionamiento y uso de la app y la web.',
                ),
              ]}
            />
            <p>
              Autorizar los avisos es opcional. Los datos técnicos asociados a su registro se
              generan como parte de esa función; no son campos que tengas que llenar.
            </p>
          </Sub>

          <Sub title="Uso de Tindivo Store y de la web">
            <p>Al usar Store, la app envía eventos de uso al servidor. Estos pueden incluir:</p>
            <Bullets>
              <li>El tipo de acción realizada.</li>
              <li>El identificador del producto, si la acción se refiere a uno.</li>
              <li>El texto de búsqueda, si buscas algo.</li>
              <li>
                Un identificador aleatorio para agrupar acciones durante la ejecución de la app.
              </li>
            </Bullets>
            <p>
              Ese identificador se mantiene en la memoria del proceso y no se guarda en disco. El
              mensaje de estos eventos no incluye un identificador de cuenta. Esto no supone que
              todo registro técnico del servidor sea anónimo.
            </p>
            <p>
              Usamos estos eventos para medir el uso de Store. Se generan al usar esa sección. Evita
              escribir nombres, teléfonos u otros datos personales en el buscador.
            </p>
            <p>
              La web mide visitas de forma agregada con Vercel Analytics, sin cookies de publicidad.
            </p>
          </Sub>
        </Section>

        <Section entry={TOC.pagos}>
          <p>
            <B>Tindivo no procesa tus pagos ni cobra o retiene el dinero del pedido.</B> Pagas
            directamente al negocio por Yape, Plin o efectivo, según las opciones disponibles.
          </p>
          <p>No pedimos números de tarjeta, claves bancarias ni claves de Yape o Plin.</p>
          <p>
            Si pagas por adelantado, subes la foto o captura del comprobante para que el negocio
            pueda revisarla. Aunque Tindivo no procese el pago,{' '}
            <B>sí recibe y guarda esa imagen y la información que se vea en ella</B>. También puede
            usarse para revisar una apelación o devolución.
          </p>
          <p>
            La imagen no se elimina al instante cuando borras tu cuenta. Su conservación se explica
            en la <TextLink href={`#${TOC.conservacion.id}`}>sección 6</TextLink>.
          </p>
        </Section>

        <Section entry={TOC.compartir}>
          <p>Compartimos los datos necesarios para atender el servicio:</p>
          <DataTable
            headers={['Destinatario', 'Datos y motivo', 'País']}
            rows={[
              row(
                'negocio',
                'Negocio de tu pedido',
                'Identificación y contacto necesarios, productos, indicaciones, datos de entrega y comprobante cuando corresponda. Para confirmar, preparar, entregar y revisar el pago.',
                'Perú.',
              ),
              row(
                'motorizado',
                'Motorizado asignado',
                'Identificación y contacto necesarios, recojo, destino, referencias e indicaciones del envío. Para realizar la entrega.',
                'Perú.',
              ),
              row(
                'equipo',
                'Equipo autorizado de Tindivo',
                'Datos necesarios para soporte, coordinación, revisión de incidencias y prevención de fraude.',
                'Perú.',
              ),
            ]}
          />
          <p>
            Tu teléfono también se trata dentro de Tindivo y por proveedores necesarios, como el
            servicio de verificación por SMS. Por eso, su uso no se limita al negocio y al
            motorizado.
          </p>
          <p>Estos servicios tecnológicos intervienen en el funcionamiento de Tindivo:</p>
          <DataTable
            headers={[
              'Proveedor o servicio',
              'Función y datos que intervienen',
              'País de tratamiento',
            ]}
            rows={[
              row(
                'supabase',
                'Supabase',
                'Base de datos, autenticación y almacenamiento de archivos, incluidos los comprobantes.',
                `${ABROAD} La base de datos y la autenticación están en Estados Unidos.`,
              ),
              row(
                'vercel',
                'Vercel',
                'Alojamiento de la web y la API; analítica de la web. Trata las solicitudes y los datos que pasan por esos servicios.',
                ABROAD,
              ),
              row(
                'google-login',
                'Google: inicio de sesión',
                'Identificación de tu cuenta y acceso mediante Google.',
                ABROAD,
              ),
              row(
                'google-fcm',
                'Google: Firebase Cloud Messaging',
                'Envío de avisos de pedidos a Android, mediante el token de la instalación y los datos necesarios del aviso.',
                ABROAD,
              ),
              row(
                'google-maps',
                'Google Maps',
                'Mostrar el mapa y permitir elegir el punto de entrega en Android.',
                ABROAD,
              ),
              row(
                'twilio',
                'Twilio Verify',
                'Verificar tu teléfono mediante SMS. Intervienen el número y los datos necesarios de la verificación.',
                ABROAD,
              ),
              row(
                'web-push',
                'Servicio Web Push del navegador',
                'Entregar los avisos que habilites en la web.',
                'Los países donde el servicio de avisos de tu navegador tiene sus servidores.',
              ),
              row(
                'whatsapp',
                'WhatsApp',
                'Canal externo de soporte. Recibe los datos que decidas enviar al escribirnos. Store también puede abrir este servicio para contactar a un negocio.',
                ABROAD,
              ),
              row(
                'mapas-web',
                'Mapas de la web: CARTO u OpenStreetMap, y Esri en la vista de satélite',
                'Mostrar el mapa en la web para elegir el punto de entrega.',
                'Los países donde estos proveedores tienen sus servidores.',
              ),
              row(
                'servicios-api',
                'Otros servicios técnicos de la API: Upstash e Inngest',
                'Limitar solicitudes y manejar los temporizadores de los pedidos.',
                'Los países donde estos proveedores tienen sus servidores.',
              ),
              row(
                'fuentes',
                'Google Fonts',
                'Cargar los íconos de la web. Al abrir cualquier página de la web, tu navegador pide ese archivo a Google, que recibe los datos técnicos de la solicitud, como tu dirección IP y el navegador que usas.',
                ABROAD,
              ),
            ]}
          />
          <p>
            Cuando abres WhatsApp, también se aplican las condiciones y la política de ese servicio.
            Si contactas a un negocio por esa vía, el negocio recibe los datos que le envíes.
          </p>
          <p>
            <B>No vendemos tus datos ni los cedemos con fines publicitarios.</B>
          </p>
        </Section>

        <Section entry={TOC.fueraDelPeru}>
          <p>
            Parte de tus datos sale del Perú para que funcionen el acceso a tu cuenta, la web, la
            app, los mapas, la verificación del teléfono, el almacenamiento y los avisos.
          </p>
          <p>
            La base de datos y la autenticación de Supabase están en Estados Unidos. Los demás
            proveedores y sus países se detallan en la{' '}
            <TextLink href={`#${TOC.compartir.id}`}>sección anterior</TextLink>.
          </p>
          <p>
            Estas transferencias fuera del Perú están comunicadas a la Autoridad Nacional de
            Protección de Datos Personales como parte de la inscripción del banco de datos.
          </p>
          <p>
            Esta política informa sobre el tratamiento. Cuando una finalidad o transferencia
            requiera tu consentimiento, deberá solicitarse de forma válida. El uso del servicio no
            reemplaza los consentimientos específicos que exija la ley.
          </p>
        </Section>

        <Section entry={TOC.conservacion}>
          <DataTable
            headers={['Datos', 'Conservación']}
            rows={[
              row(
                'perfil',
                'Perfil, direcciones guardadas, registros de avisos, aceptación de términos, descartes de reseña, canjes de promociones e intentos de verificación',
                'Se mantienen para las funciones correspondientes mientras existe la cuenta. Al completarse su borrado, se eliminan los registros vinculados que comprende ese proceso. No hay un plazo de eliminación por inactividad.',
              ),
              row(
                'identidad',
                'Identidad de acceso a Tindivo',
                'Se elimina al completarse el borrado de la cuenta. Esto no elimina tu cuenta de Google.',
              ),
              row(
                'datos-pedidos',
                'Datos personales copiados en pedidos y Entregas',
                'Al borrar la cuenta, se retiran o sustituyen los campos de nombre, teléfono, dirección, referencias, coordenadas y notas que comprende el proceso.',
              ),
              row(
                'registro-pedidos',
                'Registro de pedidos y Entregas con esos campos retirados',
                <>
                  Se conserva <B>para siempre</B>, para la caja de cada negocio y el registro del
                  servicio. Permanecen importes, estados, fechas, identificadores y otros datos
                  operativos.
                </>,
              ),
              row(
                'comprobantes',
                'Fotos y capturas de comprobantes subidas por el cliente',
                <>
                  Se conservan mientras existe la cuenta. Tras borrarla, el plazo es de{' '}
                  <B>90 días contados desde el borrado de la cuenta</B>, no desde la fecha del pago.
                  Un proceso automático diario elimina del almacenamiento las imágenes que ya
                  cumplieron ese plazo, junto con sus referencias en pedidos y reportes. Si la
                  referencia de una imagen no tiene el formato esperado, ese proceso no la elimina
                  sola: queda pendiente de revisión manual y puede conservarse más tiempo.
                </>,
              ),
              row(
                'resenas',
                'Calificación y comentario de reseñas',
                'Al borrar la cuenta se conservan la nota y las etiquetas, sin tu nombre; el comentario se borra. Se conservan mientras sean necesarios para conocer la opinión sobre el servicio. Hoy no tienen un plazo final de eliminación: puedes pedir su supresión como se explica en «Tus derechos sobre tus datos».',
              ),
              row(
                'directorio',
                'Directorio de la cajera',
                'Se conserva después del borrado. Puede contener nombre, teléfono, dirección y referencias. Se conserva mientras sea necesario para reconocer a clientes y atender pedidos. Hoy no tiene un plazo final de eliminación: puedes pedir su supresión como se explica en «Tus derechos sobre tus datos».',
              ),
              row(
                'antifraude',
                'Reportes, incidencias y antecedentes antifraude ligados al teléfono',
                'Se conservan después del borrado mientras sean necesarios para prevenir el uso indebido y atender incidencias. Hoy no tienen un plazo final de eliminación: puedes pedir su supresión como se explica en «Tus derechos sobre tus datos».',
              ),
              row(
                'asignaciones',
                'Historial de asignación del teléfono y registros de restricciones',
                'Se conservan después del borrado mientras sean necesarios para prevenir el uso indebido. Hoy no tienen un plazo final de eliminación: puedes pedir su supresión como se explica en «Tus derechos sobre tus datos». Que una restricción termine no significa que se elimine su registro.',
              ),
              row(
                'bloqueos',
                'Bloqueos y obligación de pagar por adelantado',
                'Conservan el plazo que les corresponda. Si tienen una fecha de vencimiento, se aplica esa fecha. Su revisión también puede solicitarse por soporte.',
              ),
              row(
                'traslados',
                'Avisos de seguridad y solicitudes de traslado del número',
                'Los registros personales de aviso y desafío de traslado se eliminan al borrar la cuenta. El historial de asignación del número se conserva.',
              ),
              row(
                'caja',
                'Registros de caja y reclamos económicos del negocio',
                'No se eliminan mediante el borrado de la cuenta. Pueden incluir descripciones o notas, y comprobantes de devolución subidos por el negocio o la administración. Se conservan mientras sean necesarios para la caja del negocio y la atención de reclamos. Hoy no tienen un plazo final de eliminación: puedes pedir su supresión como se explica en «Tus derechos sobre tus datos».',
              ),
              row(
                'tecnicos',
                'Eventos de Store, analítica de la web y otros registros técnicos',
                'Se conservan mientras sean necesarios para medir el uso y mantener el servicio. Hoy no tienen un plazo final de eliminación: puedes pedir su supresión como se explica en «Tus derechos sobre tus datos».',
              ),
              row(
                'solicitudes',
                'Solicitudes de soporte y de derechos sobre datos personales',
                'Se conservan mientras sean necesarias para atenderlas y dejar constancia de la respuesta. Hoy no tienen un plazo final de eliminación: puedes pedir su supresión como se explica en «Tus derechos sobre tus datos».',
              ),
            ]}
          />
          <p>
            Retirar los datos de contacto de los pedidos{' '}
            <B>no equivale a eliminar toda posibilidad de relacionarlos con una persona</B>. Se
            conservan identificadores internos y algunos reportes que pueden relacionar un pedido
            con un teléfono. Tampoco desaparecen automáticamente los datos que permanezcan en los
            registros expresamente conservados.
          </p>
        </Section>

        <Section entry={TOC.borrarCuenta}>
          <p>Puedes hacerlo por estas vías:</p>
          <ol className="list-decimal space-y-1.5 pl-5">
            <li>
              <B>En la app:</B> entra a <B>Cuenta → Borrar mi cuenta</B> y sigue la confirmación.
            </li>
            <li>
              <B>En la web:</B> abre{' '}
              <Link href="/borrar-cuenta" className="text-brand underline">
                www.tindivo.com/borrar-cuenta
              </Link>
              , inicia sesión y sigue el proceso. No necesitas tener instalada la app.
            </li>
          </ol>
          <p>
            Si no puedes entrar a tu cuenta, escribe al correo de privacidad o al WhatsApp de
            soporte. Verificaremos tu identidad antes de atender una solicitud sobre tus datos.
          </p>
          <p>
            Cuando el proceso termina correctamente, el cierre de la cuenta y el retiro de los datos
            comprendidos en esa operación son inmediatos. La cuenta no se recupera. Para volver a
            usar Tindivo tendrás que crear una nueva.
          </p>
          <p>
            El borrado elimina tu perfil, direcciones guardadas, registros de avisos, identidad de
            acceso y otros registros personales indicados en la sección anterior. También retira
            datos de contacto, ubicación y notas de pedidos, Entregas y sus registros asociados.
          </p>
          <p>
            Permanece un registro interno de cuenta eliminada, sin tu nombre ni tu correo original,
            que sostiene los pedidos conservados.
          </p>
          <p>
            <B>El borrado no elimina todo el historial del número.</B> El directorio, los
            antecedentes antifraude, las asignaciones del teléfono y las restricciones conservadas
            no desaparecen por crear otra cuenta. Una cuenta que verifique después el mismo número
            puede quedar sujeta a sus restricciones vigentes. Si el número es reciclado o consideras
            que hay un error, pide revisión por soporte.
          </p>
          <p>
            El borrado automático debe esperar si tienes un pedido o una Entrega en curso, o una
            apelación o devolución pendiente de resolución. Cuando termine el asunto, debes volver a
            solicitarlo. Si tu cuenta también tiene un rol de negocio, motorizado o administración,
            solicita el cierre por soporte.
          </p>
          <p>
            Estas condiciones del borrado automático no impiden que presentes una solicitud para
            ejercer tus derechos sobre datos personales.
          </p>
          <p>
            <B>Cerrar sesión o desinstalar la app no borra tu cuenta.</B>
          </p>
        </Section>

        <Section entry={TOC.derechos}>
          <p>Puedes solicitar:</p>
          <Bullets>
            <li>
              <B>Información:</B> saber qué datos tratamos, de dónde vienen, para qué se usan y
              quién los recibe.
            </li>
            <li>
              <B>Acceso:</B> conocer los datos personales que tenemos sobre ti.
            </li>
            <li>
              <B>Rectificación y actualización:</B> corregir información equivocada o
              desactualizada.
            </li>
            <li>
              <B>Inclusión:</B> completar información cuando corresponda.
            </li>
            <li>
              <B>Cancelación o supresión:</B> pedir la eliminación de datos cuando corresponda
              legalmente.
            </li>
            <li>
              <B>Oposición:</B> pedir que dejemos de realizar un tratamiento en los supuestos
              reconocidos por la ley.
            </li>
            <li>
              <B>Impedir el suministro a terceros</B>, cuando corresponda.
            </li>
            <li>
              <B>Retirar tu consentimiento</B> para los tratamientos que dependan de él. Esto no
              vuelve ilícito el tratamiento realizado válidamente antes del retiro.
            </li>
            <li>
              <B>Protección frente a decisiones basadas únicamente en tratamientos automatizados</B>
              , en los supuestos reconocidos por la norma. Puedes pedir la revisión de una
              restricción que consideres equivocada.
            </li>
            <li>
              <B>Portabilidad:</B> cuando tratamos tus datos con base en tu consentimiento o en un
              contrato, puedes pedirlos en un formato estructurado y de lectura mecánica. Es una
              forma del derecho de acceso.
            </li>
          </Bullets>
          <p>
            Puedes escribir a <TextLink href={`mailto:${PRIVACY_EMAIL}`}>{PRIVACY_EMAIL}</TextLink>{' '}
            o al WhatsApp <TextLink href={WHATSAPP_URL}>+51 906 550 166</TextLink>. Indica qué
            solicitas, cómo ubicar tu cuenta y por qué medio deseas recibir la respuesta. Pediremos
            solo la información necesaria para verificar tu identidad o representación. No envíes
            contraseñas ni claves bancarias.
          </p>
          <p>Responderemos dentro de estos plazos máximos:</p>
          <DataTable
            headers={['Solicitud', 'Plazo máximo']}
            rows={[
              row('plazo-informacion', 'Información', '8 días hábiles.'),
              row('plazo-acceso', 'Acceso', '20 días hábiles.'),
              row('plazo-portabilidad', 'Portabilidad', '20 días hábiles, como el acceso.'),
              row('plazo-rco', 'Rectificación, cancelación y oposición', '10 días hábiles.'),
            ]}
          />
          <p>
            Los plazos se cuentan desde el día siguiente de presentada la solicitud (artículo 69 del
            reglamento). Las demás solicitudes se atienden dentro del plazo legal que corresponda.
          </p>
          <p>
            Si a tu solicitud le falta algún requisito, te lo diremos para que lo completes; si no
            lo completas a tiempo, se tendrá por no presentada. Si necesitamos información adicional
            para atenderla, te la pediremos y el plazo de respuesta quedará suspendido hasta que la
            envíes. Salvo en las solicitudes de información, podemos ampliar el plazo una sola vez y
            por un período igual, y te explicaremos el motivo antes de que venza. Si denegamos tu
            solicitud, te diremos por qué y te indicaremos que puedes acudir a la Dirección de
            Protección de Datos Personales o al Poder Judicial mediante el hábeas data. Si no
            respondemos dentro del plazo, puedes considerar denegada tu solicitud.
          </p>
          <p>
            Si corresponde conservar parte de los datos, explicaremos qué información permanece y
            por qué. La conservación descrita en esta política no elimina tu derecho a cuestionarla.
          </p>
          <p>
            Si no recibes respuesta dentro del plazo aplicable o consideras que tus derechos no
            fueron atendidos, puedes acudir a la{' '}
            <B>
              Autoridad Nacional de Protección de Datos Personales del Ministerio de Justicia y
              Derechos Humanos del Perú
            </B>{' '}
            para solicitar tutela o presentar la denuncia que corresponda. También puedes acudir a
            las vías previstas por la ley para reclamar daños.
          </p>
        </Section>

        <Section entry={TOC.permisos}>
          <Bullets>
            <li>
              <B>Ubicación:</B> se pide solo cuando tocas <B>«Usar mi ubicación»</B> y se usa solo
              en primer plano. Puedes autorizar ubicación precisa o aproximada, o rechazar el
              permiso y marcar el punto de entrega manualmente.
            </li>
            <li>
              <B>Foto del comprobante:</B> eliges la imagen con el selector de fotos del sistema,
              sin dar acceso general a tu galería. Solo se usa la imagen que eliges para subirla.
            </li>
            <li>
              <B>Notificaciones:</B> son opcionales. En Android 13 o superior, la app te pide
              permiso para mostrarlas.
            </li>
            <li>
              <B>Internet:</B> permite comunicarse con los servicios de Tindivo.
            </li>
          </Bullets>
          <p>
            La app del cliente <B>nunca pide ubicación en segundo plano, contactos ni micrófono</B>.
            Tampoco pide permisos de huella ni biometría para sus funciones. La verificación por SMS
            no requiere que nos des acceso a tu bandeja de mensajes.
          </p>
          <p>Puedes cambiar los permisos desde los ajustes del teléfono.</p>
        </Section>

        <Section entry={TOC.avisos}>
          <p>
            Los avisos actuales son del pedido. En Android se envían por Firebase Cloud Messaging;
            en la web, por Web Push.
          </p>
          <p>
            Puedes desactivarlos desde los ajustes de notificaciones de Tindivo en Android o desde
            los permisos del sitio en tu navegador. Si los desactivas, puedes dejar de recibir esos
            avisos y tendrás que consultar el estado del pedido en el servicio.
          </p>
          <p>
            Los cambios de número también pueden dejar un aviso de seguridad dentro de la cuenta.
          </p>
          <p>
            <B>No enviamos promociones por notificaciones actualmente.</B> Para enviar marketing
            necesitaremos un consentimiento aparte cuando corresponda. Autorizar avisos del pedido
            no equivale a aceptar publicidad.
          </p>
        </Section>

        <Section entry={TOC.menores}>
          <p>
            Tindivo está dirigido a personas de <B>14 años o más</B>. Si tienes entre 14 y 17 años,
            puedes usar la app. No nos des datos de tus papás ni de otras personas, salvo la
            dirección y el celular que hagan falta para entregar un pedido.
          </p>
          <p>
            Si eres menor de edad, tu mamá, papá o apoderado puede escribirnos al contacto de
            privacidad para revisar tus datos y atender la solicitud que corresponda. No enviamos
            promociones a menores sin permiso de sus padres.
          </p>
          <p>
            Si detectas que una persona menor de 14 años ha proporcionado datos mediante una cuenta,
            comunícalo al contacto de privacidad para revisar el caso.
          </p>
        </Section>

        <Section entry={TOC.seguridad}>
          <p>
            Usamos conexiones cifradas para el intercambio de datos. El registro de dispositivos
            para avisos tiene acceso restringido al servidor. Las operaciones de borrado también
            tienen permisos restringidos.
          </p>
          <p>
            Android protege la sesión guardada mediante cifrado. Al cerrar sesión, intenta eliminar
            la sesión local por dos vías. Si ambas fallan al mismo tiempo en el aparato, la sesión
            anterior podría reaparecer al reiniciar. Por eso no prometemos que el cierre local sea
            infalible.
          </p>
          <p>
            Estas medidas buscan reducir accesos y usos indebidos. Ningún sistema puede garantizar
            una seguridad absoluta. Si detectas un problema, comunícate con soporte.
          </p>
        </Section>

        <Section entry={TOC.cambios}>
          <p>
            Publicaremos las nuevas versiones en{' '}
            <Link href="/privacidad" className="text-brand underline">
              www.tindivo.com/privacidad
            </Link>{' '}
            e indicaremos su fecha.
          </p>
          <p>
            Si incorporamos una finalidad que requiera un consentimiento adicional, lo solicitaremos
            antes de realizar ese tratamiento.
          </p>
          <p>
            <B>Fecha de esta versión: 14 de noviembre de 2026.</B>
          </p>
        </Section>
      </div>

      <p className="mt-10 text-[12px] text-ink-muted">
        Lee también nuestros{' '}
        <Link href="/terminos" className="text-brand underline">
          Términos y Condiciones
        </Link>{' '}
        y cómo{' '}
        <Link href="/borrar-cuenta" className="text-brand underline">
          borrar tu cuenta
        </Link>
        .
      </p>
    </main>
  )
}
