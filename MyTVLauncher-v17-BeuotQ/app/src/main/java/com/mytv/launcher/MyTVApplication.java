package com.mytv.launcher;

import android.app.Application;

public class MyTVApplication extends Application {
    @Override
    public void onCreate() {
        super.onCreate();
        ErrorLogger.initialize(this);

        final Thread.UncaughtExceptionHandler systemHandler = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
            @Override
            public void uncaughtException(Thread thread, Throwable throwable) {
                ErrorLogger.fatal("UncaughtException:" + thread.getName(), throwable);
                if (systemHandler != null) systemHandler.uncaughtException(thread, throwable);
            }
        });
    }
}
