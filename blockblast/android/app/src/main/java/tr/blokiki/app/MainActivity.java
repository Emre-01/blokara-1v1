package tr.blokiki.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.security.SecureRandom;

public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/www/index.html";
    private static final String REDIRECT_PATH = "/oauth2redirect";
    private static final String GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
    private static final String GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

    /* Varsayılan boş: çevrimdışı oyun her zaman çalışır. Uzaktan oyun için ya
       derlemede -ServerUrl verilir (assets/server.txt) ya da uygulama içindeki
       "Sunucu adresi" alanı doldurulur. */
    private static final String DEFAULT_SERVER = "";

    private WebView web;
    private FrameLayout rootView;
    private String serverUrl = DEFAULT_SERVER;
    private int insetBottom = 0;
    private int insetTop = 0;

    /* Android OAuth istemci kimliği (assets/google.txt). Boşsa Google girişi
       arayüzde kapalı görünür; uygulama geri kalanı normal çalışır. */
    private String googleClientId = "";
    private String pendingVerifier = null;
    private boolean webReady = false;
    private String pendingGoogleJs = null;

    /* Yeni entegrasyonlar: AdMob, Google Play Games ve faturalandırma. */
    private AdsManager ads;
    private PlayGamesManager playGames;
    private BillingManager billing;
    private final java.util.ArrayList<String> pendingWebScripts = new java.util.ArrayList<>();

    /* assets/server.txt varsa oradaki adresi kullan; yoksa varsayılana dön. */
    private String readServerUrl() {
        String value = readAsset("server.txt");
        return value.length() > 0 ? value : DEFAULT_SERVER;
    }

    private String readAsset(String name) {
        try {
            InputStream in = getAssets().open(name);
            BufferedReader reader = new BufferedReader(new InputStreamReader(in, "UTF-8"));
            StringBuilder text = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (text.length() > 0) text.append('\n');
                text.append(line);
            }
            reader.close();
            in.close();
            return text.toString().trim();
        } catch (Exception ignored) {
            return "";
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        boolean debuggable = (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0;
        if (debuggable) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        serverUrl = readServerUrl();
        googleClientId = readAsset("google.txt");

        web = new WebView(this);
        web.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        web.setBackgroundColor(0xFFF3EAD8);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        /* Yerel varlıklar (file:///android_asset) erişilebilir kalır; cihaz
           dosya sistemine ve content:// sağlayıcılarına erişim kapalıdır. */
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setSupportMultipleWindows(false);
        settings.setGeolocationEnabled(false);
        /* Yayın derlemesinde karışık içerik tamamen engellenir; yalnızca
           hata ayıklama derlemesi yerel http sunucusuna izin verir. */
        settings.setMixedContentMode(debuggable
                ? WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                : WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSaveFormData(false);

        web.addJavascriptInterface(new Bridge(), "BlokIkiServer");
        web.addJavascriptInterface(new I18nBridge(), "BlokI18nBridge");
        web.addJavascriptInterface(new GoogleBridge(), "BlokIkiGoogle");
        web.addJavascriptInterface(new AdsBridge(), "BlokAds");
        web.addJavascriptInterface(new BillingBridge(), "BlokBilling");
        web.addJavascriptInterface(new PlayGamesBridge(), "BlokIkiPlayGames");

        /* Jest/gezinme çubuğunun yüksekliğini ölçüp CSS'e aktarırız. */
        web.setOnApplyWindowInsetsListener(new android.view.View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(android.view.View view, WindowInsets insets) {
                int top, bottom;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    android.graphics.Insets bars = insets.getInsets(
                            WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                    top = bars.top;
                    bottom = bars.bottom;
                } else {
                    top = insets.getSystemWindowInsetTop();
                    bottom = insets.getSystemWindowInsetBottom();
                }
                float density = getResources().getDisplayMetrics().density;
                insetTop = Math.max(0, Math.round(top / density));
                insetBottom = Math.max(0, Math.round(bottom / density));
                pushInsets();
                return insets;
            }
        });

        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                webReady = true;
                pushInsets();
                flushPendingGoogle();
                flushWebScripts();
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }
        });

        /* WebView tam ekran; alt banner aynı çerçevenin en altına bindirilir.
           Banner görünürken JS, --ad-b ile oyun alanına pay bırakır. */
        rootView = new FrameLayout(this);
        rootView.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(rootView);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
            webReady = true;
        } else {
            web.loadUrl(START_URL);
        }

        /* Uygulama kapalıyken OAuth yönlendirmesiyle açıldıysa sonucu işle. */
        handleGoogleRedirect(getIntent());

        startNewIntegrations();
    }

    /* ------------------------------------------------------------------ */
    /* AdMob + Google Play Games                                          */
    /* ------------------------------------------------------------------ */

    private void startNewIntegrations() {
        playGames = new PlayGamesManager(this, getString(R.string.game_app_id),
                new PlayGamesManager.Listener() {
                    @Override
                    public void onPlayer(String json) {
                        pushWebScript("window.BlokPlayGamesEvent&&window.BlokPlayGamesEvent('player',"
                                + JSONObject.quote(json) + ")");
                    }

                    @Override
                    public void onError(String message) {
                        pushWebScript("window.BlokPlayGamesEvent&&window.BlokPlayGamesEvent('error',"
                                + JSONObject.quote(message) + ")");
                    }
                });
        playGames.initialize();
        playGames.silentSignIn();

        ads = new AdsManager(this, rootView,
                getString(R.string.admob_interstitial),
                getString(R.string.admob_rewarded),
                getString(R.string.admob_banner),
                event -> pushWebScript(
                        "window.BlokAdsEvent&&window.BlokAdsEvent(" + JSONObject.quote(event) + ")"));
        ads.start();
        float density = getResources().getDisplayMetrics().density;
        ads.setBottomInset(Math.round(insetBottom * density));

        billing = new BillingManager(this, getString(R.string.remove_ads_product),
                event -> pushWebScript(
                        "window.BlokBillingEvent&&window.BlokBillingEvent(" + JSONObject.quote(event) + ")"));
        billing.start();
    }

    /** Sayfa hazır değilse betiği kuyruğa alır; hazır olunca sırayla çalıştırır. */
    private void pushWebScript(String js) {
        if (web == null) return;
        if (!webReady) {
            synchronized (pendingWebScripts) {
                pendingWebScripts.add(js);
            }
            return;
        }
        runOnUiThread(() -> {
            try {
                if (web != null) web.evaluateJavascript("try{" + js + "}catch(e){}", null);
            } catch (Exception ignored) {
                /* yoksay */
            }
        });
    }

    private void flushWebScripts() {
        if (web == null) return;
        java.util.ArrayList<String> copy;
        synchronized (pendingWebScripts) {
            if (pendingWebScripts.isEmpty()) return;
            copy = new java.util.ArrayList<>(pendingWebScripts);
            pendingWebScripts.clear();
        }
        for (String js : copy) {
            try {
                web.evaluateJavascript("try{" + js + "}catch(e){}", null);
            } catch (Exception ignored) {
                /* yoksay */
            }
        }
    }

    public class AdsBridge {
        @JavascriptInterface
        public boolean available() {
            return ads != null && (ads.hasInterstitial() || ads.hasRewarded());
        }

        @JavascriptInterface
        public boolean hasInterstitial() {
            return ads != null && ads.hasInterstitial();
        }

        @JavascriptInterface
        public boolean hasRewarded() {
            return ads != null && ads.hasRewarded();
        }

        @JavascriptInterface
        public boolean hasBanner() {
            return ads != null && ads.hasBanner();
        }

        @JavascriptInterface
        public void showBanner() {
            if (ads == null) return;
            runOnUiThread(() -> ads.showBanner());
        }

        @JavascriptInterface
        public void hideBanner() {
            if (ads == null) return;
            runOnUiThread(() -> ads.hideBanner());
        }

        @JavascriptInterface
        public void showInterstitial() {
            if (ads == null) return;
            runOnUiThread(() -> ads.showInterstitial());
        }

        @JavascriptInterface
        public void showRewarded() {
            if (ads == null) return;
            runOnUiThread(() -> ads.showRewarded());
        }
    }

    public class BillingBridge {
        @JavascriptInterface
        public boolean available() {
            return billing != null && billing.isAvailable();
        }

        @JavascriptInterface
        public boolean owned() {
            return billing != null && billing.isOwned();
        }

        @JavascriptInterface
        public void purchase() {
            if (billing == null) return;
            runOnUiThread(() -> billing.purchase());
        }

        @JavascriptInterface
        public void refresh() {
            if (billing == null) return;
            runOnUiThread(() -> billing.refreshOwned());
        }
    }

    public class PlayGamesBridge {
        @JavascriptInterface
        public boolean available() {
            return playGames != null && playGames.isAvailable();
        }

        @JavascriptInterface
        public void signIn() {
            if (playGames == null) return;
            runOnUiThread(() -> playGames.signIn());
        }

        @JavascriptInterface
        public void autoSignIn() {
            if (playGames == null) return;
            runOnUiThread(() -> playGames.silentSignIn());
        }

        @JavascriptInterface
        public void signOut() {
            if (playGames == null) return;
            runOnUiThread(() -> playGames.signOut());
        }

        @JavascriptInterface
        public String player() {
            return playGames == null ? "" : playGames.playerJson();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (playGames != null) playGames.handleActivityResult(requestCode, resultCode, data);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleGoogleRedirect(intent);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) pushInsets();
    }

    /* Uygulama içi linkler WebView'da kalır, dış linkler tarayıcıda açılır.
       Yalnızca bilinen güvenli şemalara izin verilir; javascript:, data:,
       intent: ve content: gibi şemalar engellenir. */
    private boolean handleUrl(String url) {
        if (url == null) return true;
        String lower = url.toLowerCase();
        if (lower.startsWith("file://") || lower.startsWith("about:")) {
            return false;
        }
        try {
            Uri uri = Uri.parse(url);
            String scheme = uri.getScheme();
            if ("http".equals(scheme) || "https".equals(scheme)
                    || "mailto".equals(scheme) || "tel".equals(scheme)) {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            }
        } catch (Exception ignored) {
            /* açacak uygulama yok ya da şema geçersiz */
        }
        return true;
    }

    /* Ölçülen güvenli alanları CSS değişkenlerine yazar. */
    private void pushInsets() {
        if (web == null) return;
        if (ads != null) {
            float density = getResources().getDisplayMetrics().density;
            ads.setBottomInset(Math.round(insetBottom * density));
        }
        String js = "(function(){var r=document.documentElement;" +
                "r.style.setProperty('--safe-t','" + insetTop + "px');" +
                "r.style.setProperty('--safe-b','" + insetBottom + "px');" +
                "r.classList.add('native');})()";
        web.evaluateJavascript(js, null);
    }

    /* ------------------------------------------------------------------ */
    /* Google ile giriş (tarayıcı OAuth + PKCE)                           */
    /* ------------------------------------------------------------------ */

    /* Android istemci kimliğinin yönlendirme şeması:
       com.googleusercontent.apps.<istemci-kimliği-öneki> */
    private String googleRedirectScheme() {
        if (googleClientId.length() == 0) return "";
        int cut = googleClientId.indexOf(".apps.googleusercontent.com");
        String prefix = cut > 0 ? googleClientId.substring(0, cut) : googleClientId;
        return "com.googleusercontent.apps." + prefix;
    }

    private String googleRedirectUri() {
        return googleRedirectScheme() + ":" + REDIRECT_PATH;
    }

    private static String base64Url(byte[] bytes) {
        return Base64.encodeToString(bytes, Base64.URL_SAFE | Base64.NO_PADDING | Base64.NO_WRAP);
    }

    private void startGoogleSignIn() {
        if (googleClientId.length() == 0) {
            pushGoogleError("Google girişi bu sürümde tanımlı değil.");
            return;
        }
        try {
            byte[] random = new byte[32];
            new SecureRandom().nextBytes(random);
            pendingVerifier = base64Url(random);
            String challenge = base64Url(
                    MessageDigest.getInstance("SHA-256").digest(pendingVerifier.getBytes("UTF-8")));

            Uri url = Uri.parse(GOOGLE_AUTH_URL).buildUpon()
                    .appendQueryParameter("client_id", googleClientId)
                    .appendQueryParameter("redirect_uri", googleRedirectUri())
                    .appendQueryParameter("response_type", "code")
                    .appendQueryParameter("scope", "openid email profile")
                    .appendQueryParameter("code_challenge", challenge)
                    .appendQueryParameter("code_challenge_method", "S256")
                    .appendQueryParameter("prompt", "select_account")
                    .build();

            Intent intent = new Intent(Intent.ACTION_VIEW, url);
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(intent);
        } catch (Exception error) {
            pendingVerifier = null;
            pushGoogleError("Google girişi başlatılamadı.");
        }
    }

    private void handleGoogleRedirect(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        if (!REDIRECT_PATH.equals(data.getPath())) return;
        String scheme = googleRedirectScheme();
        if (scheme.length() == 0 || !scheme.equalsIgnoreCase(data.getScheme())) return;

        String error = data.getQueryParameter("error");
        if (error != null) {
            pendingVerifier = null;
            pushGoogleError("Google girişi iptal edildi.");
            return;
        }
        String code = data.getQueryParameter("code");
        if (code != null && code.length() > 0) {
            exchangeGoogleCode(code);
        }
    }

    private void exchangeGoogleCode(final String code) {
        final String verifier = pendingVerifier;
        if (verifier == null) {
            pushGoogleError("Google oturumu sona erdi, tekrar dene.");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                HttpURLConnection connection = null;
                try {
                    String body = "code=" + URLEncoder.encode(code, "UTF-8")
                            + "&client_id=" + URLEncoder.encode(googleClientId, "UTF-8")
                            + "&redirect_uri=" + URLEncoder.encode(googleRedirectUri(), "UTF-8")
                            + "&grant_type=authorization_code"
                            + "&code_verifier=" + URLEncoder.encode(verifier, "UTF-8");

                    connection = (HttpURLConnection) new URL(GOOGLE_TOKEN_URL).openConnection();
                    connection.setRequestMethod("POST");
                    connection.setDoOutput(true);
                    connection.setConnectTimeout(15000);
                    connection.setReadTimeout(20000);
                    connection.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
                    OutputStream out = connection.getOutputStream();
                    out.write(body.getBytes("UTF-8"));
                    out.close();

                    int status = connection.getResponseCode();
                    InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
                    String text = readStream(stream);
                    if (status != 200) {
                        pushGoogleError("Google oturumu alınamadı (" + status + ").");
                        return;
                    }
                    JSONObject json = new JSONObject(text);
                    String idToken = json.optString("id_token", "");
                    if (idToken.length() == 0) {
                        pushGoogleError("Google kimliği alınamadı.");
                        return;
                    }
                    pendingVerifier = null;
                    JSONObject result = new JSONObject();
                    result.put("credential", idToken);
                    pushGoogleResult(result.toString());
                } catch (Exception error) {
                    pushGoogleError("Google ile bağlantı kurulamadı.");
                } finally {
                    if (connection != null) connection.disconnect();
                }
            }
        }).start();
    }

    private static String readStream(InputStream stream) throws Exception {
        if (stream == null) return "";
        BufferedReader reader = new BufferedReader(new InputStreamReader(stream, "UTF-8"));
        StringBuilder text = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) text.append(line);
        reader.close();
        return text.toString();
    }

    private void pushGoogleResult(String json) {
        pushGoogleJs("window.BlokGoogleResult&&window.BlokGoogleResult(" + JSONObject.quote(json) + ")");
    }

    private void pushGoogleError(final String message) {
        try {
            JSONObject result = new JSONObject();
            result.put("error", message);
            pushGoogleResult(result.toString());
        } catch (Exception ignored) {
            /* yoksay */
        }
    }

    private void pushGoogleJs(final String js) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (web == null) return;
                if (!webReady) {
                    pendingGoogleJs = js;
                    return;
                }
                try {
                    web.evaluateJavascript("try{" + js + "}catch(e){}", null);
                } catch (Exception ignored) {
                    /* yoksay */
                }
            }
        });
    }

    private void flushPendingGoogle() {
        if (pendingGoogleJs == null || web == null) return;
        String js = pendingGoogleJs;
        pendingGoogleJs = null;
        try {
            web.evaluateJavascript("try{" + js + "}catch(e){}", null);
        } catch (Exception ignored) {
            /* yoksay */
        }
    }

    public class GoogleBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return googleClientId.length() > 0;
        }

        @JavascriptInterface
        public void signIn() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    startGoogleSignIn();
                }
            });
        }

        @JavascriptInterface
        public void signOut() {
            /* Jeton saklanmıyor; tarayıcı oturumu Google tarafında kalır. */
        }
    }

    /* Cihazın (veya Android 13+ uygulama dili ayarının) BCP-47 etiketini
       JavaScript'e verir. public/i18n.js bunu ilk sırada dener. */
    public class I18nBridge {
        @JavascriptInterface
        public String locale() {
            try {
                android.content.res.Configuration config = getResources().getConfiguration();
                java.util.Locale locale;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                    locale = config.getLocales().get(0);
                } else {
                    locale = config.locale;
                }
                if (locale == null) return "";
                String tag = locale.toLanguageTag();
                if (tag == null || tag.isEmpty() || "und".equals(tag)) {
                    return locale.toString().replace('_', '-');
                }
                return tag;
            } catch (Exception ignored) {
                return "";
            }
        }
    }

    public class Bridge {
        @JavascriptInterface
        public String serverUrl() {
            return serverUrl;
        }

        /* Android 15+ kenardan kenara çizdiği için sistem çubuğu yüksekliğini
           CSS'e bildiririz; alt butonlar jest çubuğunun altında kalmasın. */
        @JavascriptInterface
        public int bottomInset() {
            return insetBottom;
        }

        @JavascriptInterface
        public int topInset() {
            return insetTop;
        }

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        /* Oyunda ekranın kararmasını engeller. */
        @JavascriptInterface
        public void keepAwake(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web != null) web.setKeepScreenOn(on);
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int milliseconds) {
            try {
                Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (vibrator == null || !vibrator.hasVibrator()) return;
                int ms = Math.max(1, Math.min(80, milliseconds));
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(ms);
                }
            } catch (Exception ignored) {
                /* yoksay */
            }
        }
    }

    /* Geri tuşu önce uygulama içinde çalışır (menü/açık kart/kapı). BlokBack
       true dönerse uygulama kapanmaz; false dönerse ana ekrandayız demektir. */
    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return window.BlokBack?window.BlokBack():false}catch(e){return false}})()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        /* evaluateJavascript sonucu JSON olarak gelir: true / "true" / 1 */
                        boolean handled = value != null &&
                                (value.equals("true") || value.equals("\"true\"") || value.equals("1"));
                        if (!handled) finish();
                    }
                });
    }

    /* JS'e uygulama öne/arkaya geçtiğini bildirir; yerel oyun sayacı duraklar. */
    @Override
    protected void onPause() {
        super.onPause();
        evalJs("window.BlokLifecycle&&window.BlokLifecycle('pause')");
    }

    @Override
    protected void onResume() {
        super.onResume();
        evalJs("window.BlokLifecycle&&window.BlokLifecycle('resume')");
    }

    private void evalJs(String js) {
        if (web == null) return;
        try {
            web.evaluateJavascript("try{" + js + "}catch(e){}", null);
        } catch (Exception ignored) {
            /* yoksay */
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (web != null) web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (ads != null) ads.destroy();
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
