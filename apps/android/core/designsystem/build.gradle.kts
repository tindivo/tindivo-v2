plugins {
    alias(libs.plugins.android.library)
}

android {
    namespace = "com.tindivo.core.designsystem"
    compileSdk = 36

    defaultConfig {
        minSdk = 26
    }
}
