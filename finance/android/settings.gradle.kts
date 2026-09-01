pluginManagement {
    repositories {
        google {
            content {
                includeGroupByRegex("com\\.android.*")
                includeGroupByRegex("com\\.google.*")
                includeGroupByRegex("androidx.*")
            }
        }
        mavenCentral()
        gradlePluginPortal()
    }
}
plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // The Metabind libraries and their BindJS dependency both publish here.
        // GitHub Packages always requires authentication, even to read a public
        // package: set gpr.user / gpr.key, or GITHUB_ACTOR / GITHUB_TOKEN.
        maven {
            url = uri("https://maven.pkg.github.com/metabindai/bindjs-android-binary")
            credentials {
                username = providers.gradleProperty("gpr.user").orElse(providers.environmentVariable("GITHUB_ACTOR")).get()
                password = providers.gradleProperty("gpr.key").orElse(providers.environmentVariable("GITHUB_TOKEN")).get()
            }
        }
    }
}

rootProject.name = "metabind-finance-demo"
include(":app")

// This demo depends on a published `ai.metabind:metabindai-android` release, pinned
// in gradle/libs.versions.toml — it is an integrator's build, not an SDK build.
//
// To develop against a local metabind-android checkout, add the composite build and
// substitute the modules for it. Don't commit that:
//
// includeBuild("../../../metabind-android") {
//     dependencySubstitution {
//         substitute(module("ai.metabind:mcpappshost-android")).using(project(":mcpappshost"))
//         substitute(module("ai.metabind:metabindai-android")).using(project(":metabindai"))
//     }
// }
