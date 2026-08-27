package com.mytv.launcher;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.content.SharedPreferences;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;

public class MainActivity extends Activity {

    // The home screen displays a small app rail. Limiting the bridge payload
    // avoids repeatedly encoding a large number of system-app icons on
    // low-memory Android 7 receivers while keeping a practical app list.
    private static final int MAX_LAUNCHER_APPS = 48;
    private static final int MAX_HOME_BANNERS = 8;
    private static final int APP_ICON_SIZE = 96;
    private static final int APP_BANNER_WIDTH = 240;
    private static final int APP_BANNER_HEIGHT = 135;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private static final int FILE_REQUEST = 1001;
    private static final int PERM_REQUEST = 1002;
private BroadcastReceiver refreshReceiver;
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            requestWindowFeature(Window.FEATURE_NO_TITLE);
            getWindow().setFlags(
                WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

            // طلب الأذونات
            if (Build.VERSION.SDK_INT >= 23) {
                List<String> neededPerms = new ArrayList<>();
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                    neededPerms.add(Manifest.permission.RECORD_AUDIO);
                }
                if (checkSelfPermission(Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    neededPerms.add(Manifest.permission.READ_EXTERNAL_STORAGE);
                }
                if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                    neededPerms.add(Manifest.permission.WRITE_EXTERNAL_STORAGE);
                }
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
                    neededPerms.add("android.permission.POST_NOTIFICATIONS");
                }

                if (!neededPerms.isEmpty()) {
                    requestPermissions(neededPerms.toArray(new String[0]), PERM_REQUEST);
                } else {
                    checkAndAskNotificationAccess();
                }
            } else {
                checkAndAskNotificationAccess();
            }

            // Immediately set fallback wallpaper background on Window so user sees wallpaper right away on boot
            Drawable fallback = WallpaperManager.getDefaultFallbackDrawable(this);
            if (fallback != null) {
                getWindow().setBackgroundDrawable(fallback);
            }

            // Asynchronously load and apply custom or preloaded wallpaper
            WallpaperManager.getWallpaperDrawableAsync(this, new WallpaperManager.WallpaperCallback() {
                @Override
                public void onWallpaperLoaded(final Drawable drawable) {
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (drawable != null) {
                                getWindow().setBackgroundDrawable(drawable);
                            }
                        }
                    });
                }
            });

            webView = new WebView(this);
            webView.setBackgroundColor(0x00000000); // Transparent so window background shows through instantly
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            setContentView(webView);

            WebSettings s = webView.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setAllowFileAccess(true);
            s.setAllowFileAccessFromFileURLs(true);
            s.setAllowUniversalAccessFromFileURLs(true);
            s.setBuiltInZoomControls(false);
            s.setDisplayZoomControls(false);
            s.setLoadWithOverviewMode(true);
            s.setUseWideViewPort(true);
            s.setCacheMode(WebSettings.LOAD_NO_CACHE);
            s.setMediaPlaybackRequiresUserGesture(false);

            webView.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);
            webView.setHorizontalScrollBarEnabled(false);
            webView.setVerticalScrollBarEnabled(false);
            webView.addJavascriptInterface(new Bridge(), "AndroidBridge");

            webView.setWebChromeClient(new WebChromeClient() {
                @Override
                public void onPermissionRequest(PermissionRequest request) {
                    request.grant(request.getResources());
                }
                // لفتح ملفات الصور للخلفية
                @Override
                public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb,
                        WebChromeClient.FileChooserParams params) {
                    fileCallback = cb;
                    Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                    intent.setType("image/*");
                    startActivityForResult(Intent.createChooser(intent, "اختر صورة"), FILE_REQUEST);
                    return true;
                }
            });

            webView.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String url) {
                    if (url != null && url.startsWith("file://")) return false;
                    try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Exception e) {}
                    return true;
                }
            });

            webView.loadUrl("file:///android_asset/launcher.html");

        } catch (Exception e) {
            Log.e("TV", "onCreate: " + e.getMessage());
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == PERM_REQUEST) {
            // بعد منح الصلاحيات العادية — اطلب صلاحية الإشعارات
            checkAndAskNotificationAccess();
        }
    }

    private boolean hasPromptedNotificationAccess = false;

    private boolean isNotificationListenerGranted() {
        try {
            String flat = android.provider.Settings.Secure.getString(
                getContentResolver(), "enabled_notification_listeners");
            return flat != null && flat.contains(getPackageName());
        } catch (Exception e) {
            return false;
        }
    }

    private void checkAndAskNotificationAccess() {
        if (isNotificationListenerGranted() || hasPromptedNotificationAccess) {
            return;
        }
        hasPromptedNotificationAccess = true;

        try {
            android.app.AlertDialog.Builder builder =
                new android.app.AlertDialog.Builder(this);
            builder.setTitle("صلاحية الوصول للإشعارات");
            builder.setMessage("لعرض إشعارات التطبيقات في اللانشر، يلزم منح إذن الوصول للإشعارات.");
            builder.setPositiveButton("منح الإذن", new android.content.DialogInterface.OnClickListener() {
                public void onClick(android.content.DialogInterface dialog, int which) {
                    try {
                        Intent i = new Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    } catch (Exception e) {}
                }
            });
            builder.setNegativeButton("تخطي", null);
            builder.setCancelable(true);
            final android.app.AlertDialog dialog = builder.create();
            new android.os.Handler().postDelayed(new Runnable() {
                public void run() {
                    try {
                        if (!isFinishing() && !isNotificationListenerGranted()) {
                            dialog.show();
                        }
                    } catch (Exception e) {}
                }
            }, 1000);
        } catch (Exception e) {}
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == FILE_REQUEST) {
            if (fileCallback == null) return;
            Uri[] results = null;
            if (res == RESULT_OK && data != null && data.getData() != null) {
                results = new Uri[]{data.getData()};
            }
            fileCallback.onReceiveValue(results);
            fileCallback = null;
        } else if (req == 9001) {
            // نتيجة البحث الصوتي
            webView.post(new Runnable() {
                public void run() {
                    webView.evaluateJavascript("document.getElementById('micBtn').classList.remove('listening')", null);
                }
            });
            if (res == RESULT_OK && data != null) {
                final java.util.ArrayList<String> matches =
                    data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
                if (matches != null && !matches.isEmpty()) {
                    final String query = matches.get(0);
                    webView.post(new Runnable() {
                        public void run() {
                            // فتح البحث على يوتيوب مباشرة
                            try {
                                Intent yt = new Intent(Intent.ACTION_VIEW,
                                    android.net.Uri.parse("https://www.youtube.com/results?search_query="
                                    + android.net.Uri.encode(query)));
                                yt.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                                startActivity(yt);
                            } catch (Exception e) {}
                        }
                    });
                }
            }
        }
    }

    private boolean isLongPressHandled = false;

    // ══ الريموت — كل الأزرار ══
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (webView == null) return super.dispatchKeyEvent(event);
        int action = event.getAction();
        int keyCode = event.getKeyCode();

        boolean isSelectKey = (keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                               keyCode == KeyEvent.KEYCODE_ENTER ||
                               keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
                               keyCode == KeyEvent.KEYCODE_BUTTON_A);

        if (isSelectKey) {
            if (action == KeyEvent.ACTION_DOWN) {
                if (event.isLongPress()) {
                    isLongPressHandled = true;
                    webView.post(new Runnable() {
                        public void run() {
                            webView.evaluateJavascript(
                                "(function(){if(typeof tvKey==='function'){tvKey('OK_LONG');}})()", null);
                        }
                    });
                    return true;
                }
                if (event.getRepeatCount() == 0) {
                    isLongPressHandled = false;
                    event.startTracking();
                }
                return true;
            } else if (action == KeyEvent.ACTION_UP) {
                if (isLongPressHandled) {
                    isLongPressHandled = false;
                    return true;
                }
                webView.post(new Runnable() {
                    public void run() {
                        webView.evaluateJavascript(
                            "(function(){if(typeof tvKey==='function'){tvKey('OK');}})()", null);
                    }
                });
                return true;
            }
        }

        if (action != KeyEvent.ACTION_DOWN) return super.dispatchKeyEvent(event);

        final String js;
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_UP:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_UP:    js="tvKey('UP')"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_DOWN:  js="tvKey('DOWN')"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_LEFT:  js="tvKey('LEFT')"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT:
            case KeyEvent.KEYCODE_SYSTEM_NAVIGATION_RIGHT: js="tvKey('RIGHT')"; break;
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_ESCAPE:                  js="tvKey('BACK')"; break;
            case KeyEvent.KEYCODE_MENU:                    js="openAllSettings()"; break;
            case KeyEvent.KEYCODE_SEARCH:                  js="openSrm()"; break;
            default: return super.dispatchKeyEvent(event);
        }

        webView.post(new Runnable() {
            public void run() {
                webView.evaluateJavascript(
                    "(function(){if(typeof tvKey==='function'){" + js + "}})()", null);
            }
        });
        return true;
    }

    @Override
    public boolean onKeyLongPress(int keyCode, KeyEvent event) {
        boolean isSelectKey = (keyCode == KeyEvent.KEYCODE_DPAD_CENTER ||
                               keyCode == KeyEvent.KEYCODE_ENTER ||
                               keyCode == KeyEvent.KEYCODE_NUMPAD_ENTER ||
                               keyCode == KeyEvent.KEYCODE_BUTTON_A);
        if (isSelectKey) {
            isLongPressHandled = true;
            if (webView != null) {
                webView.post(new Runnable() {
                    public void run() {
                        webView.evaluateJavascript(
                            "(function(){if(typeof tvKey==='function'){tvKey('OK_LONG');}})()", null);
                    }
                });
            }
            return true;
        }
        return super.onKeyLongPress(keyCode, event);
    }

    @Override public void onBackPressed() {}

    // ══ Bridge ══
    public class Bridge {

        @JavascriptInterface
        public String getInstalledApps() {
            try {
                PackageManager pm = getPackageManager();
                Intent intent = new Intent(Intent.ACTION_MAIN, null);
                intent.addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> apps = pm.queryIntentActivities(intent, 0);
                JSONArray arr = new JSONArray();
                int addedApps = 0;
                int loadedBanners = 0;
                for (ResolveInfo ri : apps) {
                    if (addedApps >= MAX_LAUNCHER_APPS) break;
                    try {
                        String pkg = ri.activityInfo.packageName;
                        if (pkg.equals("com.mytv.launcher")) continue;
                        String label = ri.loadLabel(pm).toString();
                        Drawable icon = ri.loadIcon(pm);
                        String iconB64 = "";
                        String bannerB64 = "";
                        try {
                            // محاولة تحميل بانر TV (landscape 320×180)
                            Drawable banner = null;
                            try {
                                android.content.pm.ApplicationInfo ai = pm.getApplicationInfo(pkg, 0);
                                if (ai.banner != 0) {
                                    banner = pm.getDrawable(pkg, ai.banner, ai);
                                }
                            } catch (Exception be) {}

                            if (banner != null && loadedBanners < MAX_HOME_BANNERS) {
                                // The launcher rail is small. A 240×135 banner remains
                                // sharp at TV distance while reducing decoded memory.
                                Bitmap bmpB = Bitmap.createBitmap(APP_BANNER_WIDTH, APP_BANNER_HEIGHT, Bitmap.Config.ARGB_8888);
                                Canvas cvB = new Canvas(bmpB);
                                banner.setBounds(0, 0, APP_BANNER_WIDTH, APP_BANNER_HEIGHT);
                                banner.draw(cvB);
                                ByteArrayOutputStream baosB = new ByteArrayOutputStream();
                                bmpB.compress(Bitmap.CompressFormat.PNG, 85, baosB);
                                bannerB64 = Base64.encodeToString(baosB.toByteArray(), Base64.NO_WRAP);
                                bmpB.recycle();
                                loadedBanners++;
                            }

                            // Smaller application icons also lower the JSON bridge payload.
                            Bitmap bmp = Bitmap.createBitmap(APP_ICON_SIZE, APP_ICON_SIZE, Bitmap.Config.ARGB_8888);
                            Canvas canvas = new Canvas(bmp);
                            icon.setBounds(0, 0, APP_ICON_SIZE, APP_ICON_SIZE);
                            icon.draw(canvas);
                            ByteArrayOutputStream baos = new ByteArrayOutputStream();
                            bmp.compress(Bitmap.CompressFormat.PNG, 90, baos);
                            iconB64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
                            bmp.recycle();
                        } catch (Exception e) {}
                        JSONObject obj = new JSONObject();
                        obj.put("pkg", pkg);
                        obj.put("name", label);
                        obj.put("icon", iconB64);
                        if (!bannerB64.isEmpty()) obj.put("banner", bannerB64);
                        arr.put(obj);
                        addedApps++;
                    } catch (Exception e) {}
                }
                return arr.toString();
            } catch (Exception e) { return "[]"; }
        }

        @JavascriptInterface
        public void openApp(String pkg) {
            try {
                if (pkg == null || pkg.isEmpty()) return;
                Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                if (i != null) { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(i); }
            } catch (Exception e) {}
        }

        @JavascriptInterface
        public void openSystemApp(String pkg) {
            // يفتح system apps عبر ACTION_APPLICATION_DETAILS_SETTINGS كـ fallback
            try {
                Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                if (i != null) {
                    i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                    startActivity(i);
                    return;
                }
            } catch(Exception e) {}
            // Fallback: فتح عبر component مباشر
            try {
                Intent i = new Intent();
                i.setClassName(pkg, pkg + ".MainActivity");
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return;
            } catch(Exception e) {}
// محاولة 3: component بـ Settings
    try {
        Intent i = new Intent();
        i.setClassName(pkg, pkg + ".Settings");
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
        return;
    } catch(Exception e) {}
    // لا تفتح أي شيء آخر
}

        @JavascriptInterface
        public void openSmartBoxSettings() {
            try {
                PackageManager pm = getPackageManager();
                Intent intent = pm.getLaunchIntentForPackage("com.droidlogic.mboxsettings");
                if (intent != null) {
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                } else {
                    openSystemSettings();
                }
            } catch (android.content.ActivityNotFoundException e) {
                Log.e("TV", "SmartBox settings ActivityNotFoundException: " + e.getMessage());
                openSystemSettings();
            } catch (Exception e) {
                Log.e("TV", "SmartBox settings exception: " + e.getMessage());
            }
        }

        @JavascriptInterface
        public void openSystemSettings() {
            try { startActivity(new Intent(android.provider.Settings.ACTION_SETTINGS)); } catch (Exception e) {}
        }

        @JavascriptInterface
        public void saveFilters(String data) {
            try {
                getSharedPreferences("launcher_prefs", MODE_PRIVATE).edit()
                    .putString("custom_banners", data).apply();
            } catch (Exception e) {}
        }

        @JavascriptInterface
        public String getSavedFilters() {
            try {
                return getSharedPreferences("launcher_prefs", MODE_PRIVATE)
                    .getString("custom_banners", "");
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public void saveWallpaper(String dataUrl) {
            try {
                WallpaperManager.saveWallpaper(MainActivity.this, dataUrl);
            } catch (Exception e) {}
        }

        @JavascriptInterface
        public String getSavedWallpaper() {
            try {
                return WallpaperManager.getSavedWallpaper(MainActivity.this);
            } catch (Exception e) { return ""; }
        }

        @JavascriptInterface
        public String getMemoryInfo() {
            try {
                android.app.ActivityManager am = (android.app.ActivityManager)
                    getSystemService(android.content.Context.ACTIVITY_SERVICE);
                android.app.ActivityManager.MemoryInfo mi = new android.app.ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                long avail = mi.availMem  / (1024 * 1024);
                long total = mi.totalMem  / (1024 * 1024);
                return "{\"avail\":" + avail + ",\"total\":" + total + "}";
            } catch(Exception e) { return "{\"avail\":0,\"total\":0}"; }
        }

        @JavascriptInterface
        public int boostDevice() {
            // تنظيف حقيقي: طلب GC + killBackgroundProcesses
            int freedMB = 0;
            try {
                Runtime rt = Runtime.getRuntime();
                long before = rt.totalMemory() - rt.freeMemory();
                rt.gc();
                System.gc();
                long after = rt.totalMemory() - rt.freeMemory();
                freedMB = (int)((before - after) / (1024 * 1024));
                if(freedMB < 0) freedMB = 0;
            } catch(Exception e) {}
            // محاولة killBackgroundProcesses (تحتاج KILL_BACKGROUND_PROCESSES permission)
            try {
                android.app.ActivityManager am = (android.app.ActivityManager)
                    getSystemService(android.content.Context.ACTIVITY_SERVICE);
                PackageManager pm = getPackageManager();
                Intent intent = new Intent(Intent.ACTION_MAIN, null);
                intent.addCategory(Intent.CATEGORY_LAUNCHER);
                java.util.List<android.app.ActivityManager.RunningAppProcessInfo> procs =
                    am.getRunningAppProcesses();
                if(procs != null) {
                    for(android.app.ActivityManager.RunningAppProcessInfo p : procs) {
                        if(p.importance > android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_SERVICE) {
                            for(String pkg : p.pkgList) {
                                if(!pkg.equals("com.mytv.launcher")) {
                                    try { am.killBackgroundProcesses(pkg); } catch(Exception ke) {}
                                }
                            }
                        }
                    }
                }
            } catch(Exception e) {}
            return freedMB;
        }

        @JavascriptInterface
        public boolean isWifiConnected() {
            try {
                android.net.ConnectivityManager cm = (android.net.ConnectivityManager)
                    getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
                android.net.NetworkInfo ni = cm.getActiveNetworkInfo();
                return ni != null && ni.isConnected();
            } catch(Exception e) { return false; }
        }

        @JavascriptInterface
        public boolean hasNotificationAccess() {
            return isNotificationListenerGranted();
        }

        @JavascriptInterface
        public void requestNotificationAccess() {
            if (isNotificationListenerGranted()) return;
            try {
                android.content.Intent i = new android.content.Intent(
                    "android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS");
                i.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
            } catch(Exception e) {}
        }

        @JavascriptInterface
        public String getNotifications() {
            try {
                String cached = NotificationService.getCachedNotificationsJson();
                return (cached != null && !cached.isEmpty()) ? cached : "[]";
            } catch(Exception e) { return "[]"; }
        }
@JavascriptInterface
public void uninstallApp(String pkg) {
    try {
        Intent intent = new Intent(Intent.ACTION_DELETE);
        intent.setData(Uri.parse("package:" + pkg));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    } catch (Exception e) {}
}
        @JavascriptInterface
        public void startVoiceSearch() {
            try {
                Intent intent = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL,
                    android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, "ar-SA");
                intent.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "تحدث الآن…");
                startActivityForResult(intent, 9001);
            } catch (Exception e) {
                webView.post(new Runnable(){
                    public void run(){ webView.evaluateJavascript("closeVoice()", null); }
                });
            }
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
if (refreshReceiver == null) {
            refreshReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context ctx, Intent intent) {
                    if (webView != null) {
                        webView.post(new Runnable() {
                            public void run() {
                                webView.evaluateJavascript(
                                    "(function(){if(typeof loadApps==='function')loadApps();})()", null);
                            }
                        });
                    }
                }
            };
        }
        IntentFilter filter = new IntentFilter("com.mytv.launcher.REFRESH_APPS");
        registerReceiver(refreshReceiver, filter);        if (webView != null) { webView.onResume(); webView.requestFocus(); }
        // notification check handled in onCreate
        try {
            getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        } catch (Exception e) {}
    }

    private void checkNotifAccess() {
        try {
            if (!isNotificationListenerGranted() && !hasPromptedNotificationAccess) {
                if (webView != null) {
                    webView.post(new Runnable() { public void run() {
                        webView.evaluateJavascript(
                            "(function(){if(typeof askNotifPerm==='function')askNotifPerm();})()", null);
                    }});
                }
            }
        } catch(Exception e) {}
    }

@Override protected void onPause() {
    super.onPause();
    if (webView != null) webView.onPause();
    try {
        if (refreshReceiver != null) unregisterReceiver(refreshReceiver);
    } catch (Exception e) {}
}    @Override protected void onDestroy() { super.onDestroy(); if(webView!=null){webView.destroy();webView=null;} }
}
