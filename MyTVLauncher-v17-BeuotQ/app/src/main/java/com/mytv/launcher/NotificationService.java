package com.mytv.launcher;

import android.app.Notification;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;

public class NotificationService extends NotificationListenerService {

    private static String cachedJson = "[]";

    public static String getCachedNotificationsJson() {
        return cachedJson;
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        updateCache();
    }

    @Override
    public void onNotificationRemoved(StatusBarNotification sbn) {
        updateCache();
    }

    @Override
    public void onListenerConnected() {
        updateCache();
    }

    private void updateCache() {
        try {
            StatusBarNotification[] sbns = getActiveNotifications();
            if (sbns == null) { cachedJson = "[]"; return; }

            JSONArray arr = new JSONArray();
            PackageManager pm = getPackageManager();

            for (StatusBarNotification sbn : sbns) {
                try {
                    Notification n = sbn.getNotification();
                    if (n == null) continue;

                    // تجاهل الإشعارات الصامتة والمجمّعة
                    if ((n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) continue;

                    JSONObject obj = new JSONObject();
                    obj.put("pkg", sbn.getPackageName());
                    obj.put("id", sbn.getId());
                    obj.put("key", sbn.getKey());
                    obj.put("time", sbn.getPostTime());

                    // اسم التطبيق
                    try {
                        ApplicationInfo ai = pm.getApplicationInfo(sbn.getPackageName(), 0);
                        obj.put("appName", pm.getApplicationLabel(ai).toString());
                    } catch (Exception e) {
                        obj.put("appName", sbn.getPackageName());
                    }

                    // العنوان والنص
                    android.os.Bundle extras = n.extras;
                    if (extras != null) {
                        CharSequence title = extras.getCharSequence(Notification.EXTRA_TITLE);
                        CharSequence text  = extras.getCharSequence(Notification.EXTRA_TEXT);
                        obj.put("title", title != null ? title.toString() : "");
                        obj.put("text",  text  != null ? text.toString()  : "");
                    }

                    arr.put(obj);
                    if (arr.length() >= 20) break; // حد أقصى 20 إشعار
                } catch (Exception e) {
                    ErrorLogger.error("NotificationService.item", "Could not process a notification", e);
                }
            }

            cachedJson = arr.toString();
        } catch (Exception e) {
            ErrorLogger.error("NotificationService.updateCache", "Could not refresh notification cache", e);
            cachedJson = "[]";
        }
    }
}
