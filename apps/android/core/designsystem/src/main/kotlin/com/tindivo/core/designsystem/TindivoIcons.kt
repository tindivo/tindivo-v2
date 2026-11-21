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

    /** Chevron hacia abajo: la píldora «Entregar en». */
    val ExpandMore: ImageVector by lazy {
        icon("ExpandMore", "M7.41,8.59L12,13.17l4.59,-4.58L18,10l-6,6 -6,-6 1.41,-1.41z")
    }
}
