import java.util.Properties

plugins {
    id("com.android.application")
}

/* ---------------------------------------------------------------------------
   Yapılandırma
   Değerler şu sırayla okunur:
     1. Komut satırı:  -Pblokiki.admobAppId=...
     2. android/local.properties (sürüm kontrolüne girmez)
     3. Aşağıdaki varsayılanlar (AdMob resmî TEST kimlikleri)
   Gerçek kimlikler yalnızca local.properties içinde tutulmalı.
--------------------------------------------------------------------------- */
val localProperties = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun setting(name: String, fallback: String = ""): String {
    val fromProject = (project.findProperty(name) as String?)?.trim()
    if (!fromProject.isNullOrEmpty()) return fromProject
    val fromFile = localProperties.getProperty(name)?.trim()
    if (!fromFile.isNullOrEmpty()) return fromFile
    val fromEnv = System.getenv(name.uppercase().replace('.', '_'))?.trim()
    if (!fromEnv.isNullOrEmpty()) return fromEnv
    return fallback
}

/* Google'ın herkese açık test kimlikleri. Yayına geçerken değiştir. */
val admobAppId = setting("blokiki.admobAppId", "ca-app-pub-3940256099942544~3347511713")
val admobInterstitial = setting("blokiki.admobInterstitial", "ca-app-pub-3940256099942544/1033173712")
val admobRewarded = setting("blokiki.admobRewarded", "ca-app-pub-3940256099942544/5224354917")
val admobBanner = setting("blokiki.admobBanner", "ca-app-pub-3940256099942544/6300978111")

/* Play Games Services uygulama kimliği (Play Console → Oyun hizmetleri).
   Boş/0 ise Play Games kapanır; uygulama Google OAuth ile devam eder. */
val gamesAppId = setting("blokiki.gamesAppId", "0")

/* Sunucu adresi APK'ya gömülür (assets/server.txt). Boşsa yalnızca yerel modlar. */
val serverUrl = setting("blokiki.serverUrl", "")

/* Android OAuth istemci kimliği (assets/google.txt). */
val googleClientId = setting("blokiki.googleAndroidClientId", "")

/* "Reklamları kaldır" ürün kimliği (Play Console → Uygulama içi ürünler). */
val removeAdsProduct = setting("blokiki.removeAdsProduct", "remove_ads")

val appVersionCode = setting("blokiki.versionCode", "17").toIntOrNull() ?: 17
val appVersionName = setting("blokiki.versionName", "2.0.5")

android {
    namespace = "tr.blokiki.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "tr.blokiki.app"
        minSdk = 23
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName

        manifestPlaceholders["admobAppId"] = admobAppId
        manifestPlaceholders["gamesAppId"] = gamesAppId
        manifestPlaceholders["oauthScheme"] = if (googleClientId.isNotEmpty()) {
            "com.googleusercontent.apps." + googleClientId.substringBefore(".apps.googleusercontent.com")
        } else {
            "com.googleusercontent.apps.placeholder"
        }

        resValue("string", "game_app_id", gamesAppId)
        resValue("string", "admob_interstitial", admobInterstitial)
        resValue("string", "admob_rewarded", admobRewarded)
        resValue("string", "admob_banner", admobBanner)
        resValue("string", "remove_ads_product", removeAdsProduct)
    }

    signingConfigs {
        val keystore = rootProject.file("release.keystore")
        if (keystore.exists()) {
            create("release") {
                storeFile = keystore
                storePassword = setting("blokiki.storePass", "blokiki-release")
                keyAlias = setting("blokiki.keyAlias", "blokiki")
                keyPassword = setting("blokiki.keyPass", setting("blokiki.storePass", "blokiki-release"))
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ""
            manifestPlaceholders["usesCleartextTraffic"] = "true"
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            manifestPlaceholders["usesCleartextTraffic"] = "false"
            signingConfig = if (rootProject.file("release.keystore").exists()) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources.excludes += setOf(
            "META-INF/LICENSE*",
            "META-INF/NOTICE*",
            "META-INF/DEPENDENCIES"
        )
    }

    /* Web varlıkları ve çalışma zamanı ayarları derleme sırasında üretilir. */
    sourceSets["main"].assets.srcDirs(
        layout.buildDirectory.dir("generated/assets"),
        layout.buildDirectory.dir("generated/webassets")
    )
}

dependencies {
    /* AdMob (Google Mobile Ads) + izin/gizlilik akışı (UMP). */
    implementation("com.google.android.gms:play-services-ads:24.2.0")
    implementation("com.google.android.ump:user-messaging-platform:3.2.0")

    /* Google Play Games Services v2 (oyuncu oturumu). */
    implementation("com.google.android.gms:play-services-games-v2:20.0.0")
    implementation("com.google.android.gms:play-services-auth:21.2.0")

    /* Google Play Billing: "Reklamları kaldır" tek seferlik ürünü. */
    implementation("com.android.billingclient:billing:7.1.1")
}

/* public/ klasörü tek kaynak; APK'ya kopyalanır (servis çalışanı hariç).
   1024 px ikon yalnızca mağaza/PWA kaynağıdır; uygulamada kullanılmaz ve
   0,9 MB yer kaplar. Bu yüzden pakete girmez. */
val syncWebAssets by tasks.registering(Sync::class) {
    from(rootProject.file("../public")) {
        exclude("sw.js", "icons/icon-1024.png")
    }
    into(layout.buildDirectory.dir("generated/webassets/www"))
}

/* server.txt / google.txt çalışma zamanında Java tarafından okunur. */
val writeRuntimeConfig by tasks.registering {
    val outputDir = layout.buildDirectory.dir("generated/assets")
    inputs.property("serverUrl", serverUrl)
    inputs.property("googleClientId", googleClientId)
    doLast {
        val dir = outputDir.get().asFile
        dir.mkdirs()
        File(dir, "server.txt").writeText(serverUrl)
        File(dir, "google.txt").writeText(googleClientId)
    }
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets, writeRuntimeConfig)
}

/* Türkçe karakterler kaynak dosyalarda UTF-8 olarak duruyor. */
tasks.withType<org.gradle.api.tasks.compile.JavaCompile>().configureEach {
    options.encoding = "UTF-8"
}
