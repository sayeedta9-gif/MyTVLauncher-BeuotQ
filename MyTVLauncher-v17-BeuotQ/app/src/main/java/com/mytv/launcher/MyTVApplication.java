package com.mytv.launcher;

import android.app.Application;

public class MyTVApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // Early wallpaper preloading upon application startup / boot
        WallpaperManager.preload(this);
    }
}
