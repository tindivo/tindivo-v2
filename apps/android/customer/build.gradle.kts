plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

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
        }
        create("prod") {
            dimension = "environment"
            buildConfigField("String", "API_BASE_URL", "\"https://apiv2.tindivo.com/api/v1\"")
            buildConfigField("String", "SUPABASE_URL", "\"https://zpnipajgwfthxhdtzhly.supabase.co\"")
            buildConfigField("String", "SUPABASE_PUBLISHABLE_KEY", "\"sb_publishable_J8M8nH_cb2eYjAt2E5L27w_EhMnwS0W\"")
            buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"\"")
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

    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.googleid)
    implementation(libs.tink.android)

    implementation(libs.hilt.android)
    implementation(libs.androidx.hilt.navigation.compose)
    ksp(libs.hilt.compiler)

    testImplementation(libs.junit)
    testImplementation(libs.okhttp.mockwebserver)
    testImplementation(libs.kotlinx.coroutines.test)
}
