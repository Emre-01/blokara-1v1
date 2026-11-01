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
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {

    private static final String START_URL = "file:///android_asset/www/index.html";

    /* Varsayılan boş: çevrimdışı oyun her zaman çalışır. Uzaktan oyun için ya
       derlemede -ServerUrl verilir (assets/server.txt) ya da uygulama içindeki
       "Sunucu adresi" alanı doldurulur. */
    private static final String DEFAULT_SERVER = "";

    private WebView web;
    private String serverUrl = DEFAULT_SERVER;
    private int insetBottom = 0;
    private int insetTop = 0;

    /* assets/server.txt varsa oradaki adresi kullan; yoksa varsayılana dön. */
    private String readServerUrl() {
        try {
            java.io.InputStream in = getAssets().open("server.txt");
            java.io.BufferedReader reader = new java.io.BufferedReader(new java.io.InputStreamReader(in, "UTF-8"));
            StringBuilder text = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                if (text.length() > 0) text.append('\n');
                text.append(line);
            }
            reader.close();
            in.close();
            String value = text.toString().trim();
            if (value.length() > 0) return value;
        } catch (Exception ignored) {
            /* dosya yok: varsayılan kullanılır */
        }
        return DEFAULT_SERVER;
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
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) {
            settings.setAllowFileAccessFromFileURLs(true);
            settings.setAllowUniversalAccessFromFileURLs(true);
        }

        web.addJavascriptInterface(new Bridge(), "BlokIkiServer");

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
                pushInsets();
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

        setContentView(web);

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState);
        } else {
            web.loadUrl(START_URL);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) pushInsets();
    }

    /* Uygulama içi linkler WebView'da kalır, dış linkler tarayıcıda açılır. */
    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("file://") || url.startsWith("about:") || url.startsWith("javascript:")) {
            return false;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception ignored) {
            /* açacak uygulama yok */
        }
        return true;
    }

    /* Ölçülen güvenli alanları CSS değişkenlerine yazar. */
    private void pushInsets() {
        if (web == null) return;
        String js = "(function(){var r=document.documentElement;" +
                "r.style.setProperty('--safe-t','" + insetTop + "px');" +
                "r.style.setProperty('--safe-b','" + insetBottom + "px');" +
                "r.classList.add('native');})()";
        web.evaluateJavascript(js, null);
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
        if (web != null) {
            web.loadUrl("about:blank");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}
