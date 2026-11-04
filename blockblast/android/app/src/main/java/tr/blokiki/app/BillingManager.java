package tr.blokiki.app;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import com.android.billingclient.api.AcknowledgePurchaseParams;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;

import java.util.Collections;
import java.util.List;

/**
 * "Reklamları kaldır" tek seferlik satın alması (Google Play Billing).
 *
 * Ürün kimliği gradle tarafından verilir (blokiki.removeAdsProduct).
 * Sahiplik cihazda SharedPreferences'ta tutulur; uygulama açılışında Play'den
 * doğrulanır. Satın alma onaylanır (acknowledge) ve bir daha tüketilmez.
 */
final class BillingManager implements PurchasesUpdatedListener {

    interface Listener {
        /** JS tarafına iletilen olay: "owned", "error:<mesaj>" */
        void onEvent(String event);
    }

    private static final String TAG = "BlokBilling";
    private static final String PREFS = "blokara_billing";
    private static final String KEY_OWNED = "remove_ads";

    private final Activity activity;
    private final String productId;
    private final Listener listener;

    private BillingClient client;
    private ProductDetails product;
    private boolean connected;
    private boolean querying;
    private boolean unavailable;

    BillingManager(Activity activity, String productId, Listener listener) {
        this.activity = activity;
        this.productId = productId == null ? "" : productId.trim();
        this.listener = listener;
    }

    private SharedPreferences prefs() {
        return activity.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    boolean isConfigured() {
        return productId.length() > 0;
    }

    /** Cihazda Play faturalandırma kullanılabilir mi? */
    boolean isAvailable() {
        return isConfigured() && !unavailable;
    }

    boolean isOwned() {
        return prefs().getBoolean(KEY_OWNED, false);
    }

    private void setOwned(boolean owned) {
        prefs().edit().putBoolean(KEY_OWNED, owned).apply();
        if (owned) listener.onEvent("owned");
    }

    void start() {
        if (!isConfigured()) return;
        client = BillingClient.newBuilder(activity)
                .setListener(this)
                .enablePendingPurchases()
                .build();
        connect();
    }

    private void connect() {
        if (client == null || connected) return;
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    Log.w(TAG, "Bağlantı kurulamadı: " + result.getResponseCode());
                    if (result.getResponseCode() == BillingClient.BillingResponseCode.BILLING_UNAVAILABLE) {
                        unavailable = true;
                        listener.onEvent("unavailable");
                    }
                    return;
                }
                connected = true;
                refreshOwned();
                loadProduct();
            }

            @Override
            public void onBillingServiceDisconnected() {
                connected = false;
            }
        });
    }

    /** Play'den geçerli satın almaları sorar; sahiplik varsa kaydeder. */
    void refreshOwned() {
        if (client == null || !connected) return;
        client.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                        .setProductType(BillingClient.ProductType.INAPP)
                        .build(),
                (result, purchases) -> {
                    if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) return;
                    boolean owned = false;
                    for (Purchase purchase : purchases) {
                        if (purchase.getProducts().contains(productId) &&
                                purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                            owned = true;
                            acknowledge(purchase);
                        }
                    }
                    if (owned) setOwned(true);
                });
    }

    private void loadProduct() {
        if (client == null || !connected || querying) return;
        querying = true;
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder()
                .setProductList(Collections.singletonList(
                        QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(productId)
                                .setProductType(BillingClient.ProductType.INAPP)
                                .build()))
                .build();
        client.queryProductDetailsAsync(params, (result, list) -> {
            querying = false;
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || list.isEmpty()) {
                Log.w(TAG, "Ürün bulunamadı: " + productId);
                return;
            }
            List<ProductDetails> details = list;
            if (!details.isEmpty()) product = details.get(0);
        });
    }

    /** Ödeme ekranını açar. */
    void purchase() {
        if (isOwned()) {
            listener.onEvent("owned");
            return;
        }
        if (unavailable) {
            listener.onEvent("unavailable");
            return;
        }
        if (client == null) {
            start();
            listener.onEvent("error:Ödeme servisi hazır değil, birazdan tekrar dene.");
            return;
        }
        if (product == null) {
            connect();
            loadProduct();
            listener.onEvent("error:Ürün bilgisi alınıyor, birkaç saniye sonra tekrar dene.");
            return;
        }
        BillingFlowParams flow = BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                                .setProductDetails(product)
                                .build()))
                .build();
        BillingResult result = client.launchBillingFlow(activity, flow);
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            listener.onEvent("error:Ödeme ekranı açılamadı (" + result.getResponseCode() + ").");
        }
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (Purchase purchase : purchases) {
                if (!purchase.getProducts().contains(productId)) continue;
                if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) {
                    acknowledge(purchase);
                    setOwned(true);
                }
            }
            return;
        }
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            listener.onEvent("canceled");
            return;
        }
        listener.onEvent("error:Satın alma tamamlanamadı (" + result.getResponseCode() + ").");
    }

    private void acknowledge(Purchase purchase) {
        if (client == null || purchase.isAcknowledged()) return;
        AcknowledgePurchaseParams params = AcknowledgePurchaseParams.newBuilder()
                .setPurchaseToken(purchase.getPurchaseToken())
                .build();
        client.acknowledgePurchase(params, result ->
                Log.i(TAG, "Satın alma onayı: " + result.getResponseCode()));
    }
}
