package id.rawajati.prima;

import android.Manifest;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.androidbrowserhelper.trusted.LauncherActivity;

/**
 * Requests POST_NOTIFICATIONS natively before handing over to the TWA.
 *
 * The web layer cannot do this. Chrome refuses to re-prompt once a permission
 * reads as denied, and on Android 13+ a freshly installed app starts in exactly
 * that state, so Notification.requestPermission() resolves to denied without
 * ever showing a dialog. Asking natively is the only path that reaches the user.
 *
 * Startup is never allowed to hang on the dialog: the prompt is shown at most
 * once per install, and a watchdog launches the TWA anyway if the result never
 * arrives.
 */
public class PrimaLauncherActivity extends LauncherActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1201;
    private static final String PREFERENCES = "prima_native_permissions";
    private static final String HAS_ASKED_NOTIFICATIONS = "has_asked_notifications";
    private static final long LAUNCH_WATCHDOG_MS = 8000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable watchdog = new Runnable() {
        @Override
        public void run() {
            launchWhenReady();
        }
    };
    private boolean awaitingPermission = false;

    @Override
    protected boolean shouldLaunchImmediately() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            return true;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                == PackageManager.PERMISSION_GRANTED) {
            return true;
        }

        // Ask once per install only. A user who declined is never nagged again,
        // and a repeat launch can never be blocked by this path.
        SharedPreferences preferences = getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
        if (preferences.getBoolean(HAS_ASKED_NOTIFICATIONS, false)) {
            return true;
        }
        preferences.edit().putBoolean(HAS_ASKED_NOTIFICATIONS, true).apply();

        awaitingPermission = true;
        handler.postDelayed(watchdog, LAUNCH_WATCHDOG_MS);
        ActivityCompat.requestPermissions(
                this,
                new String[]{Manifest.permission.POST_NOTIFICATIONS},
                NOTIFICATION_PERMISSION_REQUEST
        );
        return false;
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            String[] permissions,
            int[] grantResults
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            launchWhenReady();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(watchdog);
        super.onDestroy();
    }

    private void launchWhenReady() {
        if (!awaitingPermission || isFinishing()) {
            return;
        }
        awaitingPermission = false;
        handler.removeCallbacks(watchdog);
        launchTwa();
    }
}
