package tr.blokiki.app;

import android.app.Activity;
import android.content.Intent;
import android.util.Log;

import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;import com.google.android.gms.common.ConnectionResult;
import com.google.android.gms.common.GoogleApiAvailability;
import com.google.android.gms.games.PlayGames;
import com.google.android.gms.games.PlayGamesSdk;
import com.google.android.gms.games.Player;

import org.json.JSONObject;

/**
 * Google Play Games Services v2 oturumu.
 *
 * Uygulama kimliği tanımlı değilse (gradle: blokiki.gamesAppId) veya cihazda
 * Google Play Hizmetleri yoksa tamamen devre dışı kalır; arayüz mevcut
 * Google OAuth girişine düşer.
 */
final class PlayGamesManager {

    interface Listener {
        void onPlayer(String json);
        void onError(String message);
    }

    static final int REQUEST_SIGN_IN = 9001;
    private static final String TAG = "BlokPlayGames";

    private final Activity activity;
    private final String appId;
    private final Listener listener;

    private GoogleSignInAccount account;
    private String playerJson = "";

    PlayGamesManager(Activity activity, String appId, Listener listener) {
        this.activity = activity;
        this.appId = appId == null ? "" : appId.trim();
        this.listener = listener;
    }

    private boolean configured() {
        return !appId.isEmpty() && !"0".equals(appId);
    }

    boolean isAvailable() {
        if (!configured()) return false;
        try {
            int status = GoogleApiAvailability.getInstance()
                    .isGooglePlayServicesAvailable(activity);
            return status == ConnectionResult.SUCCESS;
        } catch (Exception error) {
            return false;
        }
    }

    /** SDK'yı yalnızca kimlik tanımlıysa başlatır. */
    void initialize() {
        if (!isAvailable()) return;
        try {
            PlayGamesSdk.initialize(activity);
        } catch (Exception error) {
            Log.w(TAG, "Play Games başlatılamadı: " + error.getMessage());
        }
    }

    private GoogleSignInClient client() {
        return GoogleSignIn.getClient(activity, GoogleSignInOptions.DEFAULT_GAMES_SIGN_IN);
    }

    /** Sessiz oturum: kullanıcıya pencere göstermez. */
    void silentSignIn() {
        if (!isAvailable()) return;
        client().silentSignIn().addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                account = task.getResult();
                fetchPlayer();
            } else {
                Log.i(TAG, "Sessiz oturum yok; kullanıcı düğmeyle giriş yapabilir.");
            }
        });
    }

    /** Etkileşimli oturum: Play Games penceresini açar. */
    void signIn() {
        if (!isAvailable()) {
            listener.onError("Play Games bu cihazda kullanılamıyor.");
            return;
        }
        activity.startActivityForResult(client().getSignInIntent(), REQUEST_SIGN_IN);
    }

    void handleActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_SIGN_IN) return;
        try {
            com.google.android.gms.tasks.Task<GoogleSignInAccount> task =
                    GoogleSignIn.getSignedInAccountFromIntent(data);
            GoogleSignInAccount signed = task.getResult(com.google.android.gms.common.api.ApiException.class);
            if (signed == null) {
                listener.onError("Play Games girişi tamamlanmadı.");
                return;
            }
            account = signed;
            fetchPlayer();
        } catch (Exception error) {
            Log.w(TAG, "Play Games girişi başarısız: " + error.getMessage());
            listener.onError("Play Games girişi tamamlanmadı.");
        }
    }

    void signOut() {
        if (!isAvailable()) return;
        account = null;
        playerJson = "";
        client().signOut();
    }

    String playerJson() {
        return playerJson;
    }

    private void fetchPlayer() {
        PlayGames.getPlayersClient(activity).getCurrentPlayer()
                .addOnSuccessListener(player -> {
                    playerJson = toJson(player);
                    listener.onPlayer(playerJson);
                })
                .addOnFailureListener(error -> {
                    Log.w(TAG, "Oyuncu bilgisi alınamadı: " + error.getMessage());
                    listener.onError("Oyuncu bilgisi alınamadı.");
                });
    }

    private String toJson(Player player) {
        try {
            JSONObject json = new JSONObject();
            json.put("id", player.getPlayerId());
            json.put("name", player.getDisplayName());
            String icon = player.getIconImageUrl();
            json.put("icon", icon == null ? "" : icon);
            return json.toString();
        } catch (Exception error) {
            return "";
        }
    }
}
