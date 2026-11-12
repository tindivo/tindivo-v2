plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

/** Una propiedad Gradle o, si no está, la variable de entorno del mismo nombre; vacía si no hay ninguna (la CI). */
fun localSetting(name: String): String =
    providers.gradleProperty(name).orElse(providers.environmentVariable(name)).getOrElse("")

/** [value] como literal de texto de Java para `buildConfigField`. */
fun javaString(value: String): String = "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

android {
    namespace = "com.tindivo.customer"
    // KT-1: compileSdk ≥ targetSdk. Compose 1.12, core 1.19 y lifecycle 2.11 exigen compilar contra la API 37; el
    // targetSdk sigue en 36, el que exige Google Play.
    compileSdk = 37

    defaultConfig {
        applicationId = "com.tindivo.customer"
        minSdk = 26
        targetSdk = 36
        // KT-15: el versionCode lo pone la CI con -PversionCode=<run_number>; en local vale 1.
        versionCode = providers.gradleProperty("versionCode").map(String::toInt).getOrElse(1)
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // La clave del SDK de Maps NUNCA va en el repo: sale de la propiedad Gradle o de la variable de entorno
        // MAPS_API_KEY. Sin ella (la CI) queda vacía y el mapa sale en blanco, que es lo esperado.
        manifestPlaceholders["mapsApiKey"] =
            providers.gradleProperty("MAPS_API_KEY").orElse(providers.environmentVariable("MAPS_API_KEY")).getOrElse("")
        // Firebase (avisos, KT-10): como MAPS_API_KEY, NUNCA en el repo (es público) y sin google-services.json. Salen de
        // la propiedad Gradle o de la variable de entorno; sin ellas (la CI) quedan vacías y los avisos se apagan solos.
        // El FIREBASE_APP_ID es de cada sabor (abajo): dev y prod son apps distintas del mismo proyecto.
        buildConfigField("String", "FIREBASE_API_KEY", javaString(localSetting("FIREBASE_API_KEY")))
        buildConfigField("String", "FIREBASE_PROJECT_ID", javaString(localSetting("FIREBASE_PROJECT_ID")))
        buildConfigField("String", "FIREBASE_SENDER_ID", javaString(localSetting("FIREBASE_SENDER_ID")))
    }

    // :core:network compila a bytecode 21: un módulo Android solo puede resolverlo si declara ese mismo objetivo.
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    flavorDimensions += "environment"
    productFlavors {
        create("dev") {
            dimension = "environment"
            applicationIdSuffix = ".dev"
            buildConfigField("String", "API_BASE_URL", "\"https://tindivo-api-staging.vercel.app/api/v1\"")
            // Claves PUBLICABLES de Supabase (hechas para ir en el cliente); no son secretas. El ID web de Google lo
            // pone Jesús; vacío, la app no ofrece el inicio de sesión.
            buildConfigField("String", "SUPABASE_URL", "\"https://jgziumvrtogguljhpdos.supabase.co\"")
            buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_PXkU-RVUbJmzcg2uJRoHXA_nl02PVBd\"")
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"\"")
            // La web pública, para abrir Términos y Privacidad. Staging no tiene web propia: los textos legales son los
            // mismos, así que va la de producción (decisión pendiente si algún día hay una web de staging).
            buildConfigField("String", "WEB_BASE_URL", "\"https://www.tindivo.com\"")
            buildConfigField("String", "FIREBASE_APP_ID", javaString(localSetting("FIREBASE_APP_ID_DEV")))
        }
        create("prod") {
            dimension = "environment"
            buildConfigField("String", "API_BASE_URL", "\"https://apiv2.tindivo.com/api/v1\"")
            buildConfigField("String", "SUPABASE_URL", "\"https://zpnipajgwfthxhdtzhly.supabase.co\"")
            buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_J8M8nH_cb2eYjAt2E5L27w_EhMnwS0W\"")
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"\"")
            buildConfigField("String", "WEB_BASE_URL", "\"https://www.tindivo.com\"")
            buildConfigField("String", "FIREBASE_APP_ID", javaString(localSetting("FIREBASE_APP_ID_PROD")))
        }
    }

    buildTypes {
        release {
            // KT-15: R8 y reducción de recursos activos en release. Sin firma: Play App Signing llega después. La CI
            // construye el AAB prodRelease sin firmar solo para medir su peso (D-57); no se publica.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    buildFeatures {
        buildConfig = true
        compose = true
    }

    lint {
        abortOnError = true
        checkDependencies = true
    }
}

// KT-15: nunca producción en debug; la variante prodDebug no existe.
androidComponents {
    beforeVariants(selector().withFlavor("environment" to "prod").withBuildType("debug")) { variant ->
        variant.enable = false
    }
}

dependencies {
    implementation(project(":core:network"))
    implementation(project(":core:designsystem"))

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.datastore)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)

    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)
    implementation(libs.tink.android)

    implementation(libs.play.services.maps)
    implementation(libs.maps.compose)

    // Solo Messaging (KT-10): sin el plugin google-services ni Analytics.
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)

    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    // Pruebas de UI de Compose (aprobadas por Jesús el 2026-11-11, KT-16), con las versiones del mismo BOM. El manifiesto
    // de prueba solo declara la actividad vacía donde se montan, y solo en debug.
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
