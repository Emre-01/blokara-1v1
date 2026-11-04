package tr.blokiki.app;

import android.app.Activity;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

/**
 * AdMob yönetimi: rıza (UMP) akışı, geçiş reklamı, ödüllü reklam ve
 * oyun sırasında alt banner.
 *
 * Geçiş reklamı her oyun sonunda, banner yalnızca oyun ekranındayken
 * gösterilir. "Reklamları kaldır" satın alındıysa JS tarafı banner'ı
 * gizler. Rıza formu AB/İngiltere kullanıcılarına Google tarafından
 * otomatik gösterilir.
 */
final class AdsManager {

    interface Listener {
        /** JS tarafına iletilen olay: "interstitial-closed", "rewarded:...", "banner:56", ... */
        void onEvent(String event);
    }

    private static final String TAG = "BlokAds";

    private final Activity activity;
    private final ViewGroup bannerHost;
    private final String interstitialId;
    private final String rewardedId;
    private final String bannerId;
    private final Listener listener;

    private InterstitialAd interstitial;
    private RewardedAd rewarded;
    private AdView bannerView;
    private boolean bannerLoaded;
    private boolean bannerWanted;
    private int bottomInsetPx;
    private boolean sdkReady;
    private boolean loadingInterstitial;
    private boolean loadingRewarded;
    private boolean loadingBanner;

    AdsManager(Activity activity, ViewGroup bannerHost, String interstitialId,
               String rewardedId, String bannerId, Listener listener) {
        this.activity = activity;
        this.bannerHost = bannerHost;
        this.interstitialId = interstitialId == null ? "" : interstitialId.trim();
        this.rewardedId = rewardedId == null ? "" : rewardedId.trim();
        this.bannerId = bannerId == null ? "" : bannerId.trim();
        this.listener = listener;
    }

    /** Rıza bilgisini tazeler, gerekiyorsa formu gösterir, sonra SDK'yı başlatır. */
    void start() {
        if (interstitialId.isEmpty() && rewardedId.isEmpty() && bannerId.isEmpty()) return;

        final ConsentInformation consent = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder()
                .setTagForUnderAgeOfConsent(false)
                .build();

        consent.requestConsentInfoUpdate(
                activity,
                params,
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> {
                    if (formError != null) {
                        Log.w(TAG, "Rıza formu gösterilemedi: " + formError.getMessage());
                    }
                    if (consent.canRequestAds()) startSdk();
                }),
                requestError -> {
                    Log.w(TAG, "Rıza bilgisi alınamadı: " + requestError.getMessage());
                    if (consent.canRequestAds()) startSdk();
                });

        /* Önbellekte geçerli bir rıza varsa form beklemeden başla. */
        if (consent.canRequestAds()) startSdk();
    }

    private void startSdk() {
        if (sdkReady) return;
        sdkReady = true;
        activity.runOnUiThread(() -> MobileAds.initialize(activity, status -> {
            Log.i(TAG, "AdMob hazır");
            loadInterstitial();
            loadRewarded();
            loadBanner();
        }));
    }

    boolean hasInterstitial() {
        return interstitial != null;
    }

    boolean hasRewarded() {
        return rewarded != null;
    }

    boolean hasBanner() {
        return bannerLoaded;
    }

    /** Reklam hazır değilse false döner; hazırlık arka planda sürer. */
    boolean showInterstitial() {
        if (interstitial == null) {
            loadInterstitial();
            return false;
        }
        interstitial.show(activity);
        return true;
    }

    boolean showRewarded() {
        if (rewarded == null) {
            loadRewarded();
            return false;
        }
        rewarded.show(activity, item ->
                listener.onEvent("rewarded:" + item.getType() + ":" + item.getAmount()));
        return true;
    }

    /** Banner yalnızca oyun ekranındayken görünür; yüklenince kendiliğinden açılır. */
    void showBanner() {
        bannerWanted = true;
        if (bannerView == null) {
            loadBanner();
            return;
        }
        if (bannerLoaded) revealBanner();
    }

    void hideBanner() {
        bannerWanted = false;
        if (bannerView != null) {
            bannerView.setVisibility(View.GONE);
            listener.onEvent("banner-hidden");
        }
    }

    /** Sistem gezinme çubuğu yüksekliği (px); banner onun üstünde dursun. */
    void setBottomInset(int px) {
        bottomInsetPx = Math.max(0, px);
        if (bannerView != null) applyBannerLayout(bannerView);
    }

    void destroy() {
        bannerWanted = false;
        if (bannerView != null) {
            if (bannerHost != null) bannerHost.removeView(bannerView);
            bannerView.destroy();
            bannerView = null;
            bannerLoaded = false;
        }
    }

    private void revealBanner() {
        if (bannerView == null || !bannerLoaded || !bannerWanted) return;
        bannerView.setVisibility(View.VISIBLE);
        AdSize size = bannerView.getAdSize();
        int height = size == null ? 50 : Math.max(0, size.getHeight());
        listener.onEvent("banner:" + height);
    }

    private void applyBannerLayout(AdView view) {
        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        params.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        params.bottomMargin = bottomInsetPx;
        view.setLayoutParams(params);
    }

    private void loadBanner() {
        if (!sdkReady || loadingBanner || bannerView != null || bannerId.isEmpty() || bannerHost == null) return;
        loadingBanner = true;
        activity.runOnUiThread(() -> {
            AdView view = new AdView(activity);
            view.setAdUnitId(bannerId);

            float density = activity.getResources().getDisplayMetrics().density;
            int widthDp = Math.max(1,
                    Math.round(activity.getResources().getDisplayMetrics().widthPixels / density));
            AdSize size = AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, widthDp);
            if (size == null) size = AdSize.BANNER;
            view.setAdSize(size);
            view.setVisibility(View.GONE);
            bannerView = view;
            applyBannerLayout(view);

            view.setAdListener(new AdListener() {
                @Override
                public void onAdLoaded() {
                    loadingBanner = false;
                    bannerLoaded = true;
                    listener.onEvent("banner-loaded");
                    if (bannerWanted) revealBanner();
                }

                @Override
                public void onAdFailedToLoad(LoadAdError error) {
                    loadingBanner = false;
                    bannerLoaded = false;
                    Log.w(TAG, "Banner yüklenemedi: " + error.getMessage());
                }
            });

            bannerHost.addView(view);
            view.loadAd(new AdRequest.Builder().build());
        });
    }

    private void loadInterstitial() {
        if (!sdkReady || loadingInterstitial || interstitial != null || interstitialId.isEmpty()) return;
        loadingInterstitial = true;
        InterstitialAd.load(activity, interstitialId, new AdRequest.Builder().build(),
                new InterstitialAdLoadCallback() {
                    @Override
                    public void onAdLoaded(InterstitialAd ad) {
                        loadingInterstitial = false;
                        interstitial = ad;
                        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                interstitial = null;
                                listener.onEvent("interstitial-closed");
                                loadInterstitial();
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(AdError error) {
                                interstitial = null;
                                listener.onEvent("interstitial-failed");
                                loadInterstitial();
                            }
                        });
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        loadingInterstitial = false;
                        Log.w(TAG, "Geçiş reklamı yüklenemedi: " + error.getMessage());
                        listener.onEvent("interstitial-unavailable");
                    }
                });
    }

    private void loadRewarded() {
        if (!sdkReady || loadingRewarded || rewarded != null || rewardedId.isEmpty()) return;
        loadingRewarded = true;
        RewardedAd.load(activity, rewardedId, new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override
                    public void onAdLoaded(RewardedAd ad) {
                        loadingRewarded = false;
                        rewarded = ad;
                        ad.setFullScreenContentCallback(new FullScreenContentCallback() {
                            @Override
                            public void onAdDismissedFullScreenContent() {
                                rewarded = null;
                                listener.onEvent("rewarded-closed");
                                loadRewarded();
                            }

                            @Override
                            public void onAdFailedToShowFullScreenContent(AdError error) {
                                rewarded = null;
                                listener.onEvent("rewarded-failed");
                                loadRewarded();
                            }
                        });
                    }

                    @Override
                    public void onAdFailedToLoad(LoadAdError error) {
                        loadingRewarded = false;
                        Log.w(TAG, "Ödüllü reklam yüklenemedi: " + error.getMessage());
                    }
                });
    }
}
