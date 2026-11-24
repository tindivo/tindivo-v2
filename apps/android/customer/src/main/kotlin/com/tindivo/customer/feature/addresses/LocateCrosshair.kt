package com.tindivo.customer.feature.addresses

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.unit.dp

private const val ICON_SIZE = 24f

/** La mira de «Mi ubicación» (el trazo de `my_location` de Material): un círculo con cuatro marcas. */
internal val LocateCrosshair: ImageVector by lazy {
    ImageVector
        .Builder(
            name = "LocateCrosshair",
            defaultWidth = 24.dp,
            defaultHeight = 24.dp,
            viewportWidth = ICON_SIZE,
            viewportHeight = ICON_SIZE,
        ).addPath(
            pathData =
                PathParser()
                    .parsePathString(
                        "M12,8c-2.21,0 -4,1.79 -4,4s1.79,4 4,4 4,-1.79 4,-4 -1.79,-4 -4,-4zM20.94,11c-0.46,-4.17 " +
                            "-3.77,-7.48 -7.94,-7.94L13,1h-2v2.06C6.83,3.52 3.52,6.83 3.06,11L1,11v2h2.06c0.46,4.17 " +
                            "3.77,7.48 7.94,7.94L11,23h2v-2.06c4.17,-0.46 7.48,-3.77 7.94,-7.94L23,13v-2h-2.06zM12,19" +
                            "c-3.87,0 -7,-3.13 -7,-7s3.13,-7 7,-7 7,3.13 7,7 -3.13,7 -7,7z",
                    ).toNodes(),
            fill = SolidColor(Color.Black),
        ).build()
}
