package com.mytv.launcher;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.util.Base64;
import android.util.Log;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class WallpaperManager {
    private static final String TAG = "WallpaperManager";
    private static final String PREF_NAME = "launcher_prefs";
    private static final String PREF_WALLPAPER_KEY = "wallpaper";
    private static final String WALLPAPER_FILE_NAME = "custom_wallpaper.jpg";

    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static volatile Drawable cachedDrawable = null;
    private static volatile String cachedDataUrl = null;
    private static volatile boolean isLoaded = false;

    public interface WallpaperCallback {
        void onWallpaperLoaded(Drawable drawable);
    }

    public static void preload(final Context context) {
        executor.execute(new Runnable() {
            @Override
            public void run() {
                loadWallpaperInternal(context);
            }
        });
    }

    private static synchronized void loadWallpaperInternal(Context context) {
        if (isLoaded && cachedDrawable != null) {
            return;
        }

        try {
            // First check disk file cache
            File file = new File(context.getFilesDir(), WALLPAPER_FILE_NAME);
            if (file.exists() && file.length() > 0) {
                Bitmap bitmap = BitmapFactory.decodeFile(file.getAbsolutePath());
                if (bitmap != null) {
                    cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
                    isLoaded = true;
                    Log.d(TAG, "Loaded wallpaper from disk file cache");
                    return;
                }
            }

            // Fallback: check SharedPreferences
            SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            String dataUrl = prefs.getString(PREF_WALLPAPER_KEY, "");
            if (dataUrl != null && !dataUrl.isEmpty()) {
                cachedDataUrl = dataUrl;
                Bitmap bitmap = decodeDataUrl(dataUrl);
                if (bitmap != null) {
                    cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
                    // Save to disk file for faster boot loading next time
                    saveBitmapToDisk(context, bitmap);
                    isLoaded = true;
                    Log.d(TAG, "Loaded wallpaper from SharedPreferences & cached to disk file");
                    return;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading wallpaper: " + e.getMessage());
        }

        // If no custom wallpaper, load default asset fallback
        loadDefaultFallback(context);
    }

    private static void loadDefaultFallback(Context context) {
        try {
            InputStream is = context.getAssets().open("bg_default.jpg");
            Bitmap bitmap = BitmapFactory.decodeStream(is);
            is.close();
            if (bitmap != null) {
                cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading default fallback wallpaper: " + e.getMessage());
        }
        isLoaded = true;
    }

    public static Drawable getDefaultFallbackDrawable(Context context) {
        if (cachedDrawable != null) {
            return cachedDrawable;
        }
        try {
            InputStream is = context.getAssets().open("bg_default.jpg");
            Bitmap bitmap = BitmapFactory.decodeStream(is);
            is.close();
            if (bitmap != null) {
                return new BitmapDrawable(context.getResources(), bitmap);
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading default fallback: " + e.getMessage());
        }
        return null;
    }

    public static void getWallpaperDrawableAsync(final Context context, final WallpaperCallback callback) {
        if (cachedDrawable != null) {
            callback.onWallpaperLoaded(cachedDrawable);
            return;
        }

        executor.execute(new Runnable() {
            @Override
            public void run() {
                loadWallpaperInternal(context);
                if (callback != null && cachedDrawable != null) {
                    callback.onWallpaperLoaded(cachedDrawable);
                }
            }
        });
    }

    public static void saveWallpaper(final Context context, final String dataUrl) {
        cachedDataUrl = dataUrl;
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        prefs.edit().putString(PREF_WALLPAPER_KEY, dataUrl).apply();

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Bitmap bitmap = decodeDataUrl(dataUrl);
                    if (bitmap != null) {
                        cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
                        saveBitmapToDisk(context, bitmap);
                        isLoaded = true;
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error saving wallpaper: " + e.getMessage());
                }
            }
        });
    }

    public static String getSavedWallpaper(Context context) {
        if (cachedDataUrl != null) {
            return cachedDataUrl;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        cachedDataUrl = prefs.getString(PREF_WALLPAPER_KEY, "");
        return cachedDataUrl;
    }

    private static Bitmap decodeDataUrl(String dataUrl) {
        try {
            String base64 = dataUrl;
            if (dataUrl.contains(",")) {
                base64 = dataUrl.split(",")[1];
            }
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        } catch (Exception e) {
            Log.e(TAG, "Error decoding base64 wallpaper: " + e.getMessage());
            return null;
        }
    }

    private static void saveBitmapToDisk(Context context, Bitmap bitmap) {
        try {
            File file = new File(context.getFilesDir(), WALLPAPER_FILE_NAME);
            FileOutputStream fos = new FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.JPEG, 90, fos);
            fos.flush();
            fos.close();
        } catch (Exception e) {
            Log.e(TAG, "Error saving bitmap to disk file: " + e.getMessage());
        }
    }
}
