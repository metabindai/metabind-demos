import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.hilt)
    alias(libs.plugins.ksp)
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun config(key: String, default: String = ""): String =
    (localProps.getProperty(key) ?: providers.environmentVariable(key).orNull ?: default).trim()

android {
    namespace = "ai.metabind.retail.demo"
    compileSdk {
        version = release(libs.versions.androidCompileSdk.get().toInt()) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "ai.metabind.retail.demo"
        minSdk = libs.versions.androidMinSdk.get().toInt()
        targetSdk = libs.versions.androidCompileSdk.get().toInt()
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // Mirrors the iOS app's Config/RetailDemo.xcconfig + Local.xcconfig: identity
        // comes from local.properties (gitignored) or the environment, never from source.
        buildConfigField("String", "RETAIL_DEMO_ORG_ID", "\"${config("RETAIL_DEMO_ORG_ID", default = "YOUR_ORG_ID")}\"")
        buildConfigField("String", "RETAIL_DEMO_PROJECT_ID", "\"${config("RETAIL_DEMO_PROJECT_ID", default = "YOUR_PROJECT_ID")}\"")
        // Optional. Compiled into BuildConfig and recoverable from the APK — use only a
        // restricted, revocable demo key. Leave it empty to enter a key at runtime.
        buildConfigField("String", "RETAIL_DEMO_API_KEY", "\"${config("RETAIL_DEMO_API_KEY")}\"")
        buildConfigField(
            "String",
            "RETAIL_DEMO_AGENT_HOST",
            "\"${config("RETAIL_DEMO_AGENT_HOST", default = "https://agent.metabind.ai")}\""
        )
        buildConfigField(
            "String",
            "RETAIL_DEMO_MCP_HOST",
            "\"${config("RETAIL_DEMO_MCP_HOST", default = "https://mcp.metabind.ai")}\""
        )
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
}

configurations.all {
    exclude(group = "com.atlassian.commonmark", module = "commonmark")
}

dependencies {
    implementation(libs.metabind.assistant)

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.hilt.android)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.material3)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.richtext.commonmark)
    implementation(libs.richtext.ui.material3)
    implementation(libs.androidx.datastore.preferences)
    ksp(libs.hilt.compiler)
    testImplementation(libs.junit)
    androidTestImplementation(libs.androidx.junit)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.tooling)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}
