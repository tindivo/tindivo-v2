package com.tindivo.core.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

private const val ICON_SIZE = 24f

private fun icon(
    name: String,
    pathData: String,
    autoMirror: Boolean = false,
): ImageVector =
    ImageVector
        .Builder(
            name = name,
            defaultWidth = ICON_SIZE.dp,
            defaultHeight = ICON_SIZE.dp,
            viewportWidth = ICON_SIZE,
            viewportHeight = ICON_SIZE,
            autoMirror = autoMirror,
        ).addPath(pathData = addPathNodes(pathData), fill = SolidColor(Color.Black))
        .build()

/**
 * Los pocos iconos que usa la app, dibujados en código.
 *
 * No hay librería de iconos a propósito: `material-icons-core` suma peso al APK, que tiene techo. Tampoco recursos XML
 * de vector ni `painterResource`, que arrastran el lector de vectores XML (ya nos pasó del techo una vez). Las formas
 * son las de Material Icons (24×24, licencia Apache 2.0, © Google). Cada una se construye una sola vez, al primer uso.
 *
 * El color lo pone quien los dibuja (`Icon` aplica el tinte), por eso el relleno es negro.
 */
object TindivoIcons {
    /** Flecha de volver; en idiomas de derecha a izquierda se espeja sola. */
    val ArrowBack: ImageVector by lazy {
        icon("ArrowBack", "M20,11H7.83l5.59,-5.59L12,4l-8,8 8,8 1.41,-1.41L7.83,13H20v-2z", autoMirror = true)
    }

    val Search: ImageVector by lazy {
        icon(
            "Search",
            "M15.5,14h-0.79l-0.28,-0.27C15.41,12.59 16,11.11 16,9.5 16,5.91 13.09,3 9.5,3S3,5.91 3,9.5 5.91,16 " +
                "9.5,16c1.61,0 3.09,-0.59 4.23,-1.57l0.27,0.28v0.79l5,4.99L20.49,19l-4.99,-5zM9.5,14C7.01,14 5,11.99 " +
                "5,9.5S7.01,5 9.5,5 14,7.01 14,9.5 11.99,14 9.5,14z",
        )
    }

    val Close: ImageVector by lazy {
        icon(
            "Close",
            "M19,6.41L17.59,5 12,10.59 6.41,5 5,6.41 10.59,12 5,17.59 6.41,19 12,13.41 17.59,19 19,17.59 " +
                "13.41,12z",
        )
    }

    /** Cuadrícula de cuatro recuadros: el índice de secciones. */
    val GridView: ImageVector by lazy {
        icon(
            "GridView",
            "M3,3v8h8V3H3zM9,9H5V5h4V9zM3,13v8h8v-8H3zM9,19H5v-4h4V19zM13,3v8h8V3H13zM19,9h-4V5h4V9zM13,13v8h8v-8H13z" +
                "M19,19h-4v-4h4V19z",
        )
    }

    /** Círculo con signo de admiración: algo salió mal ([ErrorState]). */
    val ErrorOutline: ImageVector by lazy {
        icon(
            "ErrorOutline",
            "M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 " +
                "11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z",
        )
    }

    /** Bandeja vacía: todavía no hay nada que mostrar ([EmptyState]). */
    val Inbox: ImageVector by lazy {
        icon(
            "Inbox",
            "M19 3H4.99c-1.11 0-1.98.89-1.98 2L3 19c0 1.1.88 2 1.99 2H19c1.1 0 2-.9 2-2V5c0-1.11-.9-2-2-2zm0 12h-4c0 " +
                "1.66-1.35 3-3 3s-3-1.34-3-3H4.99V5H19v10z",
        )
    }

    /** Casa: pestaña Inicio. */
    val Home: ImageVector by lazy { icon("Home", "M10,20v-6h4v6h5v-8h3L12,3 2,12h3v8z") }

    /** Camión: pestaña y tarjeta de Entregas (hueco: la moto ilustrada de la v3.1 aún no es un recurso). */
    val LocalShipping: ImageVector by lazy {
        icon(
            "LocalShipping",
            "M20,8h-3V4H3c-1.1,0 -2,0.9 -2,2v11h2c0,1.66 1.34,3 3,3s3,-1.34 3,-3h6c0,1.66 1.34,3 3,3s3,-1.34 3,-3h2" +
                "v-5" +
                "l-3,-4zM6,18.5c-0.83,0 -1.5,-0.67 -1.5,-1.5s0.67,-1.5 1.5,-1.5 1.5,0.67 1.5,1.5 -0.67,1.5 -1.5,1.5z" +
                "M19.5,9.5l1.96,2.5H17V9.5h2.5zM18,18.5c-0.83,0 -1.5,-0.67 -1.5,-1.5s0.67,-1.5 1.5,-1.5 1.5,0.67 " +
                "1.5,1.5 -0.67,1.5 -1.5,1.5z",
        )
    }

    /** Recibo: pestaña Pedidos. */
    val Receipt: ImageVector by lazy {
        icon(
            "Receipt",
            "M18,17H6v-2h12v2zM18,13H6v-2h12v2zM18,9H6V7h12v2zM3,22l1.5,-1.5L6,22l1.5,-1.5L9,22l1.5,-1.5L12,22l1.5," +
                "-1.5L15,22l1.5,-1.5L18,22l1.5,-1.5L21,22V2l-1.5,1.5L18,2l-1.5,1.5L15,2l-1.5,1.5L12,2l-1.5,1.5L9,2 " +
                "7.5,3.5 6,2 4.5,3.5 3,2v20z",
        )
    }

    /** Persona: pestaña Cuenta. */
    val Person: ImageVector by lazy {
        icon(
            "Person",
            "M12,12c2.21,0 4,-1.79 4,-4s-1.79,-4 -4,-4 -4,1.79 -4,4 1.79,4 4,4zM12,14c-2.67,0 -8,1.34 -8,4v2h16v-2" +
                "c0,-2.66 -5.33,-4 -8,-4z",
        )
    }

    /** Bolsa de compras: la bolsa del cliente. */
    val ShoppingBag: ImageVector by lazy {
        icon(
            "ShoppingBag",
            "M18,6h-2c0,-2.21 -1.79,-4 -4,-4S8,3.79 8,6H6c-1.1,0 -2,0.9 -2,2v12c0,1.1 0.9,2 2,2h12c1.1,0 2,-0.9 2,-2" +
                "V8" +
                "c0,-1.1 -0.9,-2 -2,-2zM12,4c1.1,0 2,0.9 2,2h-4c0,-1.1 0.9,-2 2,-2zM18,20H6V8h2v2c0,0.55 0.45,1 1,1" +
                "s1,-0.45 1,-1V8h4v2c0,0.55 0.45,1 1,1s1,-0.45 1,-1V8h2v12z",
        )
    }

    /** Flecha hacia adelante: el botón redondo de las tarjetas de servicio; se espeja en derecha a izquierda. */
    val ArrowForward: ImageVector by lazy {
        icon("ArrowForward", "M12,4l-1.41,1.41L16.17,11H4v2h12.17l-5.58,5.59L12,20l8,-8z", autoMirror = true)
    }

    /** Chevron hacia la derecha: una fila que abre otra pantalla. */
    val ChevronRight: ImageVector by lazy {
        icon("ChevronRight", "M10,6L8.59,7.41 13.17,12l-4.58,4.59L10,18l6,-6z", autoMirror = true)
    }

    /** Visto: «Entregado», «Verificado». */
    val Check: ImageVector by lazy { icon("Check", "M9,16.17L4.83,12l-1.42,1.41L9,19 21,7l-1.41,-1.41z") }

    /** Flechas en círculo: «Volver a pedir». */
    val Replay: ImageVector by lazy {
        icon(
            "Replay",
            "M17.65,6.35C16.2,4.9 14.21,4 12,4c-4.42,0 -7.99,3.58 -7.99,8s3.57,8 7.99,8c3.73,0 6.84,-2.55 " +
                "7.73,-6h-2.08c-0.82,2.33 -3.04,4 -5.65,4 -3.31,0 -6,-2.69 -6,-6s2.69,-6 6,-6c1.66,0 3.14,0.69 " +
                "4.22,1.78L13,11h7V4l-2.35,2.35z",
        )
    }

    /** Lápiz: editar el nombre. */
    val Edit: ImageVector by lazy {
        icon(
            "Edit",
            "M3,17.25V21h3.75L17.81,9.94l-3.75,-3.75L3,17.25zM20.71,7.04c0.39,-0.39 0.39,-1.02 0,-1.41l-2.34,-2.34" +
                "c-0.39,-0.39 -1.02,-0.39 -1.41,0l-1.83,1.83 3.75,3.75 1.83,-1.83z",
        )
    }

    /** Globo de conversación: «Ayuda por WhatsApp». */
    val Chat: ImageVector by lazy {
        icon("Chat", "M20,2H4c-1.1,0 -2,0.9 -2,2v18l4,-4h14c1.1,0 2,-0.9 2,-2V4c0,-1.1 -0.9,-2 -2,-2z")
    }

    /** Documento: «Términos y condiciones». */
    val Description: ImageVector by lazy {
        icon(
            "Description",
            "M14,2H6c-1.1,0 -1.99,0.9 -1.99,2L4,20c0,1.1 0.89,2 1.99,2H18c1.1,0 2,-0.9 2,-2V8l-6,-6zM16,18H8v-2h8v2z" +
                "M16,14H8v-2h8v2zM13,9V3.5L18.5,9H13z",
        )
    }

    /** Escudo: «Privacidad». */
    val Shield: ImageVector by lazy {
        icon("Shield", "M12,1L3,5v6c0,5.55 3.84,10.74 9,12 5.16,-1.26 9,-6.45 9,-12V5l-9,-4z")
    }

    /** Salir: «Cerrar sesión». */
    val Logout: ImageVector by lazy {
        icon(
            "Logout",
            "M17,7l-1.41,1.41L18.17,11H8v2h10.17l-2.58,2.58L17,17l5,-5zM4,5h8V3H4c-1.1,0 -2,0.9 -2,2v14c0,1.1 0.9,2 " +
                "2,2h8v-2H4V5z",
        )
    }

    /** Pin de mapa: las direcciones. */
    val Place: ImageVector by lazy {
        icon(
            "Place",
            "M12,2C8.13,2 5,5.13 5,9c0,5.25 7,13 7,13s7,-7.75 7,-13c0,-3.87 -3.13,-7 -7,-7zM12,11.5c-1.38,0 -2.5," +
                "-1.12 -2.5,-2.5s1.12,-2.5 2.5,-2.5 2.5,1.12 2.5,2.5 -1.12,2.5 -2.5,2.5z",
        )
    }

    /** Abrir fuera de la app: un enlace que sale a WhatsApp o al navegador. */
    val OpenInNew: ImageVector by lazy {
        icon(
            "OpenInNew",
            "M19,19H5V5h7V3H5c-1.11,0 -2,0.9 -2,2v14c0,1.1 0.89,2 2,2h14c1.1,0 2,-0.9 2,-2v-7h-2v7zM14,3v2h3.59" +
                "l-9.83,9.83 1.41,1.41L19,6.41V10h2V3h-7z",
            autoMirror = true,
        )
    }

    /** Más: sumar una unidad. */
    val Add: ImageVector by lazy { icon("Add", "M19,13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z") }

    /** Menos: quitar una unidad. */
    val Remove: ImageVector by lazy { icon("Remove", "M19,13H5v-2h14v2z") }

    /** Tacho: quitar el último producto de una línea. */
    val Delete: ImageVector by lazy {
        icon("Delete", "M6,19c0,1.1 0.9,2 2,2h8c1.1,0 2,-0.9 2,-2V7H6v12zM19,4h-3.5l-1,-1h-5l-1,1H5v2h14V4z")
    }

    /** Chevron hacia abajo: la píldora «Entregar en». */
    val ExpandMore: ImageVector by lazy {
        icon("ExpandMore", "M7.41,8.59L12,13.17l4.59,-4.58L18,10l-6,6 -6,-6 1.41,-1.41z")
    }

    /** Reloj: cuánto falta («Llega en»). */
    val Schedule: ImageVector by lazy {
        icon(
            "Schedule",
            "M11.99,2C6.47,2 2,6.48 2,12s4.47,10 9.99,10C17.52,22 22,17.52 22,12S17.52,2 11.99,2zM12,20c-4.42,0 -8," +
                "-3.58 -8,-8s3.58,-8 8,-8 8,3.58 8,8 -3.58,8 -8,8zM12.5,7H11v6l5.25,3.15 0.75,-1.23 -4.5,-2.67z",
        )
    }

    /** Teléfono: el celular de contacto. */
    val Phone: ImageVector by lazy {
        icon(
            "Phone",
            "M20.01,15.38c-1.23,0 -2.42,-0.2 -3.53,-0.56 -0.35,-0.12 -0.74,-0.03 -1.01,0.24l-1.57,1.97" +
                "c-2.83,-1.35 -5.48,-3.9 -6.89,-6.83l1.95,-1.66c0.27,-0.28 0.35,-0.67 0.24,-1.02" +
                " -0.37,-1.11 -0.56,-2.3 -0.56,-3.53 0,-0.54 -0.45,-0.99 -0.99,-0.99H4.19C3.65,3 3,3.24 3,3.99" +
                " 3,13.28 10.73,21 20.01,21c0.71,0 0.99,-0.63 0.99,-1.18v-3.45c0,-0.54 -0.45,-0.99 -0.99,-0.99z",
        )
    }

    /** Maletín: la dirección «Trabajo». */
    val Work: ImageVector by lazy {
        icon(
            "Work",
            "M20,6h-4V4c0,-1.11 -0.89,-2 -2,-2h-4c-1.11,0 -2,0.89 -2,2v2H4c-1.11,0 -1.99,0.89 -1.99,2L2,19" +
                "c0,1.11 0.89,2 2,2h16" +
                "c1.11,0 2,-0.89 2,-2V8c0,-1.11 -0.89,-2 -2,-2zM10,4h4v2h-4V4z",
        )
    }

    /** Tienda: recoger en el local. */
    val Storefront: ImageVector by lazy {
        icon("Storefront", "M20,4H4v2h16V4zM21,14v-2l-1,-5H4l-1,5v2h1v6h10v-6h4v6h2v-6h1zM12,18H6v-4h6v4z")
    }
}
