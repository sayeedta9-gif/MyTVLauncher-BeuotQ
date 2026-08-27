package com.mytv.launcher;

import android.app.Application;

public class MyTVApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        // MainActivity owns the first visible wallpaper load. Avoiding a second
        // preload decode lowers the RAM peak during launcher startup on S905X.
    }
}
