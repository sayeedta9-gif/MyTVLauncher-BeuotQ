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

    // A 1080p RGB_565 wallpaper costs roughly 4 MB instead of 8 MB in ARGB_8888.
    // This is sufficient for a background image on a low-memory Android 7 receiver.
    private static final int MAX_WALLPAPER_WIDTH = 1920;
    private static final int MAX_WALLPAPER_HEIGHT = 1080;

    private static final ExecutorService executor = Executors.newSingleThreadExecutor();
    private static volatile Drawable cachedDrawable = null;
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
        if (isLoaded && cachedDrawable != null) return;

        try {
            File file = new File(context.getFilesDir(), WALLPAPER_FILE_NAME);
            if (file.exists() && file.length() > 0) {
                Bitmap bitmap = decodeSampledFile(file.getAbsolutePath());
                if (bitmap != null) {
                    cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
                    isLoaded = true;
                    return;
                }
            }

            // Migrate a wallpaper saved by older launcher builds to the compact
            // disk cache, then drop its large Base64 preference value.
            SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
            String dataUrl = prefs.getString(PREF_WALLPAPER_KEY, "");
            if (dataUrl != null && !dataUrl.isEmpty()) {
                Bitmap bitmap = decodeDataUrl(dataUrl);
                if (bitmap != null) {
                    cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
                    saveBitmapToDisk(context, bitmap);
                    prefs.edit().remove(PREF_WALLPAPER_KEY).apply();
                    isLoaded = true;
                    return;
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Error loading wallpaper: " + e.getMessage());
        }

        loadDefaultFallback(context);
    }

    private static boolean hasCustomWallpaper(Context context) {
        File file = new File(context.getFilesDir(), WALLPAPER_FILE_NAME);
        if (file.exists() && file.length() > 0) return true;
        SharedPreferences prefs = context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE);
        String dataUrl = prefs.getString(PREF_WALLPAPER_KEY, "");
        return dataUrl != null && !dataUrl.isEmpty();
    }

    private static void loadDefaultFallback(Context context) {
        Bitmap bitmap = decodeDefaultWallpaper(context);
        if (bitmap != null) cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
        isLoaded = true;
    }

    public static Drawable getDefaultFallbackDrawable(Context context) {
        if (cachedDrawable != null) return cachedDrawable;

        Bitmap bitmap = decodeDefaultWallpaper(context);
        if (bitmap == null) return null;
        Drawable drawable = new BitmapDrawable(context.getResources(), bitmap);

        // If there is no custom wallpaper, this is the final background. Cache it
        // so MainActivity does not decode the same full-screen bitmap a second time.
        if (!hasCustomWallpaper(context)) {
            cachedDrawable = drawable;
            isLoaded = true;
        }
        return drawable;
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
                if (callback != null && cachedDrawable != null) callback.onWallpaperLoaded(cachedDrawable);
            }
        });
    }

    public static void saveWallpaper(final Context context, final String dataUrl) {
        // Store only the sampled JPEG on disk. Retaining an original Base64 string
        // in static memory or SharedPreferences can consume several megabytes.
        context.getSharedPreferences(PREF_NAME, Context.MODE_PRIVATE)
            .edit().remove(PREF_WALLPAPER_KEY).apply();

        executor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Bitmap bitmap = decodeDataUrl(dataUrl);
                    if (bitmap != null) {
                        Drawable previous = cachedDrawable;
                        cachedDrawable = new BitmapDrawable(context.getResources(), bitmap);
                        isLoaded = true;
                        saveBitmapToDisk(context, bitmap);
                        // The previous drawable becomes eligible for collection after
                        // the Window replaces its background on the UI thread.
                        previous = null;
                    }
                } catch (Exception e) {
                    Log.e(TAG, "Error saving wallpaper: " + e.getMessage());
                }
            }
        });
    }

    public static String getSavedWallpaper(Context context) {
        // Kept for bridge compatibility. New builds deliberately do not keep the
        // wallpaper's Base64 data in process memory.
        return "";
    }

    private static Bitmap decodeDefaultWallpaper(Context context) {
        InputStream stream = null;
        try {
            stream = context.getAssets().open("bg_default.jpg");
            BitmapFactory.Options options = new BitmapFactory.Options();
            options.inPreferredConfig = Bitmap.Config.RGB_565;
            return BitmapFactory.decodeStream(stream, null, options);
        } catch (Exception e) {
            Log.e(TAG, "Error loading default fallback wallpaper: " + e.getMessage());
            return null;
        } finally {
            try { if (stream != null) stream.close(); } catch (Exception e) {}
        }
    }

    private static Bitmap decodeSampledFile(String path) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(path, bounds);
        return BitmapFactory.decodeFile(path, sampledOptions(bounds));
    }

    private static Bitmap decodeDataUrl(String dataUrl) {
        try {
            int comma = dataUrl.indexOf(',');
            String base64 = comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl;
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, sampledOptions(bounds));
            return bitmap;
        } catch (Exception e) {
            Log.e(TAG, "Error decoding wallpaper: " + e.getMessage());
            return null;
        }
    }

    private static BitmapFactory.Options sampledOptions(BitmapFactory.Options bounds) {
        int sampleSize = 1;
        while (bounds.outWidth / sampleSize > MAX_WALLPAPER_WIDTH ||
               bounds.outHeight / sampleSize > MAX_WALLPAPER_HEIGHT) {
            sampleSize *= 2;
        }
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sampleSize;
        options.inPreferredConfig = Bitmap.Config.RGB_565;
        return options;
    }

    private static void saveBitmapToDisk(Context context, Bitmap bitmap) {
        try {
            File file = new File(context.getFilesDir(), WALLPAPER_FILE_NAME);
            FileOutputStream output = new FileOutputStream(file);
            bitmap.compress(Bitmap.CompressFormat.JPEG, 85, output);
            output.flush();
            output.close();
        } catch (Exception e) {
            Log.e(TAG, "Error saving wallpaper: " + e.getMessage());
        }
    }
}
