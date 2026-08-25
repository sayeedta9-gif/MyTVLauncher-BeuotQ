package com.mytv.launcher;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class PackageReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_PACKAGE_ADDED.equals(action) ||
            Intent.ACTION_PACKAGE_REMOVED.equals(action) ||
            Intent.ACTION_PACKAGE_REPLACED.equals(action)) {
            // أرسل broadcast داخلي للـ MainActivity
            Intent update = new Intent("com.mytv.launcher.REFRESH_APPS");
            context.sendBroadcast(update);
        }
    }
}
