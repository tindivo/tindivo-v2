rootProject.name = "tindivo-android"

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

// Solo para verificar en una máquina sin Android SDK: `-Ptindivo.jvmOnly=true` incluye únicamente el módulo JVM puro.
// La CI no lo usa: ahí se configuran todos los módulos.
include(":core:network")
if (providers.gradleProperty("tindivo.jvmOnly").orNull != "true") {
    include(":core:designsystem")
    include(":customer")
}
