package id.rawajati.prima;

import com.google.androidbrowserhelper.trusted.LauncherActivity;
import com.google.androidbrowserhelper.trusted.NotificationUtils;

/**
 * Creates the notification channel, then hands over to the TWA immediately.
 *
 * POST_NOTIFICATIONS is deliberately NOT requested here: blocking startup on a
 * permission dialog is what makes Play review report "app doesn't open". The
 * prompt is raised in context instead, when the web app calls
 * Notification.requestPermission() and Chrome delegates to DelegationService.
 */
public class PrimaLauncherActivity extends LauncherActivity {
    @Override
    protected boolean shouldLaunchImmediately() {
        NotificationUtils.createNotificationChannel(
                this,
                getString(R.string.notification_channel_name)
        );
        return true;
    }
}
